import { and, eq, inArray, lt, lte } from 'drizzle-orm'
import { db } from './index'
import { notificationDeliveries, notifications, products, users, workItems } from './schema'
import { createNotificationRows, type NotificationInput } from './notifications'
import {
  emailOptedOut, getEffectiveRules, mutesFor, markChannelResult, resolveChannel, resolveChannelById, type ResolvedChannel,
} from './notification-settings'
import { ForbiddenError, isOrgAdmin } from './authz'
import type { ArtifactActor } from './attribution'
import { renderEmail, renderSlack } from '@/lib/notify/templates'
import { DeliveryError, postSlackWebhook, sendResendEmail } from '@/lib/notify/transports'

/**
 * One way out for every notification. publish() applies the workspace's rules
 * (is the event on, which channels), writes in-app rows, and queues email and
 * Slack in the notification_deliveries outbox. processDeliveries() sends what
 * is due, after the response or from /api/cron/notifications, retrying with
 * backoff. Nothing here throws into the mutation that caused the event.
 */

export const MAX_ATTEMPTS = 5
const RETENTION_DAYS = 90

export type PublishContext = {
  organizationId?: string | null
  productId?: string | null
  /** The sync_log event, which makes queuing idempotent. */
  eventId?: string | null
  actorKind?: string | null
  /** Posted once to the workspace's Slack channel when the event's rule has Slack on. */
  broadcast?: { eventType: string; title: string; summary?: string; url: string }
}

type DeliveryInsert = typeof notificationDeliveries.$inferInsert

async function orgFor(ctx: PublishContext, rows: NotificationInput[]) {
  if (ctx.organizationId) return ctx.organizationId
  const productId = ctx.productId ?? rows.find((r) => r.productId)?.productId
  if (!productId) return null
  return (await db.query.products.findFirst({ where: eq(products.id, productId) }))?.organizationId ?? null
}

async function productName(productId: string | null | undefined) {
  if (!productId) return null
  return (await db.query.products.findFirst({ where: eq(products.id, productId) }))?.name ?? null
}

/** Run after the response when inside a request; inline otherwise (scripts, tests, cron). */
async function soon(fn: () => Promise<unknown>) {
  try {
    const { after } = await import('next/server')
    after(fn)
  } catch {
    await fn()
  }
}

export async function publish(rows: NotificationInput[], ctx: PublishContext = {}): Promise<{ inApp: number; queued: number }> {
  try {
    const organizationId = await orgFor(ctx, rows)
    const rule = await getEffectiveRules(organizationId)
    const byAgent = ctx.actorKind === 'agent'
    const on = (type: string) => { const r = rule(type); return r.enabled && (!byAgent || r.includeAgents) ? r : null }

    const wanted = rows.filter((r) => r.userId && r.userId !== r.actorId && on(r.eventType))
    const kept = (await dropMuted(wanted, rule)).map((r) => ({ ...r, eventId: r.eventId ?? ctx.eventId ?? null }))
    const created = await createNotificationRows(kept.filter((r) => on(r.eventType)!.inApp))
    if (!organizationId) return { inApp: created.length, queued: 0 }

    const queue: DeliveryInsert[] = []
    const product = await productName(ctx.productId ?? rows[0]?.productId)

    // Email: one per person per event, for events with email on, unless they opted out.
    const emailRows = kept.filter((r, i) => on(r.eventType)!.email && kept.findIndex((x) => x.userId === r.userId) === i)
    const email = emailRows.length ? await resolveChannel(organizationId, 'email_resend') : null
    if (email) {
      const people = await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.id, emailRows.map((r) => r.userId)))
      const address = new Map(people.map((p) => [p.id, p.email]))
      const optedOut = new Map<string, Set<string>>()
      for (const r of emailRows) {
        if (!optedOut.has(r.eventType)) optedOut.set(r.eventType, await emailOptedOut(emailRows.map((x) => x.userId), r.eventType))
        const to = address.get(r.userId)
        if (!to || optedOut.get(r.eventType)!.has(r.userId)) continue
        const notification = created.find((c) => c.userId === r.userId)
        const message = renderEmail({ eventType: r.eventType, title: r.title, summary: r.summary, url: r.url, productName: product, reason: r.reason, byAgent })
        queue.push({
          organizationId, eventId: ctx.eventId ?? r.eventId ?? notification?.id ?? crypto.randomUUID(), eventType: r.eventType,
          channelId: email.id, channelKind: 'email_resend', target: r.userId, payload: { to, ...message },
        })
      }
    }

    // Slack: one post per event to the workspace channel, whoever was told in-app.
    const b = ctx.broadcast
    const slack = b && on(b.eventType)?.slack ? await resolveChannel(organizationId, 'slack_webhook') : null
    if (b && slack) {
      queue.push({
        organizationId, eventId: ctx.eventId ?? crypto.randomUUID(), eventType: b.eventType, channelId: slack.id, channelKind: 'slack_webhook', target: 'channel',
        payload: renderSlack({ eventType: b.eventType, title: b.title, summary: b.summary, url: b.url, productName: product, byAgent }),
      })
    }

    if (!queue.length) return { inApp: created.length, queued: 0 }
    const inserted = await db.insert(notificationDeliveries).values(queue).onConflictDoNothing().returning({ id: notificationDeliveries.id })
    if (inserted.length) await soon(() => processDeliveries({ ids: inserted.map((i) => i.id) }))
    return { inApp: created.length, queued: inserted.length }
  } catch (err) {
    console.error('[notifications] publish failed:', err)
    return { inApp: 0, queued: 0 }
  }
}

/** The asset a subject belongs to, when it has exactly one (an asset, or a work item on one). */
async function subjectAsset(subjectType: string, subjectId: string, cache: Map<string, string | null>) {
  const key = `${subjectType}:${subjectId}`
  if (!cache.has(key)) {
    let id: string | null = null
    if (subjectType === 'asset') id = subjectId
    else if (subjectType === 'work_item') id = (await db.query.workItems.findFirst({ where: eq(workItems.id, subjectId) }))?.assetId ?? null
    cache.set(key, id)
  }
  return cache.get(key)!
}

/**
 * Leave out people who muted the product or asset a notification is about.
 * An asset mute covers notices about that asset and notices someone gets only
 * because they own it. Required events always get through.
 */
async function dropMuted(rows: NotificationInput[], rule: (type: string) => { mandatory: boolean }) {
  const mutes = await mutesFor([...new Set(rows.map((r) => r.userId))])
  if (!mutes.size) return rows
  const cache = new Map<string, string | null>()
  const out: NotificationInput[] = []
  for (const r of rows) {
    if (rule(r.eventType).mandatory) { out.push(r); continue }
    const has = (type: string, id: string | null | undefined) => !!id && mutes.has(`${r.userId}:${type}:${id}`)
    if (has('product', r.productId)) continue
    if (has('asset', await subjectAsset(r.subjectType, r.subjectId, cache))) continue
    if (r.assetIds?.length && r.assetIds.every((id) => has('asset', id))) continue
    out.push(r)
  }
  return out
}

function backoffMs(attempt: number) {
  return Math.min(60, 2 ** (attempt - 1)) * 60_000 // 1, 2, 4, 8 minutes…
}

async function send(channel: ResolvedChannel, payload: Record<string, unknown>) {
  if (channel.kind === 'email_resend') {
    await sendResendEmail(channel.secret, {
      from: channel.config.fromAddress, replyTo: channel.config.replyTo, to: String(payload.to),
      subject: String(payload.subject), html: String(payload.html), text: String(payload.text),
    })
  } else {
    await postSlackWebhook(channel.secret, { text: String(payload.text), blocks: payload.blocks as unknown[] | undefined })
  }
}

/** Send deliveries that are due. Each row is claimed first, so overlapping runs never double-send. */
export async function processDeliveries(opts: { ids?: string[]; limit?: number } = {}) {
  const result = { sent: 0, retrying: 0, failed: 0, skipped: 0 }
  try {
    const now = new Date()
    const due = await db.select().from(notificationDeliveries)
      .where(and(eq(notificationDeliveries.status, 'pending'), lte(notificationDeliveries.nextAttemptAt, now), opts.ids ? inArray(notificationDeliveries.id, opts.ids) : undefined))
      .orderBy(notificationDeliveries.nextAttemptAt).limit(opts.limit ?? 50)
    const channels = new Map<string, ResolvedChannel | null>()
    for (const d of due) {
      const attempts = d.attempts + 1
      const [claimed] = await db.update(notificationDeliveries).set({ status: 'sending', attempts, nextAttemptAt: new Date() })
        .where(and(eq(notificationDeliveries.id, d.id), eq(notificationDeliveries.status, 'pending'))).returning({ id: notificationDeliveries.id })
      if (!claimed) continue
      if (!channels.has(d.channelId)) channels.set(d.channelId, await resolveChannelById(d.channelId))
      const channel = channels.get(d.channelId)
      if (!channel) {
        await db.update(notificationDeliveries).set({ status: 'skipped', lastError: 'The channel was removed, paused or has no key' }).where(eq(notificationDeliveries.id, d.id))
        result.skipped++
        continue
      }
      try {
        await send(channel, d.payload as Record<string, unknown>)
        await db.update(notificationDeliveries).set({ status: 'sent', sentAt: new Date(), lastError: null }).where(eq(notificationDeliveries.id, d.id))
        await markChannelResult(channel.id, null)
        result.sent++
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        const giveUp = (err instanceof DeliveryError && err.permanent) || attempts >= MAX_ATTEMPTS
        await db.update(notificationDeliveries).set({ status: giveUp ? 'failed' : 'pending', lastError: message, nextAttemptAt: new Date(Date.now() + backoffMs(attempts)) })
          .where(eq(notificationDeliveries.id, d.id))
        await markChannelResult(channel.id, message)
        if (giveUp) result.failed++
        else result.retrying++
      }
    }
  } catch (err) {
    console.error('[notifications] delivery run failed:', err)
  }
  return result
}

/**
 * The periodic job: put back rows a crashed run left mid-send, send what's
 * due, and drop finished rows past retention (sync_log stays the record).
 */
export async function runNotificationJobs(now = new Date()) {
  await db.update(notificationDeliveries).set({ status: 'pending' })
    .where(and(eq(notificationDeliveries.status, 'sending'), lt(notificationDeliveries.nextAttemptAt, new Date(now.getTime() - 10 * 60_000))))
  const result = await processDeliveries({ limit: 200 })
  const cutoff = new Date(now.getTime() - RETENTION_DAYS * 86_400_000)
  await db.delete(notificationDeliveries).where(and(inArray(notificationDeliveries.status, ['sent', 'failed', 'skipped']), lt(notificationDeliveries.createdAt, cutoff)))
  await db.delete(notifications).where(lt(notifications.doneAt, cutoff))
  return result
}

// ── Test sends from settings ─────────────────────────────────────────────────

async function requireAdmin(organizationId: string, actor: ArtifactActor) {
  if (!(await isOrgAdmin(organizationId, actor.id))) throw new ForbiddenError('Only an org owner or admin can send test notifications.')
}

/** Send a test email to the admin now, bypassing the outbox, and report the provider's answer. */
export async function sendTestEmail(organizationId: string, actor: ArtifactActor): Promise<{ ok: true; to: string } | { ok: false; error: string }> {
  await requireAdmin(organizationId, actor)
  const channel = await resolveChannel(organizationId, 'email_resend', { includePaused: true })
  if (!channel) return { ok: false, error: 'Add a Resend API key first (or set RESEND_API_KEY).' }
  const me = await db.query.users.findFirst({ where: eq(users.id, actor.id) })
  if (!me?.email) return { ok: false, error: 'Your account has no email address.' }
  const message = renderEmail({ eventType: 'test', title: 'Test email from CodePlans', summary: 'If you can read this, email notifications are set up.', url: '/settings/notifications' })
  try {
    await send(channel, { to: me.email, ...message })
    await markChannelResult(channel.id, null)
    return { ok: true, to: me.email }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await markChannelResult(channel.id, error)
    return { ok: false, error }
  }
}

export async function sendTestSlack(organizationId: string, actor: ArtifactActor): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireAdmin(organizationId, actor)
  const channel = await resolveChannel(organizationId, 'slack_webhook', { includePaused: true })
  if (!channel) return { ok: false, error: 'Add a Slack webhook URL first.' }
  const me = await db.query.users.findFirst({ where: eq(users.id, actor.id) })
  const message = renderSlack({ eventType: 'test', title: 'Test message from CodePlans', summary: `Sent by ${me?.name ?? 'an admin'}. Notifications will post here.`, url: '/settings/notifications' })
  try {
    await send(channel, message)
    await markChannelResult(channel.id, null)
    return { ok: true }
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    await markChannelResult(channel.id, error)
    return { ok: false, error }
  }
}
