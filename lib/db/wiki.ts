import { cache } from 'react'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from './index'
import { productAccessWhere } from './queries'
import {
  products,
  assets,
  specs,
  specLinks,
  specEvents,
  codePlans,
  codePlanAssets,
  workItems,
  workItemCodePlans,
  assetDesignLog,
  assetCapabilities,
  releases,
  releaseAssets,
  assetOwners,
  assetDependencies,
  users,
} from './schema'
import { effectiveLayer } from '@/lib/types'
import {
  type WikiData,
  type WikiDocument,
  type WikiAssociation,
  type WikiActivity,
} from '@/lib/wiki/model'

/** One permission check before any content load. All graph edges are constrained to this product.
 * Batched reads avoid a query per asset/document. Bodies remain on the server; lists send excerpts.
 */
export const getWikiProduct = cache(
  async (slug: string, userId: string): Promise<WikiData | null> => {
    const [product] = await db
      .select()
      .from(products)
      .where(and(eq(products.slug, slug), await productAccessWhere(userId)))
    if (!product) return null
    const [assetRows, specRows, planRows, itemRows, releaseRows] =
      await Promise.all([
        db.select().from(assets).where(eq(assets.productId, product.id)),
        db.select().from(specs).where(eq(specs.productId, product.id)),
        db.select().from(codePlans).where(eq(codePlans.productId, product.id)),
        db.select().from(workItems).where(eq(workItems.productId, product.id)),
        db.select().from(releases).where(eq(releases.productId, product.id)),
      ])
    const aids = assetRows.map((a) => a.id),
      pids = planRows.map((p) => p.id),
      sids = specRows.map((s) => s.id),
      iids = itemRows.map((i) => i.id),
      rids = releaseRows.map((r) => r.id)
    const [links, pa, ip, notes, caps, stamps, owners, edges, events] =
      await Promise.all([
        sids.length
          ? db.select().from(specLinks).where(inArray(specLinks.specId, sids))
          : [],
        pids.length
          ? db
              .select()
              .from(codePlanAssets)
              .where(inArray(codePlanAssets.codePlanId, pids))
          : [],
        iids.length
          ? db
              .select()
              .from(workItemCodePlans)
              .where(inArray(workItemCodePlans.workItemId, iids))
          : [],
        aids.length
          ? db
              .select()
              .from(assetDesignLog)
              .where(inArray(assetDesignLog.assetId, aids))
          : [],
        aids.length
          ? db
              .select()
              .from(assetCapabilities)
              .where(inArray(assetCapabilities.assetId, aids))
          : [],
        rids.length
          ? db
              .select()
              .from(releaseAssets)
              .where(inArray(releaseAssets.releaseId, rids))
          : [],
        aids.length
          ? db
              .select()
              .from(assetOwners)
              .where(inArray(assetOwners.assetId, aids))
          : [],
        aids.length
          ? db
              .select()
              .from(assetDependencies)
              .where(
                and(
                  inArray(assetDependencies.sourceAssetId, aids),
                  inArray(assetDependencies.targetAssetId, aids),
                ),
              )
          : [],
        aids.length
          ? db
              .select()
              .from(specEvents)
              .where(inArray(specEvents.assetId, aids))
          : [],
      ])
    const allRows = [
      ...assetRows,
      ...specRows,
      ...planRows,
      ...itemRows,
      ...releaseRows,
      ...notes,
      ...caps,
    ]
    const uids = [
      ...new Set(
        [
          ...allRows.flatMap((r) => [r.createdById, r.updatedById]),
          ...planRows.map((r) => r.creatorId),
          ...releaseRows.map((r) => r.creatorId),
          ...itemRows.map((r) => r.reporterId),
          ...notes.map((r) => r.authorId),
          ...owners.map((r) => r.userId),
        ].filter((id): id is string => !!id),
      ),
    ]
    const people = uids.length
      ? await db
          .select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, uids))
      : []
    const person = (id?: string | null) =>
      people.find((u) => u.id === id)?.name || null
    const date = (d: Date | null | undefined) => d?.toISOString() ?? ''
    const meta = (
      r: (typeof allRows)[number],
      fallback?: string | null,
      fallbackKind?: string,
    ) => ({
      createdAt: date(r.createdAt),
      updatedAt: date(r.updatedAt),
      createdBy: person(r.createdById ?? fallback),
      updatedBy: person(r.updatedById),
      createdByKind: r.createdByKind ?? fallbackKind,
      updatedByKind: r.updatedByKind,
    })
    const aset = new Set(aids),
      pmap = new Map(planRows.map((p) => [p.id, p])),
      imap = new Map(itemRows.map((i) => [i.id, i]))
    const direct = (id: string): WikiAssociation[] =>
      aset.has(id) ? [{ assetId: id, label: 'Direct association' }] : []
    const planAssociations = (id: string): WikiAssociation[] =>
      pa
        .filter((a) => a.codePlanId === id && aset.has(a.assetId))
        .map((a) => ({
          assetId: a.assetId,
          via: `plan:${id}`,
          label: `Plan: ${pmap.get(id)?.title ?? 'Plan'}`,
        }))
    const itemAssociations = (id: string): WikiAssociation[] => {
      const item = imap.get(id)
      if (!item) return []
      return [
        ...(item.assetId
          ? direct(item.assetId).map((a) => ({
              ...a,
              via: `work-item:${id}`,
              label: `Work item: ${item.title}`,
            }))
          : []),
        ...ip
          .filter((l) => l.workItemId === id && pmap.has(l.codePlanId))
          .flatMap((l) =>
            planAssociations(l.codePlanId).map((a) => ({
              ...a,
              label: `Work item: ${item.title} → ${a.label}`,
            })),
          ),
      ]
    }
    const unique = (aa: WikiAssociation[]) => [
      ...new Map(
        aa.map((a) => [`${a.assetId}:${a.via ?? ''}:${a.label}`, a]),
      ).values(),
    ]
    const docs: WikiDocument[] = []
    const push = (d: WikiDocument) =>
      docs.push({
        ...d,
        associations: unique(d.associations),
        related: [...new Set(d.related)],
      })
    for (const a of assetRows) {
      const common = {
        id: a.id,
        status: a.status,
        area: a.layer,
        tags: [...a.tags, a.repoPath ?? ''],
        ...meta(a),
        associations: direct(a.id),
        related: [],
        editUrl: `/assets/${a.id}`,
      }
      push({
        ...common,
        key: `asset:${a.id}`,
        kind: 'asset',
        title: a.name,
        body: a.description,
      })
      if (a.notes?.trim())
        push({
          ...common,
          key: `asset-notes:${a.id}`,
          kind: 'asset-notes',
          title: `${a.name} — Notes`,
          body: a.notes,
        })
    }
    for (const p of planRows)
      push({
        key: `plan:${p.id}`,
        id: p.id,
        kind: 'plan',
        title: p.title,
        body: p.description,
        status: p.status,
        tags: p.tags,
        ...meta(p, p.creatorId),
        associations: planAssociations(p.id),
        related: [
          ...ip
            .filter((l) => l.codePlanId === p.id)
            .map((l) => `work-item:${l.workItemId}`),
          ...(p.releaseId ? [`release:${p.releaseId}`] : []),
        ],
        sourceUrl: p.specUrl,
        editUrl: `/plans/${p.id}`,
      })
    for (const i of itemRows)
      push({
        key: `work-item:${i.id}`,
        id: i.id,
        kind: 'work-item',
        title: i.title,
        body: i.description,
        status: i.status,
        area: i.area,
        tags: [...i.tags, i.type, i.severity],
        ...meta(i, i.reporterId),
        associations: itemAssociations(i.id),
        related: ip
          .filter((l) => l.workItemId === i.id)
          .map((l) => `plan:${l.codePlanId}`),
        sourceUrl: i.externalUrl ?? i.specUrl,
        editUrl: `/work-items?item=${i.id}`,
      })
    for (const s of specRows) {
      const ls = links.filter((l) => l.specId === s.id)
      push({
        key: `spec:${s.id}`,
        id: s.id,
        kind: 'spec',
        title: s.title,
        body: s.body,
        status: s.status,
        area: s.area,
        tags: [],
        ...meta(s, undefined, s.authorType),
        version: s.version,
        specType: s.specType,
        sourceUrl: s.sourceUrl,
        sourceType: s.sourceType,
        needsReview: s.needsReview,
        placeholder:
          s.body === 'Content not yet imported — see sourceUrl.' ||
          !s.body.trim(),
        supersedes: s.supersedes,
        supersededBy: s.supersededBy,
        associations: ls.flatMap((l) =>
          (l.targetType === 'asset'
            ? direct(l.targetId)
            : l.targetType === 'code_plan'
              ? planAssociations(l.targetId)
              : itemAssociations(l.targetId)
          ).map((a) => ({
            ...a,
            relationship: l.relationshipType ?? undefined,
          })),
        ),
        related: ls.map(
          (l) =>
            `${l.targetType === 'code_plan' ? 'plan' : l.targetType === 'work_item' ? 'work-item' : 'asset'}:${l.targetId}`,
        ),
        editUrl: `/specs/${s.id}`,
      })
    }
    for (const n of notes)
      push({
        key: `note:${n.id}`,
        id: n.id,
        kind: 'note',
        title: n.title,
        body: n.body,
        status: 'recorded',
        tags: [],
        ...meta(n, n.authorId, n.authorKind),
        associations: direct(n.assetId),
        related: [
          ...(n.codePlanId ? [`plan:${n.codePlanId}`] : []),
          ...(n.releaseId ? [`release:${n.releaseId}`] : []),
        ],
        editUrl: `/assets/${n.assetId}`,
      })
    for (const c of caps)
      push({
        key: `capability:${c.id}`,
        id: c.id,
        kind: 'capability',
        title: c.title,
        body: c.description,
        status: c.status,
        area: c.area,
        tags: [],
        ...meta(c),
        associations: direct(c.assetId),
        related: [
          ...(c.sourceSpecId ? [`spec:${c.sourceSpecId}`] : []),
          ...(c.originWorkItemId ? [`work-item:${c.originWorkItemId}`] : []),
          ...(c.originCodePlanId ? [`plan:${c.originCodePlanId}`] : []),
          ...(c.originReleaseId ? [`release:${c.originReleaseId}`] : []),
        ],
        editUrl: `/assets/${c.assetId}`,
      })
    for (const r of releaseRows)
      push({
        key: `release:${r.id}`,
        id: r.id,
        kind: 'release',
        title: r.name,
        body: r.description,
        status: r.status,
        tags: r.tags,
        ...meta(r, r.creatorId),
        associations: [
          ...stamps
            .filter((s) => s.releaseId === r.id)
            .flatMap((s) => direct(s.assetId)),
          ...planRows
            .filter((p) => p.releaseId === r.id)
            .flatMap((p) => planAssociations(p.id)),
        ],
        related: planRows
          .filter((p) => p.releaseId === r.id)
          .map((p) => `plan:${p.id}`),
        editUrl: `/releases/${r.id}`,
      })
    for (const d of docs)
      d.searchContext = [
        ...new Set(
          d.associations.flatMap((a) => {
            const asset = assetRows.find((x) => x.id === a.assetId)
            return asset ? [asset.name, asset.repoPath ?? ''] : []
          }),
        ),
      ].join(' ')
    const dmap = new Map(docs.map((d) => [d.key, d]))
    for (const d of docs) {
      d.related = d.related.filter((k) => dmap.has(k))
      for (const k of d.related) {
        const target = dmap.get(k)!
        if (!target.related.includes(d.key)) target.related.push(d.key)
      }
    }
    const activity: WikiActivity[] = []
    // Link bursts (especially imports) become expandable summaries, never fake document edits.
    const eventGroups = new Map<string, typeof events>()
    for (const e of events) {
      if (!dmap.has(`spec:${e.specId}`)) continue
      const key = `${e.assetId}:${date(e.createdAt).slice(0, 10)}:${e.kind}`
      eventGroups.set(key, [...(eventGroups.get(key) ?? []), e])
    }
    for (const [key, group] of eventGroups) {
      const keys = [...new Set(group.map((e) => `spec:${e.specId}`))]
      activity.push({
        id: key,
        title:
          group[0].kind === 'spec_linked'
            ? `${keys.length} spec${keys.length === 1 ? '' : 's'} associated`
            : `${keys.length} spec${keys.length === 1 ? '' : 's'} revised`,
        date: group
          .map((e) => date(e.createdAt))
          .sort()
          .at(-1)!,
        kind: group[0].kind,
        assetIds: [group[0].assetId],
        documentKeys: keys,
        count: group.length,
      })
    }
    for (const d of docs.filter(
      (d) =>
        d.kind === 'note' ||
        (d.kind === 'plan' && d.status === 'completed') ||
        (d.kind === 'work-item' && d.status === 'resolved'),
    ))
      activity.push({
        id: d.key,
        title: d.title,
        date: d.kind === 'note' ? d.createdAt : d.updatedAt,
        kind:
          d.kind === 'note'
            ? 'Design decision'
            : d.kind === 'plan'
              ? 'Completed plan (record updated)'
              : 'Resolved work (record updated)',
        assetIds: [...new Set(d.associations.map((a) => a.assetId))],
        documentKeys: [d.key],
      })
    for (const r of releaseRows.filter((r) => r.status === 'shipped'))
      activity.push({
        id: `release:${r.id}`,
        title: r.name,
        date: date(r.shippedAt),
        kind: 'Shipped release',
        assetIds: dmap
          .get(`release:${r.id}`)!
          .associations.map((a) => a.assetId),
        documentKeys: [`release:${r.id}`],
      })
    return {
      product: {
        id: product.id,
        name: product.name,
        slug: product.slug,
        description: product.description,
      },
      documents: docs.sort(
        (a, b) =>
          b.updatedAt.localeCompare(a.updatedAt) || a.key.localeCompare(b.key),
      ),
      assets: assetRows
        .map((a) => {
          const shipped = stamps
            .filter(
              (s) =>
                s.assetId === a.id &&
                s.version &&
                releaseRows.some(
                  (r) => r.id === s.releaseId && r.status === 'shipped',
                ),
            )
            .sort((a, b) =>
              date(
                releaseRows.find((r) => r.id === b.releaseId)?.shippedAt,
              ).localeCompare(
                date(releaseRows.find((r) => r.id === a.releaseId)?.shippedAt),
              ),
            )[0]
          return {
            id: a.id,
            name: a.name,
            type: a.type,
            layer: effectiveLayer(a.type, a.layer),
            explicitLayer: !!a.layer,
            status: a.status,
            health: a.health,
            repositoryUrl: a.repositoryUrl,
            repoPath: a.repoPath,
            documentationUrl: a.documentationUrl,
            owners: owners
              .filter((o) => o.assetId === a.id)
              .map((o) => person(o.userId) ?? 'User no longer available'),
            version: shipped?.version ?? undefined,
            shippedAt: shipped
              ? date(
                  releaseRows.find((r) => r.id === shipped.releaseId)
                    ?.shippedAt,
                )
              : undefined,
          }
        })
        .sort((a, b) => a.name.localeCompare(b.name)),
      dependencies: edges,
      activity: activity.sort((a, b) => b.date.localeCompare(a.date)),
      receipts: caps
        .filter((c) => c.sourceSpecId && c.sourceSpecVersion)
        .map((c) => ({
          assetId: c.assetId,
          specId: c.sourceSpecId!,
          version: c.sourceSpecVersion!,
          capabilityKey: `capability:${c.id}`,
          removed: c.status === 'removed',
        })),
    }
  },
)
