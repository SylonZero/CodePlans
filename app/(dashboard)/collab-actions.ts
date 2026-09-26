'use server'

import { revalidatePath } from 'next/cache'
import { authAdapter } from '@/lib/auth'
import { addComment, editComment, deleteComment, resolveComment, type commentInput } from '@/lib/db/comments'
import { requestReview, decideReview, withdrawReview, addReviewers, removeReviewer, type reviewRequestInput } from '@/lib/db/reviews'
import { setProductWorkflowLevel, setOrgWorkflowDefault, checkActivation } from '@/lib/db/workflow'
import type { WorkflowLevel } from '@/lib/db/schema.sqlite'
import type { z } from 'zod'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

async function actor() {
  const user = await authAdapter.getUser()
  if (!user) throw new Error('Unauthorized')
  return { id: user.id, kind: 'user' as const }
}

/** Mutations re-render whatever page they were made from. */
function refresh(path: string | undefined) {
  if (path) revalidatePath(path)
  revalidatePath('/specs')
}

async function run<T extends object>(path: string | undefined, fn: () => Promise<T>): Promise<Result<T>> {
  try {
    const value = await fn()
    refresh(path)
    return { ok: true, ...value }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

// Comments ------------------------------------------------------------------

export async function addCommentAction(input: z.input<typeof commentInput>, path?: string) {
  return run(path, async () => ({ comment: await addComment(input, await actor()) }))
}

export async function editCommentAction(id: string, body: string, path?: string) {
  return run(path, async () => { await editComment(id, body, await actor()); return {} })
}

export async function deleteCommentAction(id: string, path?: string) {
  return run(path, async () => { await deleteComment(id, await actor()); return {} })
}

export async function resolveCommentAction(id: string, resolved: boolean, path?: string) {
  return run(path, async () => { await resolveComment(id, resolved, await actor()); return {} })
}

// Reviews -------------------------------------------------------------------

export async function requestReviewAction(input: z.input<typeof reviewRequestInput>, path?: string) {
  return run(path, async () => ({ reviewId: (await requestReview(input, await actor())).id }))
}

export async function decideReviewAction(reviewId: string, decision: 'approved' | 'changes_requested' | 'commented', note: string | undefined, path?: string) {
  return run(path, async () => ({ state: (await decideReview(reviewId, decision, note, await actor())).state }))
}

export async function withdrawReviewAction(reviewId: string, path?: string) {
  return run(path, async () => { await withdrawReview(reviewId, await actor()); return {} })
}

export async function addReviewersAction(reviewId: string, reviewers: { userId: string; required?: boolean }[], path?: string) {
  return run(path, async () => addReviewers(reviewId, reviewers, await actor()))
}

export async function removeReviewerAction(reviewId: string, userId: string, path?: string) {
  return run(path, async () => { await removeReviewer(reviewId, userId, await actor()); return {} })
}

// Workflow ------------------------------------------------------------------

export async function setProductWorkflowAction(productId: string, level: WorkflowLevel | null, path?: string) {
  return run(path, async () => setProductWorkflowLevel(productId, level, await actor()))
}

export async function setOrgWorkflowAction(organizationId: string, level: WorkflowLevel) {
  return run('/settings', async () => setOrgWorkflowDefault(organizationId, level, await actor()))
}

/** Asked before activating so the UI can confirm a guided-workflow warning or show why it is blocked. */
export async function checkActivationAction(subjectType: 'spec' | 'code_plan', subjectId: string) {
  return checkActivation({ subjectType, subjectId, transition: 'activate', actor: await actor() })
}

/** Discussion data for client-loaded panels (e.g. the work item sheet). */
export async function loadDiscussionAction(subjectType: 'spec' | 'code_plan' | 'work_item' | 'release' | 'asset', subjectId: string) {
  const me = await actor()
  const { listComments, getProductAudience, resolveCommentSubject } = await import('@/lib/db/comments')
  const { canWriteProduct } = await import('@/lib/db/authz')
  const subject = await resolveCommentSubject(subjectType, subjectId)
  if (!subject) return null
  const [threads, audience, canModerate] = await Promise.all([
    listComments(subjectType, subjectId, me.id), getProductAudience(subject.productId), canWriteProduct(me.id, subject.productId),
  ])
  return { threads, audience: audience.map((u) => ({ id: u.id, name: u.name })), canModerate, currentUserId: me.id, currentVersion: subject.version }
}

// Notifications ---------------------------------------------------------------

export type BellNotification = { id: string; eventType: string; title: string; summary: string; url: string; reason: string; read: boolean; createdAt: string }

export async function bellAction(limit = 12): Promise<{ unread: number; items: BellNotification[] }> {
  const me = await actor()
  const { listNotifications, countUnread } = await import('@/lib/db/notifications')
  const [rows, unread] = await Promise.all([listNotifications(me.id, { limit }), countUnread(me.id)])
  return {
    unread,
    items: rows.map((n) => ({ id: n.id, eventType: n.eventType, title: n.title, summary: n.summary, url: n.url, reason: n.reason, read: !!n.readAt, createdAt: n.createdAt.toISOString() })),
  }
}

export async function unreadCountAction() {
  const { countUnread } = await import('@/lib/db/notifications')
  return countUnread((await actor()).id)
}

export async function markNotificationsReadAction(ids: string[] | 'all') {
  const me = await actor()
  const { markRead, markAllRead } = await import('@/lib/db/notifications')
  if (ids === 'all') await markAllRead(me.id)
  else await markRead(me.id, ids)
  revalidatePath('/my-work')
}

export async function markNotificationsDoneAction(ids: string[], done = true) {
  const me = await actor()
  const { markDone } = await import('@/lib/db/notifications')
  await markDone(me.id, ids, done)
  revalidatePath('/my-work')
}

export async function snoozeNotificationsAction(ids: string[], days: number) {
  const me = await actor()
  const { snooze } = await import('@/lib/db/notifications')
  await snooze(me.id, ids, new Date(Date.now() + Math.min(Math.max(days, 1), 30) * 86_400_000))
  revalidatePath('/my-work')
}
