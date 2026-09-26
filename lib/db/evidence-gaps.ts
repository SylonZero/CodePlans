import { and, eq, inArray, isNull, lte } from 'drizzle-orm'
import { db } from './index'
import {
  assetCapabilities, assetOwners, assets, codePlanAssets, codePlans, productMembers, releaseAssets, releases, specLinks, specs, workItems,
} from './schema'
import { isApprovedNow, lastApprovedVersion } from './review-state'
import { getWorkflowLevel } from './workflow'

/**
 * Missing evidence, made actionable: checks that find records whose delivery
 * story is incomplete and route each to the person who can fix it. They never
 * infer success — a gap stays until someone supplies the evidence.
 */

export type EvidenceGapKind =
  | 'plan_without_pr'
  | 'release_missing_version'
  | 'ungraduated_feature'
  | 'plan_spec_unapproved'
  | 'spec_unapproved'

export type EvidenceGap = {
  key: string
  kind: EvidenceGapKind
  title: string
  detail: string
  url: string
  productId: string
  /** Who should act, with the responsibility that makes it theirs. */
  responsible: { userId: string; reason: string }[]
}

export const EVIDENCE_GAP_LABELS: Record<EvidenceGapKind, string> = {
  plan_without_pr: 'Completed without a PR',
  release_missing_version: 'Missing version stamp',
  ungraduated_feature: 'Not graduated',
  plan_spec_unapproved: 'Spec changed since approval',
  spec_unapproved: 'Active without approval',
}

const GRADUATION_GRACE_DAYS = 7

async function ownersByAsset(assetIds: string[]) {
  const map = new Map<string, string[]>()
  if (!assetIds.length) return map
  for (const r of await db.select().from(assetOwners).where(inArray(assetOwners.assetId, assetIds))) {
    map.set(r.assetId, [...(map.get(r.assetId) ?? []), r.userId])
  }
  return map
}

async function membersByProduct(productIds: string[], responsibility: 'eng_manager' | 'architect') {
  const map = new Map<string, string[]>()
  if (!productIds.length) return map
  for (const r of await db.select().from(productMembers).where(and(inArray(productMembers.productId, productIds), eq(productMembers.responsibility, responsibility)))) {
    map.set(r.productId, [...(map.get(r.productId) ?? []), r.userId])
  }
  return map
}

export async function getEvidenceGaps(productIds: string[]): Promise<EvidenceGap[]> {
  if (!productIds.length) return []
  const gaps: EvidenceGap[] = []
  const [ems, architects] = await Promise.all([membersByProduct(productIds, 'eng_manager'), membersByProduct(productIds, 'architect')])

  // 1. A completed plan with an asset that never recorded a PR.
  const completed = await db.select({ plan: codePlans, assetName: assets.name }).from(codePlanAssets)
    .innerJoin(codePlans, eq(codePlanAssets.codePlanId, codePlans.id)).innerJoin(assets, eq(codePlanAssets.assetId, assets.id))
    .where(and(inArray(codePlans.productId, productIds), eq(codePlans.status, 'completed'), eq(codePlanAssets.prStatus, 'none')))
  const byPlan = new Map<string, { plan: typeof codePlans.$inferSelect; names: string[] }>()
  for (const r of completed) byPlan.set(r.plan.id, { plan: r.plan, names: [...(byPlan.get(r.plan.id)?.names ?? []), r.assetName] })
  for (const { plan, names } of byPlan.values()) {
    gaps.push({ key: `plan_without_pr:${plan.id}`, kind: 'plan_without_pr', title: plan.title, detail: `No PR recorded for ${names.join(', ')}`,
      url: `/plans/${plan.id}`, productId: plan.productId, responsible: [{ userId: plan.ownerId ?? plan.creatorId, reason: plan.ownerId ? 'plan_owner' : 'author' }] })
  }

  // 2. A release being assembled with an asset that has no version stamp.
  const unstamped = await db.select({ release: releases, assetId: releaseAssets.assetId, assetName: assets.name }).from(releaseAssets)
    .innerJoin(releases, eq(releaseAssets.releaseId, releases.id)).innerJoin(assets, eq(releaseAssets.assetId, assets.id))
    .where(and(inArray(releases.productId, productIds), inArray(releases.status, ['planned', 'in_progress']), isNull(releaseAssets.version)))
  const unstampedOwners = await ownersByAsset(unstamped.map((r) => r.assetId))
  for (const r of unstamped) {
    gaps.push({ key: `release_missing_version:${r.release.id}:${r.assetId}`, kind: 'release_missing_version', title: r.release.name,
      detail: `${r.assetName} has no version stamp`, url: `/releases/${r.release.id}`, productId: r.release.productId,
      responsible: [...(unstampedOwners.get(r.assetId) ?? []).map((userId) => ({ userId, reason: `code_owner:${r.assetName}` })),
        ...(ems.get(r.release.productId) ?? []).map((userId) => ({ userId, reason: 'eng_manager' }))] })
  }

  // 3. Resolved features that never made it into the asset's record.
  const cutoff = new Date(Date.now() - GRADUATION_GRACE_DAYS * 86_400_000)
  const resolved = await db.select({ item: workItems, assetName: assets.name }).from(workItems).innerJoin(assets, eq(workItems.assetId, assets.id))
    .where(and(inArray(workItems.productId, productIds), eq(workItems.status, 'resolved'), inArray(workItems.type, ['feature', 'enhancement']), lte(workItems.updatedAt, cutoff)))
  const graduated = resolved.length
    ? new Set((await db.select({ id: assetCapabilities.originWorkItemId }).from(assetCapabilities).where(inArray(assetCapabilities.originWorkItemId, resolved.map((r) => r.item.id)))).map((r) => r.id))
    : new Set<string | null>()
  const resolvedOwners = await ownersByAsset(resolved.map((r) => r.item.assetId!))
  for (const r of resolved.filter((x) => !graduated.has(x.item.id))) {
    gaps.push({ key: `ungraduated_feature:${r.item.id}`, kind: 'ungraduated_feature', title: r.item.title,
      detail: `Resolved on ${r.assetName} but not in its record`, url: `/assets/${r.item.assetId}`, productId: r.item.productId,
      responsible: (resolvedOwners.get(r.item.assetId!) ?? []).map((userId) => ({ userId, reason: `code_owner:${r.assetName}` })) })
  }

  // 4. An active plan building against a spec whose approval no longer covers it.
  const activePlanSpecs = await db.select({ plan: codePlans, spec: specs }).from(specLinks)
    .innerJoin(codePlans, eq(specLinks.targetId, codePlans.id)).innerJoin(specs, eq(specLinks.specId, specs.id))
    .where(and(eq(specLinks.targetType, 'code_plan'), inArray(codePlans.productId, productIds), eq(codePlans.status, 'active')))
  for (const { plan, spec } of activePlanSpecs) {
    const approved = await lastApprovedVersion('spec', spec.id)
    if (approved === null || (await isApprovedNow('spec', spec.id))) continue
    gaps.push({ key: `plan_spec_unapproved:${plan.id}:${spec.id}`, kind: 'plan_spec_unapproved', title: plan.title,
      detail: `${spec.title} is at v${spec.version}; last approved v${approved}`, url: `/specs/${spec.id}`, productId: plan.productId,
      responsible: [{ userId: plan.ownerId ?? plan.creatorId, reason: 'plan_owner' },
        ...(architects.get(plan.productId) ?? []).map((userId) => ({ userId, reason: 'architect' }))] })
  }

  // 5. In a guided product, an active spec that no approval covers.
  const activeSpecs = await db.select().from(specs).where(and(inArray(specs.productId, productIds), eq(specs.status, 'active')))
  const guided = new Map<string, boolean>()
  for (const spec of activeSpecs) {
    if (!guided.has(spec.productId)) guided.set(spec.productId, (await getWorkflowLevel(spec.productId)).level !== 'open')
    if (!guided.get(spec.productId) || !spec.createdById || (await isApprovedNow('spec', spec.id))) continue
    gaps.push({ key: `spec_unapproved:${spec.id}`, kind: 'spec_unapproved', title: spec.title, detail: `Active at v${spec.version} with no approval covering it`,
      url: `/specs/${spec.id}#review`, productId: spec.productId, responsible: [{ userId: spec.createdById, reason: 'author' }] })
  }
  return gaps
}

/** The gaps a given person should act on, with their reason. */
export async function getEvidenceGapsFor(userId: string, productIds: string[]) {
  return (await getEvidenceGaps(productIds))
    .map((g) => ({ gap: g, reason: g.responsible.find((r) => r.userId === userId)?.reason }))
    .filter((x): x is { gap: EvidenceGap; reason: string } => !!x.reason)
}
