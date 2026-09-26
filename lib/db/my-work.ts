import { and, desc, eq, gt, inArray, isNull, notInArray } from 'drizzle-orm'
import { db } from './index'
import {
  assetCapabilities, assetDependencies, assets, codePlanAssets, codePlans, products, releaseAssets, releases, reviewParticipants, reviews,
  specLinks, specRevisions, specs, syncLog, workItemCodePlans, workItems,
} from './schema'
import { productAccessWhere, getTasks, getOwnedAssets, type OwnedAsset } from './queries'
import { getUserResponsibilities } from './responsibilities'
import { listOpenReviews } from './reviews'
import { OPEN_STATES, isApprovedNow, lastApprovedVersion } from './review-state'
import { listNotifications } from './notifications'
import { getEvidenceGapsFor, EVIDENCE_GAP_LABELS } from './evidence-gaps'
import type { ReviewReason } from './schema.sqlite'

/**
 * My Work as an inbox. Three bands: Needs you (blocked on your action, each
 * with a verb), In flight (your current commitments), Watching (changes to
 * things you're responsible for). Every item says why it is here. State
 * items (reviews, tasks, triage, evidence gaps) are derived on each load;
 * event items (mentions, replies, assignments) come from stored notifications
 * and can be marked done or snoozed.
 */

export { LENS_LABELS, reasonLabel, type Lens } from '@/lib/my-work-labels'
import type { Lens } from '@/lib/my-work-labels'

export type InboxItem = {
  key: string
  kind: 'review' | 'changes_requested' | 'notification' | 'triage' | 'evidence_gap' | 'overdue_task'
  verb: string
  title: string
  detail?: string
  url: string
  /** Why it's yours, e.g. "code owner · API Gateway", "mentioned". */
  reason: string
  productName?: string
  at?: string
  urgent?: boolean
  notificationId?: string
  /** Lenses that surface this item first; others still show it. */
  lenses: Lens[]
}

export type TaskGroup = {
  planId: string
  planTitle: string
  productName: string
  tasks: { id: string; title: string; status: string; priority: string; endDate: string | null; overdue: boolean }[]
  specs: { id: string; title: string; version: number; approvedVersion: number | null; approvedNow: boolean; changedSinceStart: boolean }[]
  prs: { assetName: string; prStatus: string; prUrl: string | null }[]
}

export type MyWork = {
  lenses: Lens[]
  defaultLens: Lens
  needsYou: InboxItem[]
  inFlight: {
    taskGroups: TaskGroup[]
    plans: { id: string; title: string; status: string; progress: number; deadline: string | null; atRisk: boolean; review: string | null }[]
    specs: { id: string; title: string; status: string; version: number; review: { approved: number; total: number; state: string } | null }[]
  }
  watching: InboxItem[]
  panels: {
    ownedAssets: OwnedAsset[]
    staleDeliveries: { capabilityId: string; title: string; assetId: string; assetName: string; specId: string; specTitle: string; pinned: number; approved: number }[]
    reviewQueue: { id: string; subjectType: string; subjectId: string; title: string; state: string; pending: number }[]
    coordination: { id: string; title: string; assets: number; repos: number; dependencies: number }[]
    unlinkedSpecs: { id: string; title: string; version: number }[]
    plansAtRisk: { id: string; title: string; deadline: string; openTasks: number; overdue: boolean }[]
    releaseReadiness: { id: string; name: string; status: string; openPlans: number; unstamped: number; productName: string }[]
    mergedNotShipped: { id: string; title: string; releaseName: string | null }[]
  }
}

const ACTION_NOTIFICATIONS = ['comment.mention', 'comment.reply', 'comment.created', 'work_item.assigned', 'task.assigned', 'review.stale', 'responsibility.assigned']
// Covered by derived review items, so not repeated in the lists (the bell still shows them).
const DERIVED_NOTIFICATIONS = ['review.requested', 'review.updated', 'review.changes_requested']

const VERBS: Record<string, string> = {
  'comment.mention': 'Reply', 'comment.reply': 'Reply', 'comment.created': 'Read', 'work_item.assigned': 'Pick up',
  'task.assigned': 'Pick up', 'review.stale': 'Re-review', 'responsibility.assigned': 'Acknowledge',
}

const LENS_FOR_REASON = (reason: string): Lens[] => {
  if (reason.startsWith('code_owner')) return ['code_owner']
  if (reason.startsWith('architect')) return ['architect']
  if (reason === 'eng_manager') return ['eng_manager']
  return ['developer']
}

export async function getMyWork(userId: string, opts: { productId?: string } = {}): Promise<MyWork> {
  const visible = await db.select({ id: products.id, name: products.name }).from(products).where(await productAccessWhere(userId))
  const productIds = visible.map((p) => p.id).filter((id) => !opts.productId || id === opts.productId)
  const productName = new Map(visible.map((p) => [p.id, p.name]))
  const today = new Date().toISOString().slice(0, 10)

  const responsibilities = await getUserResponsibilities(userId, productIds)
  const emProducts = responsibilities.filter((r) => r.kind === 'eng_manager').map((r) => r.productId)
  const architectOf = responsibilities.filter((r) => r.kind === 'architect') as { kind: 'architect'; productId: string; area: string | null }[]
  const ownedAssetIds = responsibilities.filter((r) => r.kind === 'code_owner').map((r) => (r as { assetId: string }).assetId)

  const lenses: Lens[] = ['developer']
  if (ownedAssetIds.length) lenses.push('code_owner')
  if (architectOf.length) lenses.push('architect')
  if (emProducts.length) lenses.push('eng_manager')
  const defaultLens = lenses.includes('eng_manager') ? 'eng_manager' : lenses.includes('architect') ? 'architect' : lenses.includes('code_owner') ? 'code_owner' : 'developer'

  const needsYou: InboxItem[] = []

  // Reviews waiting on me.
  const awaiting = await listOpenReviews(userId, { productIds, awaitingUserId: userId })
  for (const r of awaiting) {
    const me = r.participants.find((p) => p.userId === userId)!
    const reason = (me.reason === 'requested' ? 'reviewer' : me.reason) as ReviewReason | 'reviewer'
    needsYou.push({
      key: `review:${r.id}`, kind: 'review', verb: me.outdated ? 'Look again' : 'Review', title: r.subjectTitle,
      detail: `${r.subjectType === 'spec' ? 'Spec' : 'Plan'} · requested by ${r.requestedByName ?? 'someone'}${me.required ? ' · required' : ''}${r.dueAt ? ` · due ${r.dueAt}` : ''}`,
      url: `${r.subjectType === 'spec' ? '/specs' : '/plans'}/${r.subjectId}#review`, reason, productName: productName.get(r.productId), at: r.requestedAt,
      urgent: !!r.dueAt && r.dueAt <= today, lenses: reason === 'architect' ? ['architect'] : reason === 'code_owner' ? ['code_owner'] : reason === 'eng_manager' ? ['eng_manager'] : ['developer'],
    })
  }

  // Changes requested on things I asked to have reviewed or authored.
  const blocked = productIds.length ? await db.select().from(reviews).where(and(inArray(reviews.productId, productIds), eq(reviews.state, 'changes_requested'))) : []
  for (const r of blocked) {
    const subject = r.subjectType === 'spec'
      ? await db.query.specs.findFirst({ where: eq(specs.id, r.subjectId) }).then((s) => s && { title: s.title, owner: s.createdById })
      : await db.query.codePlans.findFirst({ where: eq(codePlans.id, r.subjectId) }).then((p) => p && { title: p.title, owner: p.ownerId ?? p.creatorId })
    if (!subject || (r.requestedById !== userId && subject.owner !== userId)) continue
    needsYou.push({ key: `changes:${r.id}`, kind: 'changes_requested', verb: 'Address feedback', title: subject.title, detail: 'Changes requested in review',
      url: `${r.subjectType === 'spec' ? '/specs' : '/plans'}/${r.subjectId}#review`, reason: r.requestedById === userId ? 'requester' : 'author',
      productName: productName.get(r.productId), urgent: true, lenses: ['developer', 'architect'] })
  }

  // Event items: mentions, replies, assignments.
  const notes = (await listNotifications(userId, { limit: 100 })).filter((n) => !n.productId || productIds.includes(n.productId))
  for (const n of notes.filter((n) => ACTION_NOTIFICATIONS.includes(n.eventType) && !(n.eventType === 'review.stale' && n.reason !== 'requester'))) {
    needsYou.push({ key: `n:${n.id}`, kind: 'notification', verb: VERBS[n.eventType] ?? 'Open', title: n.title, detail: n.summary || undefined, url: n.url,
      reason: n.reason, productName: n.productId ? productName.get(n.productId) : undefined, at: n.createdAt.toISOString(), notificationId: n.id, lenses: LENS_FOR_REASON(n.reason) })
  }

  // Triage: open, unowned, unplanned work on my assets or products I manage.
  if (ownedAssetIds.length || emProducts.length) {
    const planned = new Set((await db.select({ id: workItemCodePlans.workItemId }).from(workItemCodePlans)).map((r) => r.id))
    const candidates = await db.select({ item: workItems, assetName: assets.name }).from(workItems).leftJoin(assets, eq(workItems.assetId, assets.id))
      .where(and(inArray(workItems.productId, productIds.length ? productIds : ['__none__']), eq(workItems.status, 'open'), isNull(workItems.ownerId), eq(workItems.externalDeleted, false)))
    for (const { item, assetName } of candidates) {
      if (planned.has(item.id)) continue
      const mine = item.assetId && ownedAssetIds.includes(item.assetId)
      const managed = emProducts.includes(item.productId)
      if (!mine && !managed) continue
      needsYou.push({ key: `triage:${item.id}`, kind: 'triage', verb: 'Triage', title: item.title,
        detail: `${item.type.replace('_', ' ')} · ${item.severity}${assetName ? ` · ${assetName}` : ''} · no owner or plan`, url: `/work-items?item=${item.id}`,
        reason: mine ? `code_owner:${assetName}` : 'eng_manager', productName: productName.get(item.productId), at: item.createdAt.toISOString(),
        urgent: item.severity === 'critical' || item.severity === 'high', lenses: mine ? ['code_owner', 'eng_manager'] : ['eng_manager'] })
    }
  }

  // Evidence gaps I'm responsible for.
  for (const { gap, reason } of await getEvidenceGapsFor(userId, productIds)) {
    needsYou.push({ key: `gap:${gap.key}`, kind: 'evidence_gap', verb: 'Add evidence', title: gap.title, detail: `${EVIDENCE_GAP_LABELS[gap.kind]} · ${gap.detail}`,
      url: gap.url, reason, productName: productName.get(gap.productId), lenses: LENS_FOR_REASON(reason) })
  }

  // My tasks, including overdue ones.
  const myTasks = (await getTasks(userId, { assigneeId: userId, productId: opts.productId }))
    .filter((t) => t.status !== 'done' && t.planStatus === 'active')
  const taskPlanIds = [...new Set(myTasks.map((t) => t.codePlanId))]
  const planProduct = new Map((taskPlanIds.length ? await db.select({ id: codePlans.id, productId: codePlans.productId }).from(codePlans).where(inArray(codePlans.id, taskPlanIds)) : [])
    .map((p) => [p.id, productName.get(p.productId) ?? '']))
  for (const t of myTasks.filter((t) => t.endDate && t.endDate.slice(0, 10) < today)) {
    needsYou.push({ key: `overdue:${t.id}`, kind: 'overdue_task', verb: 'Overdue', title: t.title, detail: `${t.planTitle} · due ${t.endDate!.slice(0, 10)}`,
      url: `/plans/${t.codePlanId}`, reason: 'assignee', productName: planProduct.get(t.codePlanId), urgent: true, lenses: ['developer'] })
  }

  // ── In flight ──
  const taskGroups: TaskGroup[] = []
  for (const planId of taskPlanIds) {
    const tasks = myTasks.filter((t) => t.codePlanId === planId)
    const [planSpecs, prs, activated] = await Promise.all([
      db.select({ spec: specs }).from(specLinks).innerJoin(specs, eq(specLinks.specId, specs.id))
        .where(and(eq(specLinks.targetType, 'code_plan'), eq(specLinks.targetId, planId), notInArray(specs.status, ['superseded']))),
      db.select({ assetName: assets.name, prStatus: codePlanAssets.prStatus, prUrl: codePlanAssets.prUrl }).from(codePlanAssets)
        .innerJoin(assets, eq(codePlanAssets.assetId, assets.id)).where(eq(codePlanAssets.codePlanId, planId)),
      db.select({ at: syncLog.createdAt }).from(syncLog).where(and(eq(syncLog.entityType, 'code_plan'), eq(syncLog.entityId, planId), eq(syncLog.event, 'activated')))
        .orderBy(desc(syncLog.createdAt)).limit(1),
    ])
    const startedAt = activated[0]?.at
    const specViews = []
    for (const { spec } of planSpecs) {
      const changed = startedAt ? (await db.select({ v: specRevisions.version }).from(specRevisions)
        .where(and(eq(specRevisions.specId, spec.id), gt(specRevisions.createdAt, startedAt))).limit(1)).length > 0 : false
      specViews.push({ id: spec.id, title: spec.title, version: spec.version, approvedVersion: await lastApprovedVersion('spec', spec.id),
        approvedNow: await isApprovedNow('spec', spec.id), changedSinceStart: changed })
    }
    taskGroups.push({
      planId, planTitle: tasks[0].planTitle, productName: planProduct.get(planId) ?? '',
      tasks: tasks.map((t) => ({ id: t.id, title: t.title, status: t.status, priority: t.priority, endDate: t.endDate ?? null, overdue: !!t.endDate && t.endDate.slice(0, 10) < today })),
      specs: specViews, prs,
    })
  }

  const ownedPlans = productIds.length ? await db.select().from(codePlans)
    .where(and(inArray(codePlans.productId, productIds), eq(codePlans.ownerId, userId), inArray(codePlans.status, ['draft', 'active']))) : []
  const planStates = new Map((ownedPlans.length ? await db.select({ id: reviews.subjectId, state: reviews.state }).from(reviews)
    .where(and(eq(reviews.subjectType, 'code_plan'), inArray(reviews.subjectId, ownedPlans.map((p) => p.id)), inArray(reviews.state, OPEN_STATES))) : []).map((r) => [r.id, r.state]))
  const plans = []
  for (const p of ownedPlans) {
    const tasks = await getTasks(userId, { planId: p.id })
    const done = tasks.filter((t) => t.status === 'done').length
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    plans.push({ id: p.id, title: p.title, status: p.status, progress: tasks.length ? Math.round((done / tasks.length) * 100) : 0, deadline: p.deadline,
      atRisk: !!p.deadline && p.deadline.slice(0, 10) <= soon && done < tasks.length,
      review: planStates.get(p.id) ?? ((await isApprovedNow('code_plan', p.id)) ? 'approved' : null) })
  }

  const authoring = productIds.length ? await db.select().from(specs)
    .where(and(inArray(specs.productId, productIds), eq(specs.createdById, userId), inArray(specs.status, ['draft', 'in_review']))) : []
  const specItems = []
  for (const s of authoring) {
    const [open] = await db.select().from(reviews).where(and(eq(reviews.subjectType, 'spec'), eq(reviews.subjectId, s.id), inArray(reviews.state, OPEN_STATES))).limit(1)
    const parts = open ? await db.select().from(reviewParticipants).where(eq(reviewParticipants.reviewId, open.id)) : []
    specItems.push({ id: s.id, title: s.title, status: s.status, version: s.version,
      review: open ? { approved: parts.filter((p) => p.decision === 'approved' && (p.decidedAtVersion ?? 0) >= s.version).length, total: parts.length, state: open.state } : null })
  }

  // ── Watching ──
  const watching: InboxItem[] = notes
    .filter((n) => !ACTION_NOTIFICATIONS.includes(n.eventType) || (n.eventType === 'review.stale' && n.reason !== 'requester'))
    .filter((n) => !DERIVED_NOTIFICATIONS.includes(n.eventType))
    .slice(0, 25)
    .map((n) => ({ key: `n:${n.id}`, kind: 'notification' as const, verb: 'Open', title: n.title, detail: n.summary || undefined, url: n.url, reason: n.reason,
      productName: n.productId ? productName.get(n.productId) : undefined, at: n.createdAt.toISOString(), notificationId: n.id, lenses: LENS_FOR_REASON(n.reason) }))

  return {
    lenses, defaultLens, needsYou: sortInbox(needsYou), inFlight: { taskGroups, plans, specs: specItems }, watching,
    panels: await lensPanels(userId, productIds, productName, { ownedAssetIds, architectOf, emProducts, opts }),
  }
}

function sortInbox(items: InboxItem[]) {
  const rank: Record<InboxItem['kind'], number> = { changes_requested: 0, review: 1, overdue_task: 2, notification: 3, triage: 4, evidence_gap: 5 }
  return items.sort((a, b) => Number(!!b.urgent) - Number(!!a.urgent) || rank[a.kind] - rank[b.kind] || (b.at ?? '').localeCompare(a.at ?? ''))
}

async function lensPanels(userId: string, productIds: string[], productName: Map<string, string>, ctx: {
  ownedAssetIds: string[]; architectOf: { productId: string; area: string | null }[]; emProducts: string[]; opts: { productId?: string }
}): Promise<MyWork['panels']> {
  const panels: MyWork['panels'] = { ownedAssets: [], staleDeliveries: [], reviewQueue: [], coordination: [], unlinkedSpecs: [], plansAtRisk: [], releaseReadiness: [], mergedNotShipped: [] }
  const today = new Date().toISOString().slice(0, 10)

  // Code owner: my assets, and delivered capabilities pinned behind the spec's approved version.
  if (ctx.ownedAssetIds.length) {
    panels.ownedAssets = await getOwnedAssets(userId, { productId: ctx.opts.productId })
    const caps = await db.select({ cap: assetCapabilities, assetName: assets.name, spec: specs }).from(assetCapabilities)
      .innerJoin(assets, eq(assetCapabilities.assetId, assets.id)).innerJoin(specs, eq(assetCapabilities.sourceSpecId, specs.id))
      .where(and(inArray(assetCapabilities.assetId, ctx.ownedAssetIds), eq(assetCapabilities.status, 'active')))
    for (const { cap, assetName, spec } of caps) {
      const approved = await lastApprovedVersion('spec', spec.id)
      if (approved !== null && cap.sourceSpecVersion !== null && cap.sourceSpecVersion < approved) {
        panels.staleDeliveries.push({ capabilityId: cap.id, title: cap.title, assetId: cap.assetId, assetName, specId: spec.id, specTitle: spec.title, pinned: cap.sourceSpecVersion, approved })
      }
    }
  }

  // Architect: open reviews in my area, coordination-heavy plans, specs linked to nothing.
  const archProducts = [...new Set(ctx.architectOf.map((a) => a.productId))]
  if (archProducts.length) {
    const queue = await listOpenReviews(userId, { productIds: archProducts })
    for (const r of queue) {
      if (r.subjectType === 'spec') {
        const spec = await db.query.specs.findFirst({ where: eq(specs.id, r.subjectId) })
        const covers = ctx.architectOf.some((a) => a.productId === r.productId && (!a.area || a.area.toLowerCase() === (spec?.area ?? '').toLowerCase()))
        if (!covers) continue
      }
      panels.reviewQueue.push({ id: r.id, subjectType: r.subjectType, subjectId: r.subjectId, title: r.subjectTitle, state: r.state,
        pending: r.participants.filter((p) => p.decision === 'pending' || p.outdated).length })
    }
    const livePlans = await db.select().from(codePlans).where(and(inArray(codePlans.productId, archProducts), inArray(codePlans.status, ['draft', 'active'])))
    for (const p of livePlans) {
      const targets = await db.select({ id: assets.id, repo: assets.repositoryUrl }).from(codePlanAssets).innerJoin(assets, eq(codePlanAssets.assetId, assets.id))
        .where(eq(codePlanAssets.codePlanId, p.id))
      if (targets.length < 2) continue
      const ids = targets.map((t) => t.id)
      const deps = await db.select({ id: assetDependencies.id }).from(assetDependencies)
        .where(and(inArray(assetDependencies.sourceAssetId, ids), inArray(assetDependencies.targetAssetId, ids)))
      panels.coordination.push({ id: p.id, title: p.title, assets: targets.length, repos: new Set(targets.map((t) => t.repo ?? `asset:${t.id}`)).size, dependencies: deps.length })
    }
    panels.coordination.sort((a, b) => b.assets - a.assets || b.repos - a.repos || b.dependencies - a.dependencies).splice(6)
    const active = await db.select().from(specs).where(and(inArray(specs.productId, archProducts), eq(specs.status, 'active')))
    const linked = active.length ? new Set((await db.select({ id: specLinks.specId }).from(specLinks).where(inArray(specLinks.specId, active.map((s) => s.id)))).map((r) => r.id)) : new Set<string>()
    panels.unlinkedSpecs = active.filter((s) => !linked.has(s.id)).map((s) => ({ id: s.id, title: s.title, version: s.version }))
  }

  // Engineering manager: plans at risk, release readiness, merged but not shipped.
  if (ctx.emProducts.length) {
    const soon = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10)
    const active = await db.select().from(codePlans).where(and(inArray(codePlans.productId, ctx.emProducts), eq(codePlans.status, 'active')))
    for (const p of active) {
      const tasks = await getTasks(userId, { planId: p.id })
      const open = tasks.filter((t) => t.status !== 'done').length
      if (p.deadline && p.deadline.slice(0, 10) <= soon && open > 0) {
        panels.plansAtRisk.push({ id: p.id, title: p.title, deadline: p.deadline.slice(0, 10), openTasks: open, overdue: p.deadline.slice(0, 10) < today })
      }
      const prs = await db.select({ prStatus: codePlanAssets.prStatus }).from(codePlanAssets).where(eq(codePlanAssets.codePlanId, p.id))
      const release = p.releaseId ? await db.query.releases.findFirst({ where: eq(releases.id, p.releaseId) }) : null
      if (prs.length && prs.every((r) => r.prStatus === 'merged') && release?.status !== 'shipped') {
        panels.mergedNotShipped.push({ id: p.id, title: p.title, releaseName: release?.name ?? null })
      }
    }
    const completed = await db.select().from(codePlans).where(and(inArray(codePlans.productId, ctx.emProducts), eq(codePlans.status, 'completed')))
    for (const p of completed) {
      const release = p.releaseId ? await db.query.releases.findFirst({ where: eq(releases.id, p.releaseId) }) : null
      if (release?.status !== 'shipped') panels.mergedNotShipped.push({ id: p.id, title: p.title, releaseName: release?.name ?? null })
    }
    const upcoming = await db.select().from(releases).where(and(inArray(releases.productId, ctx.emProducts), inArray(releases.status, ['planned', 'in_progress'])))
    for (const r of upcoming) {
      const [plansIn, stamps] = await Promise.all([
        db.select({ status: codePlans.status }).from(codePlans).where(eq(codePlans.releaseId, r.id)),
        db.select({ version: releaseAssets.version }).from(releaseAssets).where(eq(releaseAssets.releaseId, r.id)),
      ])
      panels.releaseReadiness.push({ id: r.id, name: r.name, status: r.status, productName: productName.get(r.productId) ?? '',
        openPlans: plansIn.filter((p) => p.status !== 'completed' && p.status !== 'cancelled').length, unstamped: stamps.filter((s) => !s.version).length })
    }
  }
  return panels
}
