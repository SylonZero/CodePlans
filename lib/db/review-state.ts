import { and, desc, eq, inArray, isNotNull, sql } from 'drizzle-orm'
import { db } from './index'
import { codePlans, reviewParticipants, reviews, specRevisions, specs } from './schema'
import type { ReviewState, ReviewSubjectType } from './schema.sqlite'
import type { NotificationInput } from './notifications'

/**
 * Review state that other writers must keep consistent: recomputing a
 * review's state and reacting when its subject gets a new version. Kept free
 * of imports from specs.ts / mutations.ts so both can call it without cycles.
 */

export const OPEN_STATES: ReviewState[] = ['open', 'changes_requested']

/**
 * `version` is the subject's current version. `contentSince` is the oldest
 * version whose reviewable content is identical to the current one: a spec
 * status change (say, activating an approved draft) creates a version but
 * changes nothing a reviewer read, so a decision made at or after
 * `contentSince` still stands. Plans only change revision when content
 * changes, so for them the two are equal.
 */
export type SubjectVersion = { version: number; contentSince: number }

export async function subjectVersion(subjectType: ReviewSubjectType, subjectId: string): Promise<SubjectVersion | null> {
  if (subjectType === 'code_plan') {
    const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) })
    return plan ? { version: plan.revision, contentSince: plan.revision } : null
  }
  const spec = await db.query.specs.findFirst({ where: eq(specs.id, subjectId) })
  if (!spec) return null
  const revisions = await db.select().from(specRevisions).where(eq(specRevisions.specId, subjectId)).orderBy(desc(specRevisions.version))
  const same = (r: typeof revisions[number]) => r.body === spec.body && r.title === spec.title && r.specType === spec.specType && (r.area ?? null) === (spec.area ?? null)
  let contentSince = spec.version
  for (const r of revisions) {
    if (r.version > spec.version) continue
    if (!same(r)) break
    contentSince = r.version
  }
  return { version: spec.version, contentSince }
}

/** A decision made at `decidedAt` still covers the subject as it reads now. */
export function decisionIsCurrent(decidedAt: number | null, v: SubjectVersion | null) {
  return v !== null && decidedAt !== null && decidedAt >= v.contentSince
}

export async function currentSubjectVersion(subjectType: ReviewSubjectType, subjectId: string): Promise<number | null> {
  return (await subjectVersion(subjectType, subjectId))?.version ?? null
}

/**
 * While a review is open, only decisions that cover the current content count.
 * Any required participant requesting changes blocks it; every required
 * participant approving closes it as approved. With no required participants,
 * everyone on the review counts as required.
 */
export async function recomputeReview(reviewId: string): Promise<ReviewState | null> {
  const review = await db.query.reviews.findFirst({ where: eq(reviews.id, reviewId) })
  if (!review || !OPEN_STATES.includes(review.state as ReviewState)) return (review?.state as ReviewState) ?? null
  const v = await subjectVersion(review.subjectType as ReviewSubjectType, review.subjectId)
  if (!v) return review.state as ReviewState
  const participants = await db.select().from(reviewParticipants).where(eq(reviewParticipants.reviewId, reviewId))
  const required = participants.some((p) => p.required) ? participants.filter((p) => p.required) : participants
  const current = (p: typeof participants[number]) => decisionIsCurrent(p.decidedAtVersion, v)
  let state: ReviewState = 'open'
  if (required.some((p) => current(p) && p.decision === 'changes_requested')) state = 'changes_requested'
  else if (required.length > 0 && required.every((p) => current(p) && p.decision === 'approved')) state = 'approved'
  await db.update(reviews).set(state === 'approved'
    ? { state, approvedVersion: v.version, closedAt: new Date() }
    : { state }).where(eq(reviews.id, reviewId))
  return state
}

/**
 * A subject got a new version. Open reviews re-evaluate (decisions on older
 * content stop counting); approved reviews become stale when the content they
 * approved has changed — an approval of v3 says nothing about v4, and nothing
 * silently carries it forward.
 */
export async function onSubjectRevised(subjectType: ReviewSubjectType, subjectId: string, actorId?: string) {
  const rows = await db.select().from(reviews).where(and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId), inArray(reviews.state, [...OPEN_STATES, 'approved'])))
  if (!rows.length) return
  const v = await subjectVersion(subjectType, subjectId)
  const notices: NotificationInput[] = []
  const title = subjectType === 'spec'
    ? (await db.query.specs.findFirst({ where: eq(specs.id, subjectId) }))?.title ?? ''
    : (await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) }))?.title ?? ''
  const url = subjectType === 'spec' ? `/specs/${subjectId}` : `/plans/${subjectId}`
  const base = { productId: rows[0].productId, subjectType, subjectId, url, actorId: actorId ?? null }
  for (const r of rows) {
    const participants = await db.select().from(reviewParticipants).where(eq(reviewParticipants.reviewId, r.id))
    if (r.state === 'approved') {
      if (decisionIsCurrent(r.approvedVersion, v)) continue
      await db.update(reviews).set({ state: 'stale' }).where(eq(reviews.id, r.id))
      // The people who approved, and whoever asked, should know the approval no longer covers the text.
      for (const p of participants.filter((p) => p.decision === 'approved')) {
        notices.push({ ...base, userId: p.userId, eventType: 'review.stale', reason: 'approver', title: `${title} changed after you approved v${r.approvedVersion}` })
      }
      if (r.requestedById) notices.push({ ...base, userId: r.requestedById, eventType: 'review.stale', reason: 'requester', title: `${title} changed since its v${r.approvedVersion} approval` })
    } else {
      await recomputeReview(r.id)
      // Reviewers whose decision no longer covers the content need to look again.
      for (const p of participants.filter((p) => p.decision !== 'pending' && !decisionIsCurrent(p.decidedAtVersion, v))) {
        notices.push({ ...base, userId: p.userId, eventType: 'review.updated', reason: 'reviewer', title: `${title} was revised to v${v?.version} — your review needs another look` })
      }
    }
  }
  if (notices.length) {
    const { publish } = await import('./notification-delivery')
    await publish(notices, { productId: rows[0].productId })
  }
}

/** The most recent version an approval covered, even if the subject has moved on since. */
export async function lastApprovedVersion(subjectType: ReviewSubjectType, subjectId: string): Promise<number | null> {
  const [row] = await db.select({ v: reviews.approvedVersion }).from(reviews)
    .where(and(eq(reviews.subjectType, subjectType), eq(reviews.subjectId, subjectId), isNotNull(reviews.approvedVersion), inArray(reviews.state, ['approved', 'stale'])))
    .orderBy(desc(reviews.approvedVersion)).limit(1)
  return row?.v ?? null
}

/** True when an approval still covers the subject's current content. */
export async function isApprovedNow(subjectType: ReviewSubjectType, subjectId: string): Promise<boolean> {
  const [approved, v] = await Promise.all([lastApprovedVersion(subjectType, subjectId), subjectVersion(subjectType, subjectId)])
  return decisionIsCurrent(approved, v)
}

/**
 * Plans have no content snapshots; their revision number moves when what the
 * plan commits to changes — scope (targets, addressed work items), linked
 * specs or the description — so plan reviews can pin to it.
 */
export async function bumpPlanRevision(planId: string, actorId?: string) {
  const [plan] = await db.update(codePlans).set({ revision: sql`${codePlans.revision} + 1` }).where(eq(codePlans.id, planId)).returning({ id: codePlans.id })
  if (plan) await onSubjectRevised('code_plan', planId, actorId)
}
