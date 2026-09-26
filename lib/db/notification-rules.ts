import { and, eq, inArray, isNotNull, or } from 'drizzle-orm'
import { db } from './index'
import {
  assetOwners, assets, codePlanAssets, codePlans, comments, organizationMembers, productMembers, products, releaseAssets, releases,
  reviewParticipants, reviews, specLinks, specs, tasks, users, workItems,
} from './schema'
import type { NotificationInput } from './notifications'
import { publish } from './notification-delivery'
import { EVENT_TYPE_LABELS } from '@/lib/notification-catalog'

export { EVENT_TYPE_LABELS }

/**
 * Who is told about an activity-stream event, and why. Recipients come from
 * responsibilities (code owners, architects, engineering managers), from
 * direct involvement (reviewers, assignees, authors, mentions) and never
 * include the actor. Each person gets one notification per event, carrying
 * the strongest reason they have.
 */

export type AuditEvent = {
  id: string
  entityType: string
  entityId: string
  event: string
  actorId: string | null
  actorKind: string | null
  productId: string | null
  payload: Record<string, unknown>
}

type Recipient = { userId: string; reason: string }
type Draft = {
  eventType: string
  title: string
  summary?: string
  recipients: Recipient[]
  subjectType?: string
  subjectId?: string
  url?: string
  /** Per-recipient event type override (mentions inside a comment event). */
  perRecipientType?: Map<string, string>
  /** For the team's Slack channel when `title` is addressed to "you". */
  broadcastTitle?: string
}

export function subjectUrl(subjectType: string, subjectId: string, extra?: { planId?: string; productSlug?: string }) {
  switch (subjectType) {
    case 'spec': return `/specs/${subjectId}`
    case 'code_plan': return `/plans/${subjectId}`
    case 'work_item': return `/work-items?item=${subjectId}`
    case 'release': return `/releases/${subjectId}`
    case 'asset': return `/assets/${subjectId}`
    case 'task': return extra?.planId ? `/plans/${extra.planId}` : '/tasks'
    case 'product': return extra?.productSlug ? `/products/${extra.productSlug}` : '/products'
    default: return '/my-work'
  }
}

// ── Lookups ──────────────────────────────────────────────────────────────────

async function codeOwnersOf(assetIds: string[]): Promise<Recipient[]> {
  if (!assetIds.length) return []
  const rows = await db.select({ userId: assetOwners.userId, name: assets.name }).from(assetOwners)
    .innerJoin(assets, eq(assetOwners.assetId, assets.id)).where(inArray(assetOwners.assetId, assetIds))
  return rows.map((r) => ({ userId: r.userId, reason: `code_owner:${r.name}` }))
}

async function membersOf(productId: string | null, responsibility?: 'eng_manager' | 'architect' | 'contributor'): Promise<(Recipient & { area: string })[]> {
  if (!productId) return []
  const rows = await db.select().from(productMembers)
    .where(and(eq(productMembers.productId, productId), responsibility ? eq(productMembers.responsibility, responsibility) : undefined))
  return rows.map((r) => ({ userId: r.userId, reason: r.responsibility, area: r.area }))
}

async function architectsFor(productId: string | null, area: string | null) {
  return (await membersOf(productId, 'architect'))
    .filter((m) => !m.area || (!!area && m.area.toLowerCase() === area.toLowerCase()))
    .map((m) => ({ userId: m.userId, reason: m.area ? `architect:${m.area}` : 'architect' }))
}

/** Assets a spec reaches, directly or through linked plans and work items. */
async function specAssetIds(specId: string) {
  const links = await db.select().from(specLinks).where(eq(specLinks.specId, specId))
  const ids = new Set(links.filter((l) => l.targetType === 'asset').map((l) => l.targetId))
  const planIds = links.filter((l) => l.targetType === 'code_plan').map((l) => l.targetId)
  const itemIds = links.filter((l) => l.targetType === 'work_item').map((l) => l.targetId)
  if (planIds.length) for (const r of await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(inArray(codePlanAssets.codePlanId, planIds))) ids.add(r.id)
  if (itemIds.length) for (const r of await db.select({ id: workItems.assetId }).from(workItems).where(inArray(workItems.id, itemIds))) if (r.id) ids.add(r.id)
  return [...ids]
}

async function subjectAuthor(subjectType: string, subjectId: string): Promise<Recipient[]> {
  switch (subjectType) {
    case 'spec': {
      const s = await db.query.specs.findFirst({ where: eq(specs.id, subjectId) })
      return s?.createdById ? [{ userId: s.createdById, reason: 'author' }] : []
    }
    case 'code_plan': {
      const p = await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) })
      return p ? [{ userId: p.ownerId ?? p.creatorId, reason: p.ownerId ? 'plan_owner' : 'author' }] : []
    }
    case 'work_item': {
      const w = await db.query.workItems.findFirst({ where: eq(workItems.id, subjectId) })
      return [w?.ownerId && { userId: w.ownerId, reason: 'owner' }, w?.reporterId && { userId: w.reporterId, reason: 'reporter' }].filter(Boolean) as Recipient[]
    }
    case 'release': {
      const r = await db.query.releases.findFirst({ where: eq(releases.id, subjectId) })
      return r ? [{ userId: r.creatorId, reason: 'author' }] : []
    }
    case 'asset': return codeOwnersOf([subjectId])
    default: return []
  }
}

async function actorName(id: string | null, kind: string | null) {
  if (!id) return 'Someone'
  const name = (await db.query.users.findFirst({ where: eq(users.id, id) }))?.name ?? 'Someone'
  return kind === 'agent' ? `${name} (agent)` : name
}

// ── Rules ────────────────────────────────────────────────────────────────────

async function reviewDraft(e: AuditEvent, who: string, title: string): Promise<Draft | null> {
  const reviewId = e.payload.reviewId as string | undefined
  if (!reviewId) return null
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) })
  if (!review) return null
  const noun = e.entityType === 'spec' ? 'spec' : 'plan'
  const v = e.payload.version ? ` v${e.payload.version}` : ''
  const owners = [...(review.requestedById ? [{ userId: review.requestedById, reason: 'requester' }] : []), ...(await subjectAuthor(e.entityType, e.entityId))]
  switch (e.event) {
    case 'review_requested': {
      const parts = await db.select().from(reviewParticipants).where(eq(reviewParticipants.reviewId, reviewId))
      return { eventType: 'review.requested', title: `${who} asked you to review ${title}${v}`, broadcastTitle: `${who} requested a review of ${title}${v}`, summary: review.note ?? '',
        recipients: parts.map((p) => ({ userId: p.userId, reason: p.reason === 'requested' ? 'reviewer' : p.reason })) }
    }
    case 'review_changes_requested':
      return { eventType: 'review.changes_requested', title: `${who} requested changes to ${title}${v}`, recipients: owners }
    case 'review_approved':
      return e.payload.state === 'approved'
        ? { eventType: 'review.approved', title: `${title}${v} was approved`, summary: `The ${noun}'s review is complete.`, recipients: owners }
        : null
    case 'review_commented':
      return { eventType: 'review.commented', title: `${who} commented on the review of ${title}`, recipients: owners }
    default: return null
  }
}

async function commentDraft(e: AuditEvent, who: string, title: string): Promise<Draft | null> {
  const commentId = e.payload.commentId as string | undefined
  const comment = commentId ? await db.query.comments.findFirst({ where: eq(comments.id, commentId) }) : null
  if (!comment) return null
  const excerpt = comment.body.length > 140 ? `${comment.body.slice(0, 140)}…` : comment.body
  const recipients: Recipient[] = []
  const eventTypes = new Map<string, string>()
  for (const id of (e.payload.mentions as string[] | undefined) ?? []) { recipients.push({ userId: id, reason: 'mentioned' }); eventTypes.set(id, 'comment.mention') }
  if (comment.parentId) {
    const thread = await db.select({ authorId: comments.authorId }).from(comments)
      .where(or(eq(comments.id, comment.parentId), eq(comments.parentId, comment.parentId)))
    for (const t of thread) if (t.authorId) recipients.push({ userId: t.authorId, reason: 'thread' })
  } else {
    recipients.push(...(await subjectAuthor(e.entityType, e.entityId)))
  }
  // Mentions get their own event type so they can be required later; others share one.
  return { eventType: comment.parentId ? 'comment.reply' : 'comment.created', title: `${who} ${comment.parentId ? 'replied on' : 'commented on'} ${title}`,
    summary: excerpt, recipients, perRecipientType: eventTypes }
}

async function draftFor(e: AuditEvent): Promise<Draft | null> {
  const who = await actorName(e.actorId, e.actorKind)
  const title = String(e.payload.title ?? e.payload.name ?? '')
  if (e.event.startsWith('review_')) return reviewDraft(e, who, title)
  if (e.event === 'commented' || e.event === 'comment_replied') return commentDraft(e, who, title)

  switch (`${e.entityType}:${e.event}`) {
    case 'spec:created': {
      const spec = await db.query.specs.findFirst({ where: eq(specs.id, e.entityId) })
      return { eventType: 'spec.created', title: `${who} drafted ${title}`, summary: spec?.area ? `Area: ${spec.area}` : '', recipients: await architectsFor(e.productId, spec?.area ?? null) }
    }
    case 'spec:revised': case 'spec:activated': case 'spec:superseded': case 'spec:archived': {
      const planIds = (await db.select({ id: specLinks.targetId }).from(specLinks).where(and(eq(specLinks.specId, e.entityId), eq(specLinks.targetType, 'code_plan')))).map((r) => r.id)
      const planOwners = planIds.length ? (await db.select().from(codePlans).where(inArray(codePlans.id, planIds))).map((p) => ({ userId: p.ownerId ?? p.creatorId, reason: 'plan_owner' })) : []
      const approvers = (await db.select({ userId: reviewParticipants.userId }).from(reviewParticipants).innerJoin(reviews, eq(reviewParticipants.reviewId, reviews.id))
        .where(and(eq(reviews.subjectType, 'spec'), eq(reviews.subjectId, e.entityId), eq(reviewParticipants.decision, 'approved')))).map((r) => ({ userId: r.userId, reason: 'approver' }))
      const kind = e.event === 'revised' ? 'spec.revised' : e.event === 'activated' ? 'spec.activated' : 'spec.superseded'
      const verb = e.event === 'revised' ? `revised ${title} to v${e.payload.version}` : e.event === 'activated' ? `activated ${title}` : e.event === 'superseded' ? `superseded ${title}` : `archived ${title}`
      return { eventType: kind, title: `${who} ${verb}`, recipients: [...approvers, ...(await codeOwnersOf(await specAssetIds(e.entityId))), ...planOwners] }
    }
    case 'work_item:created': {
      const item = await db.query.workItems.findFirst({ where: eq(workItems.id, e.entityId) })
      if (!item) return null
      return { eventType: 'work_item.created', title: `${who} filed ${title}`, summary: `${String(item.type).replace('_', ' ')} · ${item.severity}`,
        recipients: [...(item.assetId ? await codeOwnersOf([item.assetId]) : []), ...(await membersOf(e.productId, 'eng_manager'))] }
    }
    case 'work_item:assigned': {
      const to = e.payload.ownerId as string | undefined
      return to ? { eventType: 'work_item.assigned', title: `${who} made you owner of ${title}`, broadcastTitle: `${who} assigned an owner to ${title}`, recipients: [{ userId: to, reason: 'owner' }] } : null
    }
    case 'task:assigned': {
      const to = e.payload.assigneeId as string | undefined
      const task = await db.query.tasks.findFirst({ where: eq(tasks.id, e.entityId) })
      return to && task ? { eventType: 'task.assigned', title: `${who} assigned you ${title}`, broadcastTitle: `${who} assigned ${title}`, recipients: [{ userId: to, reason: 'assignee' }], url: subjectUrl('task', e.entityId, { planId: task.codePlanId }) } : null
    }
    case 'code_plan:created': {
      const targets = (await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(eq(codePlanAssets.codePlanId, e.entityId))).map((r) => r.id)
      return { eventType: 'plan.created', title: `${who} drafted the plan ${title}`,
        recipients: [...(await codeOwnersOf(targets)), ...(await membersOf(e.productId, 'eng_manager'))] }
    }
    case 'code_plan:activated': case 'code_plan:completed': {
      const targets = (await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(eq(codePlanAssets.codePlanId, e.entityId))).map((r) => r.id)
      return { eventType: e.event === 'activated' ? 'plan.activated' : 'plan.completed', title: `${who} ${e.event} ${title}`,
        recipients: [...(await codeOwnersOf(targets)), ...(await membersOf(e.productId, 'eng_manager'))] }
    }
    case 'code_plan:asset_added': {
      const assetId = e.payload.assetId as string | undefined
      const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, e.entityId) })
      const asset = assetId ? await db.query.assets.findFirst({ where: eq(assets.id, assetId) }) : null
      return assetId && plan ? { eventType: 'plan.targets_asset', title: `${who} added your asset to ${plan.title}`,
        broadcastTitle: `${who} added ${asset?.name ?? 'an asset'} to ${plan.title}`, recipients: await codeOwnersOf([assetId]) } : null
    }
    case 'release:shipped': {
      const included = (await db.select({ id: releaseAssets.assetId }).from(releaseAssets).where(eq(releaseAssets.releaseId, e.entityId))).map((r) => r.id)
      return { eventType: 'release.shipped', title: `${who} shipped ${title}`, recipients: [...(await codeOwnersOf(included)), ...(await membersOf(e.productId))] }
    }
    case 'asset:capability_graduated': case 'asset:design_note_added': {
      const asset = await db.query.assets.findFirst({ where: eq(assets.id, e.entityId) })
      if (!asset) return null
      const graduated = e.event === 'capability_graduated'
      return { eventType: graduated ? 'capability.graduated' : 'asset.design_note',
        title: graduated ? `${who} graduated "${title}" into ${asset.name}'s record` : `${who} added a design note to ${asset.name}: ${title}`,
        recipients: [...(await codeOwnersOf([asset.id])), ...(graduated ? await architectsFor(e.productId, null) : [])] }
    }
    case 'product:member_added': {
      const to = e.payload.userId as string | undefined
      const product = await db.query.products.findFirst({ where: eq(products.id, e.entityId) })
      const label = String(e.payload.responsibility ?? '').replace('_', ' ')
      const role = `${label === 'eng manager' ? 'engineering manager' : label}${e.payload.area ? ` (${e.payload.area})` : ''}`
      const member = to ? (await db.query.users.findFirst({ where: eq(users.id, to) }))?.name ?? 'someone' : ''
      return to && product ? { eventType: 'responsibility.assigned', title: `${who} made you ${role} on ${product.name}`, broadcastTitle: `${who} made ${member} ${role} on ${product.name}`,
        recipients: [{ userId: to, reason: String(e.payload.responsibility) }], url: subjectUrl('product', product.id, { productSlug: product.slug }) } : null
    }
    default: return null
  }
}

/** Turn one activity-stream event into notifications. Never throws. */
export async function notifyForEvent(e: AuditEvent) {
  try {
    const draft = await draftFor(e)
    if (!draft) return 0
    const perRecipient = draft.perRecipientType
    const subjectType = draft.subjectType ?? e.entityType
    const subjectId = draft.subjectId ?? e.entityId
    const url = draft.url ?? subjectUrl(subjectType, subjectId)
    // Strongest reason wins: the first time a person appears is the reason they're told.
    const firstReason = new Map<string, string>()
    for (const r of draft.recipients) if (!firstReason.has(r.userId)) firstReason.set(r.userId, r.reason)
    const rows: NotificationInput[] = [...firstReason].map(([userId, reason]) => ({
      userId, eventId: e.id, eventType: perRecipient?.get(userId) ?? draft.eventType, productId: e.productId,
      subjectType, subjectId, reason, title: perRecipient?.get(userId) === 'comment.mention' ? draft.title.replace(/ (commented|replied) on /, ' mentioned you on ') : draft.title,
      summary: draft.summary, url, actorId: e.actorId, actorKind: e.actorKind,
    }))
    const { inApp } = await publish(rows, {
      productId: e.productId, eventId: e.id, actorKind: e.actorKind,
      broadcast: { eventType: draft.eventType, title: draft.broadcastTitle ?? draft.title, summary: draft.summary, url },
    })
    return inApp
  } catch (err) {
    console.error('[notifications] rule failed:', err)
    return 0
  }
}

/**
 * A connected tool started failing. Org admins hear about it once, when the
 * connection goes into error, not on every failed sync after that.
 */
export async function notifyIntegrationError(integration: { id: string; organizationId: string; name: string }, message: string) {
  try {
    const admins = await db.select({ userId: organizationMembers.userId }).from(organizationMembers)
      .where(and(eq(organizationMembers.organizationId, integration.organizationId), inArray(organizationMembers.role, ['owner', 'admin']), isNotNull(organizationMembers.joinedAt)))
    const title = `${integration.name} failed to sync`
    const summary = message.length > 200 ? `${message.slice(0, 200)}…` : message
    const url = '/integrations'
    return (await publish(admins.map((a) => ({
      userId: a.userId, eventType: 'integration.error', subjectType: 'integration', subjectId: integration.id,
      reason: 'admin', title, summary, url, actorKind: 'connector',
    })), { organizationId: integration.organizationId, broadcast: { eventType: 'integration.error', title, summary, url } })).inApp
  } catch (err) {
    console.error('[notifications] integration error notice failed:', err)
    return 0
  }
}

/**
 * One summary per sync run for newly imported work items, never one per item.
 * Imports have no asset yet, so the product's engineering managers hear about
 * them (they triage). Posted to Slack when the event's rule says so.
 */
export async function notifySyncImports(integration: { id: string; organizationId: string; name: string }, productId: string, items: { id: string; title: string }[]) {
  if (!items.length) return 0
  try {
    const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
    if (!product) return 0
    const n = items.length
    const title = `${integration.name} sync: ${n} new work item${n === 1 ? '' : 's'} in ${product.name}`
    const summary = items.slice(0, 3).map((i) => `• ${i.title}`).join('\n') + (n > 3 ? `\n…and ${n - 3} more` : '')
    const url = '/work-items'
    const runId = crypto.randomUUID()
    const managers = await membersOf(productId, 'eng_manager')
    return (await publish(managers.map((m) => ({
      userId: m.userId, eventId: runId, eventType: 'work_item.created', productId, subjectType: 'product', subjectId: productId,
      reason: m.reason, title, summary, url, actorKind: 'connector',
    })), { organizationId: integration.organizationId, productId, eventId: runId, actorKind: 'connector', broadcast: { eventType: 'work_item.created', title, summary, url } })).inApp
  } catch (err) {
    console.error('[notifications] sync summary failed:', err)
    return 0
  }
}

/** A PR tracked on a plan was merged, as seen by a connector sync. The plan owner hears about it. */
export async function notifyPrMerged(codePlanId: string, assetId: string, prUrl: string) {
  try {
    const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, codePlanId) })
    const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) })
    if (!plan || !asset) return 0
    const title = `PR merged for ${asset.name} on ${plan.title}`
    const url = subjectUrl('code_plan', plan.id)
    return (await publish([{
      userId: plan.ownerId ?? plan.creatorId, eventType: 'pr.merged', productId: plan.productId, subjectType: 'code_plan', subjectId: plan.id,
      reason: plan.ownerId ? 'plan_owner' : 'author', title, summary: prUrl, url, actorKind: 'connector',
    }], { productId: plan.productId, actorKind: 'connector', broadcast: { eventType: 'pr.merged', title, summary: prUrl, url } })).inApp
  } catch (err) {
    console.error('[notifications] PR merged notice failed:', err)
    return 0
  }
}
