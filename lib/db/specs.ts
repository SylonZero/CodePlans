import { createdBy, editedBy, type ArtifactActor } from './attribution'
import { and, eq, inArray, isNull, or } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './index'
import { assets, codePlans, codePlanAssets, products, specs, specLinks, specEvents, workItems, workItemCodePlans } from './schema'
import { productAccessWhere } from './queries'

export const specTargetType = z.enum(['asset', 'work_item', 'code_plan'])
export const specRelationshipType = z.enum(['creates', 'revises', 'references'])
export const specInput = z.object({
  productId: z.string().min(1), title: z.string().trim().min(1).max(500),
  body: z.string().max(500_000), specType: z.string().trim().min(1).max(100),
  area: z.string().trim().max(500).optional(),
  sourceType: z.enum(['native', 'git_import']).default('native'),
  sourceUrl: z.string().url().refine((s) => /^https?:\/\//.test(s), 'Use an HTTP(S) source URL').optional(),
})
export const specUpdateFields = {
  title: z.string().trim().min(1).max(500).optional(),
  specType: z.string().trim().min(1).max(100).optional(),
  area: z.string().trim().max(500).nullable().optional(),
  needsReview: z.boolean().optional(),
  body: z.string().max(500_000).optional(),
  status: z.enum(['draft', 'active', 'archived']).optional(),
  expectedVersion: z.number().int().positive().optional(),
}
export const specUpdateInput = z.object(specUpdateFields).refine((d) => Object.entries(d).some(([key, value]) => key !== 'expectedVersion' && value !== undefined), 'Provide body or status or metadata')
export type SpecTargetType = z.infer<typeof specTargetType>
export type SpecRelationshipType = z.infer<typeof specRelationshipType>
export type Spec = typeof specs.$inferSelect
export type SpecLink = typeof specLinks.$inferSelect
export type SpecDb = Pick<typeof db, 'select' | 'insert' | 'update' | 'delete'>

export async function assertSpecProductAccess(userId: string, productId: string) {
  const [row] = await db.select({ id: products.id }).from(products)
    .where(and(eq(products.id, productId), await productAccessWhere(userId)))
  if (!row) throw new Error('Product not found or not accessible')
}

export async function requireSpec(id: string, d: SpecDb = db) {
  const [row] = await d.select().from(specs).where(eq(specs.id, id))
  if (!row) throw new Error('Spec not found')
  return row
}

export async function requireSpecTarget(targetType: SpecTargetType, targetId: string, d: SpecDb = db) {
  const table = targetType === 'asset' ? assets : targetType === 'code_plan' ? codePlans : workItems
  const [row] = await d.select({ id: table.id, productId: table.productId }).from(table).where(eq(table.id, targetId))
  if (!row) throw new Error('Spec target not found')
  return row
}

// Used for history and Record. Resolve associations live; freeze them when emitting events.
export async function specAssetAnchors(spec: Spec, links: SpecLink[], d: SpecDb = db) {
  const anchors = new Map<string, { assetId: string; planId?: string; workItemId?: string }>()
  for (const link of links) {
    let candidates: { assetId: string | null; planId?: string; workItemId?: string }[] = []
    if (link.targetType === 'asset') candidates = [{ assetId: link.targetId }]
    if (link.targetType === 'code_plan') {
      candidates = (await d.select({ assetId: codePlanAssets.assetId }).from(codePlanAssets)
        .where(eq(codePlanAssets.codePlanId, link.targetId))).map((r) => ({ ...r, planId: link.targetId }))
    }
    if (link.targetType === 'work_item') {
      candidates = (await d.select({ assetId: workItems.assetId }).from(workItems)
        .where(and(eq(workItems.id, link.targetId), eq(workItems.productId, spec.productId))))
        .map((r) => ({ ...r, workItemId: link.targetId }))
      const viaPlans = await d.select({ assetId: codePlanAssets.assetId, planId: codePlanAssets.codePlanId })
        .from(workItemCodePlans).innerJoin(codePlanAssets, eq(workItemCodePlans.codePlanId, codePlanAssets.codePlanId))
        .where(eq(workItemCodePlans.workItemId, link.targetId))
      candidates.push(...viaPlans.map((r) => ({ ...r, workItemId: link.targetId })))
    }
    for (const candidate of candidates) {
      if (!candidate.assetId || anchors.has(candidate.assetId)) continue
      const [asset] = await d.select({ id: assets.id }).from(assets)
        .where(and(eq(assets.id, candidate.assetId), eq(assets.productId, spec.productId)))
      if (asset) anchors.set(asset.id, { ...candidate, assetId: asset.id })
    }
  }
  return [...anchors.values()]
}

export async function emitSpecEvents(d: SpecDb, spec: Spec, links: SpecLink[], kind: 'spec_linked' | 'spec_updated', fromVersion?: number, noteId?: string) {
  const anchors = await specAssetAnchors(spec, links, d)
  if (!anchors.length) return []
  return d.insert(specEvents).values(anchors.map((a) => ({
    ...a, specId: spec.id, specTitle: spec.title, specType: spec.specType,
    kind, fromVersion, toVersion: spec.version, noteId,
  }))).returning()
}

export async function createSpec(input: z.input<typeof specInput>, userId: string, authorType: 'user' | 'agent' = 'user') {
  const data = specInput.parse(input)
  if (data.sourceType === 'git_import' && !data.sourceUrl) throw new Error('Git imports require sourceUrl')
  await assertSpecProductAccess(userId, data.productId)
  const [row] = await db.insert(specs).values({ ...data, authorType, ...createdBy({ id: userId, kind: authorType }) }).returning()
  return row
}

// Compare-and-swap protects concurrent edits and keeps version/event snapshots consistent.
export async function reviseSpec(d: SpecDb, id: string, input: z.input<typeof specUpdateInput>, noteId?: string, actor?: ArtifactActor) {
  const data = specUpdateInput.parse(input)
  const old = await requireSpec(id, d)
  if (old.status === 'superseded') throw new Error('Superseded specs are read-only')
  if (data.expectedVersion !== undefined && old.version !== data.expectedVersion) throw new Error('Spec changed; reload before saving')
  const [row] = await d.update(specs).set({
    ...(data.title !== undefined ? { title: data.title } : {}),
    ...(data.specType !== undefined ? { specType: data.specType } : {}),
    ...(data.area !== undefined ? { area: data.area } : {}),
    ...(data.needsReview !== undefined ? { needsReview: data.needsReview } : {}),
    ...(data.body !== undefined ? { body: data.body } : {}),
    ...(data.status !== undefined ? { status: data.status } : {}),
    ...editedBy(actor), version: old.version + 1, updatedAt: new Date(),
  }).where(and(eq(specs.id, id), eq(specs.version, old.version), eq(specs.status, old.status))).returning()
  if (!row) throw new Error('Spec changed; reload before saving')
  const links = await d.select().from(specLinks).where(eq(specLinks.specId, id))
  const events = await emitSpecEvents(d, row, links, 'spec_updated', old.version, noteId)
  return { spec: row, events }
}

export async function updateSpec(id: string, input: z.input<typeof specUpdateInput>, userId: string, actorKind: 'user' | 'agent' = 'user') {
  const old = await requireSpec(id)
  await assertSpecProductAccess(userId, old.productId)
  return db.transaction(async (tx) => (await reviseSpec(tx, id, input, undefined, { id: userId, kind: actorKind })).spec)
}

export async function linkSpecInTransaction(d: SpecDb, specId: string, targetType: SpecTargetType, targetId: string, relationshipType?: SpecRelationshipType) {
  specTargetType.parse(targetType)
  if (relationshipType) specRelationshipType.parse(relationshipType)
  if (targetType !== 'code_plan' && relationshipType) throw new Error('Relationships apply only to code plans')
  const spec = await requireSpec(specId, d)
  const target = await requireSpecTarget(targetType, targetId, d)
  if (target.productId !== spec.productId) throw new Error('Specs and targets must belong to the same product')
  const [created] = await d.insert(specLinks).values({ specId, targetType, targetId,
    relationshipType: targetType === 'code_plan' ? relationshipType ?? 'references' : null,
  }).onConflictDoNothing().returning()
  if (created) {
    await emitSpecEvents(d, spec, [created], 'spec_linked')
    return created
  }
  const [existing] = await d.select().from(specLinks).where(and(eq(specLinks.specId, specId), eq(specLinks.targetType, targetType), eq(specLinks.targetId, targetId)))
  if (targetType === 'code_plan' && relationshipType && existing.relationshipType !== relationshipType) {
    throw new Error('This link has a different relationship; unlink it before changing the relationship')
  }
  return existing
}

export async function linkSpec(specId: string, targetType: SpecTargetType, targetId: string, relationshipType: SpecRelationshipType | undefined, userId: string) {
  await assertSpecProductAccess(userId, (await requireSpec(specId)).productId)
  return db.transaction((tx) => linkSpecInTransaction(tx, specId, targetType, targetId, relationshipType))
}

export async function unlinkSpec(specLinkId: string, userId: string) {
  const [link] = await db.select().from(specLinks).where(eq(specLinks.id, specLinkId))
  if (!link) throw new Error('Spec link not found')
  await assertSpecProductAccess(userId, (await requireSpec(link.specId)).productId)
  await db.delete(specLinks).where(eq(specLinks.id, specLinkId))
  return { id: specLinkId }
}

export async function supersedeSpec(oldId: string, newBody: string, title: string | undefined, userId: string, authorType: 'user' | 'agent' = 'user') {
  const old = await requireSpec(oldId)
  await assertSpecProductAccess(userId, old.productId)
  const data = specInput.parse({ ...old, area: old.area ?? undefined, sourceUrl: old.sourceUrl ?? undefined, title: title ?? old.title, body: newBody })
  return db.transaction(async (tx) => {
    if (old.status === 'superseded' || old.supersededBy) throw new Error('Spec is already superseded')
    const [next] = await tx.insert(specs).values({ ...data, ...createdBy({ id: userId, kind: authorType }), supersedes: oldId, authorType, needsReview: old.needsReview }).returning()
    const [changed] = await tx.update(specs).set({ status: 'superseded', supersededBy: next.id, ...editedBy({ id: userId, kind: authorType }), updatedAt: new Date() })
      .where(and(eq(specs.id, oldId), eq(specs.version, old.version), isNull(specs.supersededBy))).returning()
    if (!changed) throw new Error('Spec changed; reload before superseding')
    // Preserve old links as history and associate the replacement with the same targets.
    const links = await tx.select().from(specLinks).where(eq(specLinks.specId, oldId))
    for (const link of links) await linkSpecInTransaction(tx, next.id, link.targetType as SpecTargetType, link.targetId, link.relationshipType as SpecRelationshipType | undefined)
    return next
  })
}

export async function getSpec(id: string, userId: string) {
  const spec = await requireSpec(id)
  await assertSpecProductAccess(userId, spec.productId)
  const links = await db.select().from(specLinks).where(eq(specLinks.specId, id))
  return { ...spec, links }
}

export async function listSpecs(userId: string, filters: { productId?: string; targetType?: SpecTargetType; targetId?: string; specType?: string } = {}) {
  if (!!filters.targetType !== !!filters.targetId) throw new Error('Provide targetType and targetId together')
  const rows = await db.select({ spec: specs }).from(specs).innerJoin(products, eq(specs.productId, products.id))
    .where(and(await productAccessWhere(userId), filters.productId ? eq(specs.productId, filters.productId) : undefined,
      filters.specType ? eq(specs.specType, filters.specType) : undefined)).orderBy(specs.specType, specs.title)
  const links = rows.length ? await db.select().from(specLinks).where(inArray(specLinks.specId, rows.map((r) => r.spec.id))) : []
  return rows.map(({ spec }) => ({ ...spec, links: links.filter((l) => l.specId === spec.id) }))
    .filter((s) => !filters.targetType || s.links.some((l) => l.targetType === filters.targetType && l.targetId === filters.targetId))
}

export async function getAssetSpecs(assetId: string, userId: string) {
  const target = await requireSpecTarget('asset', assetId)
  await assertSpecProductAccess(userId, target.productId)
  const [all, plans, items, viaPlanItems] = await Promise.all([
    listSpecs(userId, { productId: target.productId }),
    db.select({ id: codePlanAssets.codePlanId }).from(codePlanAssets).where(eq(codePlanAssets.assetId, assetId)),
    db.select({ id: workItems.id }).from(workItems).where(eq(workItems.assetId, assetId)),
    db.select({ id: workItemCodePlans.workItemId }).from(workItemCodePlans)
      .innerJoin(codePlanAssets, eq(workItemCodePlans.codePlanId, codePlanAssets.codePlanId)).where(eq(codePlanAssets.assetId, assetId)),
  ])
  const planIds = new Set(plans.map((p) => p.id))
  const itemIds = new Set([...items, ...viaPlanItems].map((i) => i.id))
  return all.filter((s) => s.links.some((l) => l.targetType === 'asset' ? l.targetId === assetId
    : l.targetType === 'code_plan' ? planIds.has(l.targetId) : itemIds.has(l.targetId)))
}

/** A plan/item can acquire an asset after its spec was linked. Record that arrival once. */
export async function refreshSpecAssetLinks(targetType: 'code_plan' | 'work_item', targetId: string) {
  const relatedItems = targetType === 'code_plan'
    ? await db.select({ id: workItemCodePlans.workItemId }).from(workItemCodePlans).where(eq(workItemCodePlans.codePlanId, targetId)) : []
  const links = await db.select().from(specLinks).where(or(
    and(eq(specLinks.targetType, targetType), eq(specLinks.targetId, targetId)),
    relatedItems.length ? and(eq(specLinks.targetType, 'work_item'), inArray(specLinks.targetId, relatedItems.map((r) => r.id))) : undefined,
  ))
  if (!links.length) return
  await db.transaction(async (tx) => {
    for (const specId of new Set(links.map((l) => l.specId))) {
      const spec = await requireSpec(specId, tx)
      const anchors = await specAssetAnchors(spec, links.filter((l) => l.specId === specId), tx)
      const previous = await tx.select({ assetId: specEvents.assetId }).from(specEvents)
        .where(and(eq(specEvents.specId, specId), eq(specEvents.kind, 'spec_linked')))
      const missing = anchors.filter((a) => !previous.some((p) => p.assetId === a.assetId))
      if (missing.length) await tx.insert(specEvents).values(missing.map((a) => ({
        ...a, specId, specTitle: spec.title, specType: spec.specType, kind: 'spec_linked', toVersion: spec.version,
      })))
    }
  })
}
