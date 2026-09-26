import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from './index'
import { assets, notificationChannels, notificationDeliveries, notificationMutes, notificationPreferences, notificationRules, products } from './schema'
import type { NotificationChannelKind, NotificationChannelStatus, NotificationMuteSubject } from './schema.sqlite'
import { ForbiddenError, NOT_ACCESSIBLE_MESSAGE, getProductRole, isOrgAdmin } from './authz'
import type { ArtifactActor } from './attribution'
import { encryptToken, decryptToken } from '@/lib/integrations/secrets'
import { NOTIFICATION_CATALOG, catalogEntry, type ChannelFlags } from '@/lib/notification-catalog'
import { validateEmail, validateFromAddress, validateWebhookUrl } from '@/lib/notify/transports'

/**
 * Workspace notification settings: which events notify and where (rules),
 * where email and Slack go (channels), and each person's email opt-outs.
 * Rules and channels are org-admin only. Preferences only ever narrow what
 * admins turned on.
 */

export type EffectiveRule = ChannelFlags & { enabled: boolean; includeAgents: boolean; mandatory: boolean }

const ADMIN_ONLY = 'Only an org owner or admin can change workspace notifications.'

async function requireAdmin(organizationId: string, actor: ArtifactActor) {
  if (!(await isOrgAdmin(organizationId, actor.id))) throw new ForbiddenError(ADMIN_ONLY)
}

// ── Rules ────────────────────────────────────────────────────────────────────

function withMandatory(type: string, r: Omit<EffectiveRule, 'mandatory'>): EffectiveRule {
  const mandatory = !!catalogEntry(type)?.mandatory
  // Mandatory events always reach people in-app, whatever else is switched off.
  return mandatory ? { ...r, enabled: true, inApp: true, includeAgents: true, mandatory } : { ...r, mandatory }
}

function defaultRule(type: string): EffectiveRule {
  const entry = catalogEntry(type)
  // Events outside the catalog stay in-app only.
  const d = entry?.defaults ?? { inApp: true, email: false, slack: false }
  return withMandatory(type, { ...d, enabled: true, includeAgents: true })
}

/** Effective rule per event type for an org: catalog defaults overlaid with admin changes. */
export async function getEffectiveRules(organizationId: string | null | undefined): Promise<(type: string) => EffectiveRule> {
  const rows = organizationId ? await db.select().from(notificationRules).where(eq(notificationRules.organizationId, organizationId)) : []
  const byType = new Map(rows.map((r) => [r.eventType, r]))
  return (type: string) => {
    const r = byType.get(type)
    return r ? withMandatory(type, { enabled: r.enabled, inApp: r.inApp, email: r.email, slack: r.slack, includeAgents: r.includeAgents }) : defaultRule(type)
  }
}

export async function listNotificationRules(organizationId: string) {
  const rows = await db.select().from(notificationRules).where(eq(notificationRules.organizationId, organizationId))
  const customized = new Set(rows.map((r) => r.eventType))
  const rule = await getEffectiveRules(organizationId)
  return NOTIFICATION_CATALOG.map((e) => ({ ...e, rule: rule(e.type), customized: customized.has(e.type) }))
}

export type RulePatch = Partial<Pick<EffectiveRule, 'enabled' | 'inApp' | 'email' | 'slack' | 'includeAgents'>>

export async function setNotificationRule(organizationId: string, eventType: string, patch: RulePatch, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  if (!catalogEntry(eventType)) throw new Error(`Unknown event type "${eventType}"`)
  const current = (await getEffectiveRules(organizationId))(eventType)
  const next = withMandatory(eventType, {
    enabled: patch.enabled ?? current.enabled, inApp: patch.inApp ?? current.inApp, email: patch.email ?? current.email,
    slack: patch.slack ?? current.slack, includeAgents: patch.includeAgents ?? current.includeAgents,
  })
  const values = { enabled: next.enabled, inApp: next.inApp, email: next.email, slack: next.slack, includeAgents: next.includeAgents, updatedById: actor.id, updatedAt: new Date() }
  await db.insert(notificationRules).values({ organizationId, eventType, ...values })
    .onConflictDoUpdate({ target: [notificationRules.organizationId, notificationRules.eventType], set: values })
  return next
}

/** Back to the catalog defaults for every event. */
export async function resetNotificationRules(organizationId: string, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  await db.delete(notificationRules).where(eq(notificationRules.organizationId, organizationId))
}

// ── Channels ─────────────────────────────────────────────────────────────────

export const ENV_EMAIL_CHANNEL_ID = 'env:email'
const DEFAULT_FROM = 'CodePlans <noreply@codeplans.ai>'

export type ResolvedChannel = {
  id: string
  kind: NotificationChannelKind
  secret: string
  config: Record<string, string>
  status: NotificationChannelStatus
}

function envEmail(): ResolvedChannel | null {
  const key = process.env.RESEND_API_KEY
  return key ? { id: ENV_EMAIL_CHANNEL_ID, kind: 'email_resend', secret: key, config: { fromAddress: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM }, status: 'active' } : null
}

function secretOf(row: typeof notificationChannels.$inferSelect) {
  if (row.secretEncrypted) {
    const s = decryptToken(row.secretEncrypted)
    if (s) return s
  }
  if (row.authRef) return process.env[row.authRef] ?? null
  return row.kind === 'email_resend' ? process.env.RESEND_API_KEY ?? null : null
}

/**
 * The channel to deliver through, or null when there's nowhere to send (none
 * configured, paused, or no usable secret). Email falls back to the
 * RESEND_API_KEY env var so self-hosted setups work without any settings.
 */
export async function resolveChannel(organizationId: string, kind: NotificationChannelKind, opts: { includePaused?: boolean } = {}): Promise<ResolvedChannel | null> {
  const row = await db.query.notificationChannels.findFirst({ where: and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.kind, kind)) })
  if (!row) return kind === 'email_resend' ? envEmail() : null
  if (row.status === 'paused' && !opts.includePaused) return null
  const secret = secretOf(row)
  if (!secret) return null
  const config = { ...(row.config ?? {}) } as Record<string, string>
  if (kind === 'email_resend' && !config.fromAddress) config.fromAddress = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM
  return { id: row.id, kind, secret, config, status: row.status }
}

export async function resolveChannelById(id: string): Promise<ResolvedChannel | null> {
  if (id === ENV_EMAIL_CHANNEL_ID) return envEmail()
  const row = await db.query.notificationChannels.findFirst({ where: eq(notificationChannels.id, id) })
  if (!row || row.status === 'paused') return null
  const secret = secretOf(row)
  if (!secret) return null
  const config = { ...(row.config ?? {}) } as Record<string, string>
  if (row.kind === 'email_resend' && !config.fromAddress) config.fromAddress = process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM
  return { id: row.id, kind: row.kind, secret, config, status: row.status }
}

function hint(secret: string | null, kind: NotificationChannelKind) {
  if (!secret) return null
  if (kind === 'slack_webhook') {
    try { const u = new URL(secret); return `${u.host}/…${secret.slice(-4)}` } catch { return `…${secret.slice(-4)}` }
  }
  return `${secret.slice(0, 3)}…${secret.slice(-4)}`
}

/** What the settings page shows. Secrets never leave the server; only a hint does. */
export async function listChannels(organizationId: string) {
  const rows = await db.select().from(notificationChannels).where(eq(notificationChannels.organizationId, organizationId))
  const view = (kind: NotificationChannelKind) => {
    const row = rows.find((r) => r.kind === kind)
    if (!row) {
      const env = kind === 'email_resend' ? envEmail() : null
      return { kind, configured: !!env, source: env ? 'env' as const : null, status: env ? 'active' as NotificationChannelStatus : null,
        config: env?.config ?? {}, secretHint: env ? hint(env.secret, kind) : null, lastError: null, lastUsedAt: null }
    }
    const secret = secretOf(row)
    return { kind, configured: !!secret, source: row.secretEncrypted ? 'settings' as const : 'env' as const, status: row.status,
      config: (row.config ?? {}) as Record<string, string>, secretHint: hint(secret, kind), lastError: row.lastError, lastUsedAt: row.lastUsedAt }
  }
  return { email: view('email_resend'), slack: view('slack_webhook') }
}

async function upsertChannel(organizationId: string, kind: NotificationChannelKind, name: string, config: Record<string, string>, secret: string | undefined, actor: ArtifactActor) {
  const existing = await db.query.notificationChannels.findFirst({ where: and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.kind, kind)) })
  const secretEncrypted = secret ? encryptToken(secret) : undefined
  if (existing) {
    await db.update(notificationChannels).set({ name, config, ...(secretEncrypted ? { secretEncrypted } : {}),
      status: existing.status === 'paused' ? 'paused' : 'active', lastError: null })
      .where(eq(notificationChannels.id, existing.id))
  } else {
    await db.insert(notificationChannels).values({ organizationId, kind, name, config, secretEncrypted: secretEncrypted ?? null, createdById: actor.id })
  }
}

/** Save Resend settings. Leave the API key blank to keep the stored one (or use RESEND_API_KEY). */
export async function saveEmailChannel(organizationId: string, input: { apiKey?: string; fromAddress: string; replyTo?: string }, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  const fromAddress = input.fromAddress.trim()
  const fromError = validateFromAddress(fromAddress)
  if (fromError) throw new Error(fromError)
  const replyTo = input.replyTo?.trim() ?? ''
  if (replyTo) { const e = validateEmail(replyTo); if (e) throw new Error(`Reply-to: ${e}`) }
  const apiKey = input.apiKey?.trim()
  if (apiKey && !/^re_[A-Za-z0-9_]{8,}$/.test(apiKey)) throw new Error('That doesn\'t look like a Resend API key (it starts with re_)')
  await upsertChannel(organizationId, 'email_resend', 'Email (Resend)', { fromAddress, ...(replyTo ? { replyTo } : {}) }, apiKey || undefined, actor)
  return listChannels(organizationId)
}

/** Save the Slack incoming webhook. Leave the URL blank to keep the stored one. */
export async function saveSlackChannel(organizationId: string, input: { webhookUrl?: string; channelLabel?: string }, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  const url = input.webhookUrl?.trim()
  if (url) { const e = validateWebhookUrl(url); if (e) throw new Error(e) }
  const existing = await db.query.notificationChannels.findFirst({ where: and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.kind, 'slack_webhook')) })
  if (!url && !existing?.secretEncrypted) throw new Error('Paste the Slack incoming webhook URL')
  const label = input.channelLabel?.trim().replace(/^#?/, '#') ?? ''
  await upsertChannel(organizationId, 'slack_webhook', 'Slack', label && label !== '#' ? { channelLabel: label } : {}, url || undefined, actor)
  return listChannels(organizationId)
}

export async function setChannelPaused(organizationId: string, kind: NotificationChannelKind, paused: boolean, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  await db.update(notificationChannels).set({ status: paused ? 'paused' : 'active', ...(paused ? {} : { lastError: null }) })
    .where(and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.kind, kind)))
}

export async function removeChannel(organizationId: string, kind: NotificationChannelKind, actor: ArtifactActor) {
  await requireAdmin(organizationId, actor)
  await db.delete(notificationChannels).where(and(eq(notificationChannels.organizationId, organizationId), eq(notificationChannels.kind, kind)))
}

/** Record the outcome of a send on the channel so the settings page shows its health. */
export async function markChannelResult(channelId: string, error: string | null) {
  if (channelId === ENV_EMAIL_CHANNEL_ID) return
  await db.update(notificationChannels)
    .set(error ? { status: 'error', lastError: error } : { status: 'active', lastError: null, lastUsedAt: new Date() })
    // A paused channel stays paused.
    .where(and(eq(notificationChannels.id, channelId), inArray(notificationChannels.status, ['active', 'error'])))
}

export async function listRecentDeliveries(organizationId: string, limit = 20) {
  return db.select({
    id: notificationDeliveries.id, eventType: notificationDeliveries.eventType, channelKind: notificationDeliveries.channelKind,
    target: notificationDeliveries.target, status: notificationDeliveries.status, attempts: notificationDeliveries.attempts,
    lastError: notificationDeliveries.lastError, createdAt: notificationDeliveries.createdAt, sentAt: notificationDeliveries.sentAt,
    payload: notificationDeliveries.payload,
  }).from(notificationDeliveries).where(eq(notificationDeliveries.organizationId, organizationId))
    .orderBy(desc(notificationDeliveries.createdAt)).limit(limit)
}

// ── Personal preferences ─────────────────────────────────────────────────────

export const ALL_EVENTS = '*'

/** A person's email switches: '*' for all email, plus per-event overrides. Missing means on. */
export async function getEmailPreferences(userId: string): Promise<Record<string, boolean>> {
  const rows = await db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId))
  return Object.fromEntries(rows.filter((r) => r.email !== null).map((r) => [r.eventType, r.email as boolean]))
}

export async function setEmailPreference(userId: string, eventType: string, email: boolean) {
  if (eventType !== ALL_EVENTS && !catalogEntry(eventType)) throw new Error(`Unknown event type "${eventType}"`)
  if (email) {
    await db.delete(notificationPreferences).where(and(eq(notificationPreferences.userId, userId), eq(notificationPreferences.eventType, eventType)))
    return
  }
  await db.insert(notificationPreferences).values({ userId, eventType, email: false, updatedAt: new Date() })
    .onConflictDoUpdate({ target: [notificationPreferences.userId, notificationPreferences.eventType], set: { email: false, updatedAt: new Date() } })
}

/** Of these people, who has turned off email for this event (or all email). */
export async function emailOptedOut(userIds: string[], eventType: string): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows = await db.select().from(notificationPreferences)
    .where(and(inArray(notificationPreferences.userId, userIds), inArray(notificationPreferences.eventType, [eventType, ALL_EVENTS]), eq(notificationPreferences.email, false)))
  return new Set(rows.map((r) => r.userId))
}

// ── Mutes ────────────────────────────────────────────────────────────────────

async function assertCanSee(userId: string, subjectType: NotificationMuteSubject, subjectId: string) {
  let productId: string | null = subjectId
  if (subjectType === 'asset') productId = (await db.query.assets.findFirst({ where: eq(assets.id, subjectId) }))?.productId ?? null
  if (!productId || (await getProductRole(userId, productId, { includeArchived: true })) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
}

/**
 * Stop notifications about a product or asset reaching this person, in-app
 * and by email. Required events (review requests, changes requested,
 * mentions) still come through: they ask for this person specifically.
 */
export async function setMuted(userId: string, subjectType: NotificationMuteSubject, subjectId: string, muted: boolean) {
  if (subjectType !== 'product' && subjectType !== 'asset') throw new Error('Only products and assets can be muted')
  if (!muted) {
    await db.delete(notificationMutes).where(and(eq(notificationMutes.userId, userId), eq(notificationMutes.subjectType, subjectType), eq(notificationMutes.subjectId, subjectId)))
    return false
  }
  await assertCanSee(userId, subjectType, subjectId)
  await db.insert(notificationMutes).values({ userId, subjectType, subjectId }).onConflictDoNothing()
  return true
}

export async function isMuted(userId: string, subjectType: NotificationMuteSubject, subjectId: string) {
  return !!(await db.query.notificationMutes.findFirst({ where: and(eq(notificationMutes.userId, userId), eq(notificationMutes.subjectType, subjectType), eq(notificationMutes.subjectId, subjectId)) }))
}

/** A person's mutes with names, for settings. Mutes whose product or asset is gone are dropped. */
export async function listMutes(userId: string) {
  const rows = await db.select().from(notificationMutes).where(eq(notificationMutes.userId, userId))
  const productIds = rows.filter((r) => r.subjectType === 'product').map((r) => r.subjectId)
  const assetIds = rows.filter((r) => r.subjectType === 'asset').map((r) => r.subjectId)
  const productRows = productIds.length ? await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(inArray(products.id, productIds)) : []
  const assetRows = assetIds.length ? await db.select({ id: assets.id, name: assets.name, productName: products.name }).from(assets)
    .innerJoin(products, eq(assets.productId, products.id)).where(inArray(assets.id, assetIds)) : []
  const gone = rows.filter((r) => !(r.subjectType === 'product' ? productRows.some((p) => p.id === r.subjectId) : assetRows.some((a) => a.id === r.subjectId)))
  if (gone.length) await db.delete(notificationMutes).where(inArray(notificationMutes.id, gone.map((g) => g.id)))
  return [
    ...productRows.map((p) => ({ subjectType: 'product' as const, subjectId: p.id, name: p.name, context: null as string | null, href: `/products/${p.slug}` })),
    ...assetRows.map((a) => ({ subjectType: 'asset' as const, subjectId: a.id, name: a.name, context: a.productName, href: `/assets/${a.id}` })),
  ].sort((a, b) => a.name.localeCompare(b.name))
}

/** Every mute held by these people, as "userId:type:id" keys for quick checks. */
export async function mutesFor(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set()
  const rows = await db.select().from(notificationMutes).where(inArray(notificationMutes.userId, userIds))
  return new Set(rows.map((r) => `${r.userId}:${r.subjectType}:${r.subjectId}`))
}
