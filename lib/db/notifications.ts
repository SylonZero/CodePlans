import { and, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm'
import { db } from './index'
import { notifications } from './schema'

/**
 * In-app notification storage. Kept free of imports from the rest of the data
 * layer so review-state, audit and rules can all write here without cycles.
 * Rules for who gets told live in notification-rules.ts.
 */

export type NotificationInput = {
  userId: string
  eventId?: string | null
  eventType: string
  productId?: string | null
  subjectType: string
  subjectId: string
  reason: string
  title: string
  summary?: string
  url: string
  actorId?: string | null
  actorKind?: string | null
  /** Assets this notification is about, for asset mutes. Not stored. */
  assetIds?: string[]
}

export type NotificationRow = typeof notifications.$inferSelect

/**
 * Store in-app notifications as given. Most callers want publish() in
 * notification-delivery.ts, which applies the workspace's rules and also
 * queues email and Slack.
 */
export async function createNotifications(rows: NotificationInput[]) {
  return (await createNotificationRows(rows)).length
}

/** Insert notifications, skipping the actor and duplicates for the same event. Never throws. */
export async function createNotificationRows(rows: NotificationInput[]): Promise<{ id: string; userId: string; eventType: string }[]> {
  const seen = new Set<string>()
  const values = rows.filter((r) => {
    if (!r.userId || r.userId === r.actorId) return false
    const key = `${r.eventId ?? ''}:${r.userId}:${r.eventType}:${r.subjectId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  }).map(({ assetIds: _assets, ...r }) => ({ ...r, summary: r.summary ?? '' }))
  if (!values.length) return []
  try {
    return await db.insert(notifications).values(values).onConflictDoNothing()
      .returning({ id: notifications.id, userId: notifications.userId, eventType: notifications.eventType })
  } catch (err) {
    console.error('[notifications] insert failed:', err)
    return []
  }
}

/** Visible now: not done and not snoozed into the future. */
function activeFor(userId: string, now = new Date()) {
  return and(eq(notifications.userId, userId), isNull(notifications.doneAt), or(isNull(notifications.snoozedUntil), lte(notifications.snoozedUntil, now)))
}

export async function listNotifications(userId: string, opts: { limit?: number; productId?: string; includeDone?: boolean } = {}) {
  return db.select().from(notifications)
    .where(and(
      opts.includeDone ? eq(notifications.userId, userId) : activeFor(userId),
      opts.productId ? eq(notifications.productId, opts.productId) : undefined,
    ))
    .orderBy(desc(notifications.createdAt))
    .limit(opts.limit ?? 50)
}

export async function countUnread(userId: string) {
  const [row] = await db.select({ n: sql<number>`CAST(count(*) AS INTEGER)` }).from(notifications)
    .where(and(activeFor(userId), isNull(notifications.readAt)))
  return Number(row?.n ?? 0)
}

/** All mutations are scoped to the owner: a user can only change their own notifications. */
export async function markRead(userId: string, ids: string[]) {
  if (!ids.length) return
  await db.update(notifications).set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids), isNull(notifications.readAt)))
}

export async function markAllRead(userId: string) {
  await db.update(notifications).set({ readAt: new Date() }).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
}

export async function markDone(userId: string, ids: string[], done = true) {
  if (!ids.length) return
  await db.update(notifications).set(done ? { doneAt: new Date(), readAt: new Date() } : { doneAt: null })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
}

export async function snooze(userId: string, ids: string[], until: Date) {
  if (!ids.length) return
  await db.update(notifications).set({ snoozedUntil: until, readAt: new Date() })
    .where(and(eq(notifications.userId, userId), inArray(notifications.id, ids)))
}

/** Marking a subject's notifications done once the person acts on it (e.g. decides a review). */
export async function completeForSubject(userId: string, subjectType: string, subjectId: string, eventTypes: string[]) {
  await db.update(notifications).set({ doneAt: new Date(), readAt: new Date() })
    .where(and(eq(notifications.userId, userId), eq(notifications.subjectType, subjectType), eq(notifications.subjectId, subjectId),
      inArray(notifications.eventType, eventTypes), isNull(notifications.doneAt)))
}

export async function recentNotificationsSince(userId: string, since: Date) {
  return db.select().from(notifications).where(and(eq(notifications.userId, userId), gt(notifications.createdAt, since))).orderBy(desc(notifications.createdAt))
}
