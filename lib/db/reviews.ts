import { and, desc, eq, inArray } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './index'
import { assetOwners, assets, codePlanAssets, codePlans, comments, productMembers, reviewParticipants, reviews, specLinks, specs, users } from './schema'
import { ForbiddenError, NOT_ACCESSIBLE_MESSAGE, assertCanWrite, getProductRole } from './authz'
import { logAudit } from './audit'
import { specAssetAnchors } from './specs'
import { getProductAudience } from './comments'
import { getWorkflowLevel } from './workflow'
import { completeForSubject } from './notifications'
import { OPEN_STATES, decisionIsCurrent, lastApprovedVersion, recomputeReview, subjectVersion, type SubjectVersion } from './review-state'
import type { ArtifactActor } from './attribution'
import type { ReviewDecision, ReviewReason, ReviewState, ReviewSubjectType, WorkflowLevel } from './schema.sqlite'

export const reviewSubjectType = z.enum(['spec', 'code_plan'])
export const reviewDecisionInput = z.enum(['approved', 'changes_requested', 'commented'])
export const reviewRequestInput = z.object({
  subjectType: reviewSubjectType,
  subjectId: z.string().min(1),
  reviewers: z.array(z.object({ userId: z.string(), required: z.boolean().optional() })).max(30).optional(),
  note: z.string().trim().max(2000).optional(),
  dueAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD').optional(),
})

type Subject = { productId: string; version: number; title: string; status: string; area: string | null }

async function resolveSubject(subjectType: ReviewSubjectType, subjectId: string): Promise<Subject | null> {
  if (subjectType === 'spec') {
    const s = await db.query.specs.findFirst({ where: eq(specs.id, subjectId) })
    return s ? { productId: s.productId, version: s.version, title: s.title, status: s.status, area: s.area } : null
  }
  const p = await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) })
  return p ? { productId: p.productId, version: p.revision, title: p.title, status: p.status, area: null } : null
}

async function requireVisible(userId: string, subjectType: ReviewSubjectType, subjectId: string) {
  const subject = await resolveSubject(subjectType, subjectId)
  if (!subject || (await getProductRole(userId, subject.productId)) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  return subject
}

/**
 * People who can review: members of the product's audience with edit access.
 * Viewers can comment, but an approval is an attestation that needs standing.
 */
export async function getReviewerPool(productId: string): Promise<{ id: string; name: string }[]> {
  const audience = await getProductAudience(productId)
  const roles = await Promise.all(audience.map((u) => getProductRole(u.id, productId)))
  return audience.filter((_, i) => roles[i] === 'editor' || roles[i] === 'admin').map((u) => ({ id: u.id, name: u.name }))
}

async function subjectAuthorIds(subjectType: ReviewSubjectType, subjectId: string): Promise<string[]> {
  if (subjectType === 'spec') {
    const s = await db.query.specs.findFirst({ where: eq(specs.id, subjectId) })
    return s?.createdById ? [s.createdById] : []
  }
  const p = await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) })
  return p ? [p.creatorId, ...(p.ownerId ? [p.ownerId] : [])] : []
}

export const REVIEW_MANAGE_FORBIDDEN = "Only the person who requested this review, the author, the product's engineering managers or an org admin can change it."

/**
 * Who may add or remove reviewers and withdraw a review: the requester, the
 * subject's author, the product's engineering managers and org owners/admins.
 * A reviewer can't reshape the review they're judging.
 */
export async function canManageReview(review: { productId: string; subjectType: string; subjectId: string; requestedById: string | null }, userId: string): Promise<boolean> {
  const role = await getProductRole(userId, review.productId)
  if (role === 'admin') return true
  if (role !== 'editor') return false
  if (review.requestedById === userId) return true
  if ((await subjectAuthorIds(review.subjectType as ReviewSubjectType, review.subjectId)).includes(userId)) return true
  const { canManageResponsibilities } = await import('./responsibilities')
  return canManageResponsibilities(userId, review.productId)
}

export type SuggestedReviewer = { userId: string; name: string; reason: ReviewReason; required: boolean; detail: string }

/**
 * Who should review, from responsibilities:
 *  - specs: architects whose area matches the spec's (or who cover the whole
 *    product), and code owners of every asset the spec is linked to, directly
 *    or through its plans and work items. Both are required by default.
 *  - plans: code owners of each target asset (required) and the product's
 *    engineering managers (optional).
 * The requester is never suggested: nobody approves their own change, unless
 * nobody else can see the product (see requestReview).
 */
export async function suggestReviewers(subjectType: ReviewSubjectType, subjectId: string, requesterId?: string): Promise<SuggestedReviewer[]> {
  const subject = await resolveSubject(subjectType, subjectId)
  if (!subject) return []
  const out = new Map<string, Omit<SuggestedReviewer, 'name'>>()
  const add = (userId: string, reason: ReviewReason, required: boolean, detail: string) => {
    if (userId === requesterId || out.has(userId)) return
    out.set(userId, { userId, reason, required, detail })
  }
  const members = await db.select().from(productMembers).where(eq(productMembers.productId, subject.productId))
  let assetIds: string[] = []
  if (subjectType === 'spec') {
    const spec = (await db.query.specs.findFirst({ where: eq(specs.id, subjectId) }))!
    for (const m of members.filter((m) => m.responsibility === 'architect')) {
      const covers = !m.area || (!!subject.area && m.area.toLowerCase() === subject.area.toLowerCase())
      if (covers) add(m.userId, 'architect', true, m.area ? `Architect · ${m.area}` : 'Architect · whole product')
    }
    const links = await db.select().from(specLinks).where(eq(specLinks.specId, subjectId))
    assetIds = (await specAssetAnchors(spec, links)).map((a) => a.assetId)
  } else {
    assetIds = (await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(eq(codePlanAssets.codePlanId, subjectId))).map((r) => r.id)
  }
  if (assetIds.length) {
    const owners = await db.select({ userId: assetOwners.userId, assetId: assetOwners.assetId, assetName: assets.name })
      .from(assetOwners).innerJoin(assets, eq(assetOwners.assetId, assets.id))
      .where(inArray(assetOwners.assetId, assetIds))
    const byUser = new Map<string, string[]>()
    for (const o of owners) byUser.set(o.userId, [...(byUser.get(o.userId) ?? []), o.assetName])
    for (const [userId, names] of byUser) add(userId, 'code_owner', true, `Code owner · ${names.join(', ')}`)
  }
  if (subjectType === 'code_plan') {
    for (const m of members.filter((m) => m.responsibility === 'eng_manager')) add(m.userId, 'eng_manager', false, 'Engineering manager')
  }
  // Only people who can still review the product (edit access) are suggested.
  const pool = new Map((await getReviewerPool(subject.productId)).map((u) => [u.id, u.name]))
  return [...out.values()].filter((s) => pool.has(s.userId)).map((s) => ({ ...s, name: pool.get(s.userId)! }))
}

export async function getOpenReview(subjectType: ReviewSubjectType, subjectId: string) {
  return db.query.reviews.findFirst({
    where: and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId), inArray(reviews.state, OPEN_STATES)),
  })
}

/**
 * Open a review on the subject's current version. In an open workflow the
 * requester picks reviewers (suggestions when none are given); in a guided or
 * gated one the suggested reviewers are always added with their default
 * required flags, and the requester may add more. When nobody else can see
 * the product, the requester reviews it themselves, so a team of one can
 * still get work through a gated workflow.
 */
export async function requestReview(input: z.input<typeof reviewRequestInput>, actor: ArtifactActor) {
  const data = reviewRequestInput.parse(input)
  const subject = await resolveSubject(data.subjectType, data.subjectId)
  if (!subject) throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  await assertCanWrite(actor.id, { productId: subject.productId })
  if (subject.status === 'superseded' || subject.status === 'archived' || subject.status === 'cancelled' || subject.status === 'completed') {
    throw new Error(`A ${subject.status} ${data.subjectType === 'spec' ? 'spec' : 'plan'} can't be reviewed`)
  }
  if (await getOpenReview(data.subjectType, data.subjectId)) throw new Error('This already has an open review — add reviewers to it instead')

  const { level } = await getWorkflowLevel(subject.productId)
  const suggestions = await suggestReviewers(data.subjectType, data.subjectId, actor.id)
  const audience = new Set((await getReviewerPool(subject.productId)).map((u) => u.id))
  const chosen = new Map<string, { reason: ReviewReason; required: boolean }>()
  if (level !== 'open' || !data.reviewers) for (const s of suggestions) chosen.set(s.userId, { reason: s.reason, required: s.required })
  for (const r of data.reviewers ?? []) {
    if (r.userId === actor.id || !audience.has(r.userId)) continue
    const suggested = suggestions.find((s) => s.userId === r.userId)
    const existing = chosen.get(r.userId)
    // Guided keeps suggested reviewers required; the requester can only add, not waive.
    const required = level !== 'open' && existing ? existing.required || !!r.required : r.required ?? suggested?.required ?? false
    chosen.set(r.userId, { reason: suggested?.reason ?? existing?.reason ?? 'requested', required })
  }
  if (chosen.size === 0) {
    // Nobody else could review it: the requester (if they could) reviews their own work.
    if (audience.has(actor.id) && audience.size === 1) chosen.set(actor.id, { reason: 'self', required: true })
    else throw new Error('Choose at least one reviewer other than yourself')
  }

  const review = await db.transaction(async (tx) => {
    const [row] = await tx.insert(reviews).values({
      productId: subject.productId, subjectType: data.subjectType, subjectId: data.subjectId, subjectVersion: subject.version,
      requestedById: actor.id, requestedByKind: actor.kind ?? 'user', note: data.note || null, dueAt: data.dueAt ?? null,
    }).returning()
    await tx.insert(reviewParticipants).values([...chosen].map(([userId, p]) => ({ reviewId: row.id, userId, reason: p.reason, required: p.required })))
    // Workflow state, not content: moving a draft spec into review does not create a version.
    if (data.subjectType === 'spec' && subject.status === 'draft') {
      await tx.update(specs).set({ status: 'in_review' }).where(eq(specs.id, data.subjectId))
    }
    return row
  })
  await logAudit({ entityType: data.subjectType, entityId: data.subjectId, event: 'review_requested', actor, productId: subject.productId,
    payload: { title: subject.title, reviewId: review.id, version: subject.version, reviewers: [...chosen.keys()] } })
  return review
}

/**
 * Record a reviewer's decision at the subject's current version. Agents can
 * comment and request reviews but never record a decision: approval is a
 * human attestation.
 */
export async function decideReview(reviewId: string, decision: z.input<typeof reviewDecisionInput>, note: string | undefined, actor: ArtifactActor) {
  const choice = reviewDecisionInput.parse(decision)
  if (actor.kind === 'agent') throw new ForbiddenError('Agents can comment on a review but cannot record a decision.')
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) })
  if (!review || (await getProductRole(actor.id, review.productId)) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  if (!OPEN_STATES.includes(review.state as ReviewState)) throw new Error('This review is closed')
  const participant = await db.query.reviewParticipants.findFirst({ where: and(eq(reviewParticipants.reviewId, reviewId), eq(reviewParticipants.userId, actor.id)) })
  if (!participant) throw new ForbiddenError('Only reviewers on this review can record a decision.')
  const role = await getProductRole(actor.id, review.productId)
  if (role !== 'editor' && role !== 'admin') throw new ForbiddenError('Recording a review decision needs edit access to this product.')
  if (choice === 'changes_requested' && !note?.trim()) throw new Error('Say what needs to change')
  const version = (await subjectVersion(review.subjectType as ReviewSubjectType, review.subjectId))?.version ?? null
  await db.update(reviewParticipants).set({ decision: choice, decidedAt: new Date(), decidedAtVersion: version })
    .where(eq(reviewParticipants.id, participant.id))
  if (note?.trim()) {
    await db.insert(comments).values({
      productId: review.productId, subjectType: review.subjectType, subjectId: review.subjectId, subjectVersion: version,
      reviewId, body: note.trim(), kind: 'comment', authorId: actor.id, authorType: 'user',
    })
  }
  const state = await recomputeReview(reviewId)
  // Deciding answers the request: it leaves the reviewer's inbox.
  await completeForSubject(actor.id, review.subjectType, review.subjectId, ['review.requested', 'review.updated'])
  const subject = await resolveSubject(review.subjectType as ReviewSubjectType, review.subjectId)
  await logAudit({ entityType: review.subjectType as ReviewSubjectType, entityId: review.subjectId,
    event: choice === 'approved' ? 'review_approved' : choice === 'changes_requested' ? 'review_changes_requested' : 'review_commented',
    actor, productId: review.productId, payload: { title: subject?.title, reviewId, version, state } })
  return { state, version }
}

async function requireManageable(reviewId: string, actor: ArtifactActor) {
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) })
  if (!review || (await getProductRole(actor.id, review.productId)) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  if (!(await canManageReview(review, actor.id))) throw new ForbiddenError(REVIEW_MANAGE_FORBIDDEN)
  if (!OPEN_STATES.includes(review.state as ReviewState)) throw new Error('This review is closed')
  return review
}

export async function withdrawReview(reviewId: string, actor: ArtifactActor) {
  const review = await requireManageable(reviewId, actor)
  await db.update(reviews).set({ state: 'withdrawn', closedAt: new Date() }).where(eq(reviews.id, reviewId))
  if (review.subjectType === 'spec') {
    await db.update(specs).set({ status: 'draft' }).where(and(eq(specs.id, review.subjectId), eq(specs.status, 'in_review')))
  }
  await logAudit({ entityType: review.subjectType as ReviewSubjectType, entityId: review.subjectId, event: 'review_withdrawn', actor, productId: review.productId, payload: { reviewId } })
  return { id: reviewId, state: 'withdrawn' as const }
}

export async function addReviewers(reviewId: string, reviewers: { userId: string; required?: boolean }[], actor: ArtifactActor) {
  const review = await requireManageable(reviewId, actor)
  const pool = new Set((await getReviewerPool(review.productId)).map((u) => u.id))
  const suggestions = await suggestReviewers(review.subjectType as ReviewSubjectType, review.subjectId, review.requestedById ?? undefined)
  const existing = new Set((await db.select({ userId: reviewParticipants.userId }).from(reviewParticipants).where(eq(reviewParticipants.reviewId, reviewId))).map((r) => r.userId))
  const rows = reviewers.filter((r) => pool.has(r.userId) && r.userId !== review.requestedById && !existing.has(r.userId)).map((r) => {
    const s = suggestions.find((x) => x.userId === r.userId)
    return { reviewId, userId: r.userId, reason: s?.reason ?? ('requested' as const), required: r.required ?? s?.required ?? false }
  })
  if (rows.length) await db.insert(reviewParticipants).values(rows).onConflictDoNothing()
  await recomputeReview(reviewId)
  if (rows.length) {
    // Tell only the people just added (the notification rule reads payload.added).
    const subject = await resolveSubject(review.subjectType as ReviewSubjectType, review.subjectId)
    await logAudit({ entityType: review.subjectType as ReviewSubjectType, entityId: review.subjectId, event: 'review_requested', actor, productId: review.productId,
      payload: { title: subject?.title, reviewId, version: subject?.version, reviewers: rows.map((r) => r.userId), added: rows.map((r) => r.userId) } })
  }
  return { added: rows.map((r) => r.userId) }
}

/**
 * Take someone off an open review. A review always keeps at least one
 * reviewer (withdraw it instead), and in a guided or gated workflow the
 * reviewers a responsibility made required stay: that's the point of the
 * workflow. Change the responsibility, or the workflow, to change who reviews.
 */
export async function removeReviewer(reviewId: string, userId: string, actor: ArtifactActor) {
  const review = await requireManageable(reviewId, actor)
  const parts = await db.select().from(reviewParticipants).where(eq(reviewParticipants.reviewId, reviewId))
  const target = parts.find((p) => p.userId === userId)
  if (!target) return { removed: userId }
  if (parts.length <= 1) throw new Error('A review needs at least one reviewer. Withdraw the review instead.')
  const { level } = await getWorkflowLevel(review.productId)
  if (level !== 'open' && target.required && target.reason !== 'requested') {
    throw new Error(`This product uses a ${level} review workflow, so a reviewer required by their responsibility can't be removed. Withdraw the review instead, or change the responsibility.`)
  }
  await db.delete(reviewParticipants).where(eq(reviewParticipants.id, target.id))
  await recomputeReview(reviewId)
  return { removed: userId }
}

export type ParticipantView = {
  userId: string
  name: string
  reason: ReviewReason
  required: boolean
  decision: ReviewDecision
  decidedAt: string | null
  decidedAtVersion: number | null
  /** A decision made on an earlier version no longer counts toward the review. */
  outdated: boolean
}

export type ReviewView = {
  id: string
  subjectType: ReviewSubjectType
  subjectId: string
  subjectVersion: number
  approvedVersion: number | null
  state: ReviewState
  requestedById: string | null
  requestedByName: string | null
  requestedByKind: 'user' | 'agent'
  note: string | null
  dueAt: string | null
  requestedAt: string
  closedAt: string | null
  participants: ParticipantView[]
}

async function toViews(rows: (typeof reviews.$inferSelect)[], currentVersion: (r: typeof reviews.$inferSelect) => SubjectVersion | null): Promise<ReviewView[]> {
  if (!rows.length) return []
  const parts = await db.select({ p: reviewParticipants, name: users.name }).from(reviewParticipants)
    .innerJoin(users, eq(reviewParticipants.userId, users.id)).where(inArray(reviewParticipants.reviewId, rows.map((r) => r.id)))
  const requesterIds = rows.map((r) => r.requestedById).filter((x): x is string => !!x)
  const names = new Map((requesterIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, requesterIds)) : []).map((u) => [u.id, u.name]))
  return rows.map((r) => {
    const version = currentVersion(r)
    return {
      id: r.id, subjectType: r.subjectType as ReviewSubjectType, subjectId: r.subjectId, subjectVersion: r.subjectVersion,
      approvedVersion: r.approvedVersion, state: r.state as ReviewState, requestedById: r.requestedById,
      requestedByName: r.requestedById ? names.get(r.requestedById) ?? null : null, requestedByKind: (r.requestedByKind as 'user' | 'agent') ?? 'user',
      note: r.note, dueAt: r.dueAt, requestedAt: r.requestedAt.toISOString(), closedAt: r.closedAt?.toISOString() ?? null,
      participants: parts.filter((x) => x.p.reviewId === r.id)
        .map(({ p, name }) => ({
          userId: p.userId, name, reason: p.reason as ReviewReason, required: p.required, decision: p.decision as ReviewDecision,
          decidedAt: p.decidedAt?.toISOString() ?? null, decidedAtVersion: p.decidedAtVersion,
          outdated: p.decision !== 'pending' && OPEN_STATES.includes(r.state as ReviewState) && version !== null && !decisionIsCurrent(p.decidedAtVersion, version),
        }))
        .sort((a, b) => Number(b.required) - Number(a.required) || a.name.localeCompare(b.name)),
    }
  })
}

export type ReviewSummary = {
  subjectType: ReviewSubjectType
  subjectId: string
  productId: string
  currentVersion: number
  lastApprovedVersion: number | null
  /** The last approval still covers the current content (status-only changes don't count). */
  approvedNow: boolean
  workflowLevel: WorkflowLevel
  current: ReviewView | null
  history: ReviewView[]
  suggestions: SuggestedReviewer[]
  audience: { id: string; name: string }[]
  viewer: {
    canRequest: boolean
    canManage: boolean
    isReviewer: boolean
    decision: ReviewDecision | null
    /** Nobody else can see the product, so the viewer reviews their own work. */
    alone: boolean
  }
}

/** Everything the review panel on a spec or plan page needs, from the viewer's point of view. */
export async function getReviewSummary(subjectType: ReviewSubjectType, subjectId: string, viewerId: string): Promise<ReviewSummary> {
  const subject = await requireVisible(viewerId, subjectType, subjectId)
  const [rows, role, { level }, approved, pool, v] = await Promise.all([
    db.select().from(reviews).where(and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId))).orderBy(desc(reviews.requestedAt)),
    getProductRole(viewerId, subject.productId),
    getWorkflowLevel(subject.productId),
    lastApprovedVersion(subjectType, subjectId),
    getReviewerPool(subject.productId),
    subjectVersion(subjectType, subjectId),
  ])
  const views = await toViews(rows, () => v)
  const current = views.find((v) => OPEN_STATES.includes(v.state)) ?? null
  const canWrite = role === 'editor' || role === 'admin'
  const canManage = canWrite && !!current && await canManageReview({ ...current, productId: subject.productId }, viewerId)
  const me = current?.participants.find((p) => p.userId === viewerId)
  return {
    subjectType, subjectId, productId: subject.productId, currentVersion: subject.version, lastApprovedVersion: approved, approvedNow: decisionIsCurrent(approved, v), workflowLevel: level,
    current, history: views.filter((v) => v !== current),
    suggestions: current ? [] : await suggestReviewers(subjectType, subjectId, viewerId),
    audience: pool.filter((u) => u.id !== viewerId),
    viewer: {
      canRequest: canWrite && !current, canManage, isReviewer: !!me,
      decision: me && !me.outdated ? me.decision : me ? 'pending' : null,
      alone: pool.every((u) => u.id === viewerId),
    },
  }
}

export type ReviewListRow = ReviewView & { subjectTitle: string; productId: string }

/** Open reviews in the given products, optionally only where the user is a participant who has not decided at the current version. */
export async function listOpenReviews(viewerId: string, opts: { productIds?: string[]; awaitingUserId?: string; subjectType?: ReviewSubjectType } = {}): Promise<ReviewListRow[]> {
  // No products → nothing to list (and no placeholder id: Postgres rejects non-uuid values).
  if (opts.productIds && !opts.productIds.length) return []
  const rows = await db.select().from(reviews).where(and(
    inArray(reviews.state, OPEN_STATES),
    opts.productIds ? inArray(reviews.productId, opts.productIds) : undefined,
    opts.subjectType ? eq(reviews.subjectType, opts.subjectType) : undefined,
  )).orderBy(desc(reviews.requestedAt))
  const visible: typeof rows = []
  for (const r of rows) if ((await getProductRole(viewerId, r.productId)) !== 'none') visible.push(r)
  const specRows = visible.filter((r) => r.subjectType === 'spec').map((r) => r.subjectId)
  const planRows = visible.filter((r) => r.subjectType === 'code_plan').map((r) => r.subjectId)
  const [specInfo, planInfo] = await Promise.all([
    specRows.length ? db.select({ id: specs.id, title: specs.title }).from(specs).where(inArray(specs.id, specRows)) : [],
    planRows.length ? db.select({ id: codePlans.id, title: codePlans.title }).from(codePlans).where(inArray(codePlans.id, planRows)) : [],
  ])
  const info = new Map([...specInfo, ...planInfo].map((x) => [x.id, x]))
  const versions = new Map<string, SubjectVersion | null>()
  for (const r of visible) versions.set(r.subjectId, await subjectVersion(r.subjectType as ReviewSubjectType, r.subjectId))
  const views = await toViews(visible, (r) => versions.get(r.subjectId) ?? null)
  return views
    .map((v) => ({ ...v, subjectTitle: info.get(v.subjectId)?.title ?? '', productId: visible.find((r) => r.id === v.id)!.productId }))
    .filter((v) => !opts.awaitingUserId || v.participants.some((p) => p.userId === opts.awaitingUserId && (p.decision === 'pending' || p.outdated)))
}

/** Which of these subjects have an open review, and in what state (for list badges). */
export async function openReviewStates(subjectType: ReviewSubjectType, subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, ReviewState>()
  const rows = await db.select({ subjectId: reviews.subjectId, state: reviews.state }).from(reviews)
    .where(and(eq(reviews.subjectType, subjectType), inArray(reviews.subjectId, subjectIds), inArray(reviews.state, OPEN_STATES)))
  return new Map(rows.map((r) => [r.subjectId, r.state as ReviewState]))
}
