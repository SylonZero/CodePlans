import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, notificationDeliveries, notificationChannels, integrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, linkSpec } from '@/lib/db/specs'
import { setAssetOwners, createWorkItem } from '@/lib/db/mutations'
import { addProductMember } from '@/lib/db/responsibilities'
import { requestReview } from '@/lib/db/reviews'
import { listNotifications } from '@/lib/db/notifications'
import {
  getEffectiveRules, listNotificationRules, setNotificationRule, resetNotificationRules, saveEmailChannel, saveSlackChannel,
  listChannels, setChannelPaused, removeChannel, setEmailPreference, getEmailPreferences, resolveChannel,
} from '@/lib/db/notification-settings'
import { publish, processDeliveries, runNotificationJobs, sendTestEmail, sendTestSlack, MAX_ATTEMPTS } from '@/lib/db/notification-delivery'
import { notifyIntegrationError } from '@/lib/db/notification-rules'
import { renderEmail, renderSlack } from '@/lib/notify/templates'
import { validateWebhookUrl } from '@/lib/notify/transports'
import { GET as cronGET } from '@/app/api/cron/notifications/route'

const ERIN = 'user-erin-d' // editor, code owner of the API asset
const HOOK = 'https://hooks.slack.com/services/T000/B000/secretsecret'
const KEY = 're_test_1234567890abcdef'

type Call = { url: string; body: any; auth?: string }
let calls: Call[] = []
let respond: (url: string) => Response = () => new Response('{"id":"x"}', { status: 200 })

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  calls = []
  respond = () => new Response('{"id":"x"}', { status: 200 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    calls.push({ url: String(url), body: JSON.parse(String(init.body)), auth: (init.headers as Record<string, string>)?.Authorization })
    return respond(String(url))
  }))
  await seedFixtures()
  await (db as any).insert(users).values({ id: ERIN, email: 'erin-d@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'm-erin-d', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
})
afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await clearTables()
})

const alice = { id: F.alice }
const deliveries = async () => (db as any).select().from(notificationDeliveries) as Promise<(typeof notificationDeliveries.$inferSelect)[]>
const emails = () => calls.filter((c) => c.url.endsWith('/emails'))
const slackPosts = () => calls.filter((c) => c.url === HOOK)

async function connectBoth() {
  await saveEmailChannel(F.org, { apiKey: KEY, fromAddress: 'CodePlans <notify@example.com>', replyTo: 'eng@example.com' }, alice)
  await saveSlackChannel(F.org, { webhookUrl: HOOK, channelLabel: 'eng-updates' }, alice)
}

async function reviewForErin() {
  const spec = await createSpec({ productId: F.productShared, title: 'Token API', body: 'x', specType: 'api', area: 'api' }, F.alice)
  await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
  await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN }] }, alice)
  return spec
}

describe('rules', () => {
  it('start from the catalog defaults and let admins change them', async () => {
    const rule = await getEffectiveRules(F.org)
    expect(rule('review.requested')).toMatchObject({ enabled: true, inApp: true, email: true, slack: true, mandatory: true })
    expect(rule('comment.reply')).toMatchObject({ inApp: true, email: false, slack: false, mandatory: false })
    await setNotificationRule(F.org, 'comment.reply', { email: true }, alice)
    expect((await getEffectiveRules(F.org))('comment.reply').email).toBe(true)
    expect((await listNotificationRules(F.org)).find((r) => r.type === 'comment.reply')).toMatchObject({ customized: true })
    await resetNotificationRules(F.org, alice)
    expect((await getEffectiveRules(F.org))('comment.reply').email).toBe(false)
  })

  it('keep mandatory events on in-app and are admin-only', async () => {
    const next = await setNotificationRule(F.org, 'comment.mention', { enabled: false, inApp: false, email: false }, alice)
    expect(next).toMatchObject({ enabled: true, inApp: true, email: false })
    await expect(setNotificationRule(F.org, 'comment.reply', { email: true }, { id: F.bob })).rejects.toThrow(/owner or admin/)
    await expect(setNotificationRule(F.org, 'nope', {}, alice)).rejects.toThrow(/Unknown event/)
  })
})

describe('channels', () => {
  it('validate input and never hand back the secret', async () => {
    await expect(saveEmailChannel(F.org, { apiKey: 'sk_live', fromAddress: 'a@b.co' }, alice)).rejects.toThrow(/Resend API key/)
    await expect(saveEmailChannel(F.org, { apiKey: KEY, fromAddress: 'not an address' }, alice)).rejects.toThrow(/sender/)
    await expect(saveSlackChannel(F.org, { webhookUrl: 'https://evil.example/hook' }, alice)).rejects.toThrow(/Slack incoming webhook/)
    await expect(saveEmailChannel(F.org, { apiKey: KEY, fromAddress: 'a@b.co' }, { id: F.bob })).rejects.toThrow(/owner or admin/)
    await connectBoth()
    const view = await listChannels(F.org)
    expect(view.email).toMatchObject({ configured: true, source: 'settings', status: 'active', config: { fromAddress: 'CodePlans <notify@example.com>' } })
    expect(view.slack).toMatchObject({ configured: true, config: { channelLabel: '#eng-updates' } })
    expect(JSON.stringify(view)).not.toContain(KEY)
    expect(JSON.stringify(view)).not.toContain('secretsecret')
    const [row] = await (db as any).select().from(notificationChannels).where(eq(notificationChannels.kind, 'email_resend'))
    expect(row.secretEncrypted).not.toContain(KEY)
  })

  it('keeps the stored secret when saved blank, and falls back to RESEND_API_KEY', async () => {
    expect(await resolveChannel(F.org, 'email_resend')).toBeNull()
    vi.stubEnv('RESEND_API_KEY', 're_env_key_123456789')
    expect(await resolveChannel(F.org, 'email_resend')).toMatchObject({ id: 'env:email', secret: 're_env_key_123456789' })
    expect((await listChannels(F.org)).email).toMatchObject({ configured: true, source: 'env' })
    await connectBoth()
    await saveSlackChannel(F.org, { channelLabel: '#renamed' }, alice)
    expect(await resolveChannel(F.org, 'slack_webhook')).toMatchObject({ secret: HOOK, config: { channelLabel: '#renamed' } })
  })

  it('allows extra webhook hosts only when configured', () => {
    expect(validateWebhookUrl(HOOK)).toBeNull()
    expect(validateWebhookUrl('http://hooks.slack.com/services/x')).toMatch(/Slack/)
    expect(validateWebhookUrl('http://localhost:4010/slack')).toMatch(/Slack/)
    vi.stubEnv('NOTIFY_WEBHOOK_ALLOWED_HOSTS', 'localhost:4010, chat.internal')
    expect(validateWebhookUrl('http://localhost:4010/slack')).toBeNull()
    expect(validateWebhookUrl('https://chat.internal/hooks/abc')).toBeNull()
    expect(validateWebhookUrl('file:///etc/passwd')).not.toBeNull()
  })
})

describe('delivery', () => {
  it('emails the reviewer and posts the request to Slack', async () => {
    await connectBoth()
    await reviewForErin()
    expect((await listNotifications(ERIN)).map((n) => n.eventType)).toContain('review.requested')
    const [mail] = emails()
    expect(mail.auth).toBe(`Bearer ${KEY}`)
    expect(mail.body).toMatchObject({ from: 'CodePlans <notify@example.com>', to: ['erin-d@test.local'], reply_to: 'eng@example.com', subject: 'Alice asked you to review Token API v1 — Shared Product' })
    expect(mail.body.html).toContain('getting this as a code owner.')
    expect(slackPosts().map((p) => p.body.text.split(' — ')[0])).toEqual(['Alice drafted Token API', 'Alice requested a review of Token API v1'])
    const post = slackPosts()[1]
    expect(JSON.stringify(post.body.blocks)).toContain('Shared Product')
    const rows = await deliveries()
    expect(rows.filter((d) => d.eventType === 'review.requested').map((d) => [d.channelKind, d.status])).toEqual(expect.arrayContaining([['email_resend', 'sent'], ['slack_webhook', 'sent']]))
    expect((await listChannels(F.org)).email.lastUsedAt).toBeTruthy()
  })

  it('respects the person\'s email opt-out but keeps mandatory events in-app', async () => {
    await connectBoth()
    await setEmailPreference(ERIN, 'review.requested', false)
    expect(await getEmailPreferences(ERIN)).toEqual({ 'review.requested': false })
    await reviewForErin()
    expect(emails()).toHaveLength(0)
    expect((await listNotifications(ERIN)).map((n) => n.eventType)).toContain('review.requested')
    await setEmailPreference(ERIN, 'review.requested', true)
    expect(await getEmailPreferences(ERIN)).toEqual({})
    await setEmailPreference(ERIN, '*', false)
    await reviewForErin()
    expect(emails()).toHaveLength(0)
  })

  it('drops events an admin turned off, and agent events when agents are muted', async () => {
    await connectBoth()
    await setNotificationRule(F.org, 'work_item.created', { enabled: false }, alice)
    await createWorkItem({ productId: F.productShared, assetId: F.assetApi, type: 'bug', title: 'Leak', description: '', severity: 'high', tags: [] }, F.bob)
    expect(await listNotifications(ERIN)).toHaveLength(0)
    expect(slackPosts()).toHaveLength(0)
    await setNotificationRule(F.org, 'work_item.created', { enabled: true, includeAgents: false }, alice)
    await createWorkItem({ productId: F.productShared, assetId: F.assetApi, type: 'bug', title: 'Agent leak', description: '', severity: 'high', tags: [] }, F.bob, 'agent')
    expect(await listNotifications(ERIN)).toHaveLength(0)
    await createWorkItem({ productId: F.productShared, assetId: F.assetApi, type: 'bug', title: 'Human leak', description: '', severity: 'high', tags: [] }, F.bob)
    expect((await listNotifications(ERIN)).map((n) => n.title)).toEqual(['Bob filed Human leak'])
    expect(slackPosts().map((p) => p.body.text)).toEqual([expect.stringContaining('Bob filed Human leak')])
  })

  it('sends nothing through a paused channel', async () => {
    await connectBoth()
    await setChannelPaused(F.org, 'slack_webhook', true, alice)
    await reviewForErin()
    expect(slackPosts()).toHaveLength(0)
    expect(emails()).toHaveLength(1)
  })

  it('queues each event once per channel and target', async () => {
    await connectBoth()
    const row = { userId: ERIN, eventType: 'review.requested', productId: F.productShared, subjectType: 'spec', subjectId: 'spec-x', reason: 'reviewer', title: 'T', url: '/specs/spec-x', actorId: F.alice }
    const ctx = { eventId: 'event-1', broadcast: { eventType: 'review.requested', title: 'T', url: '/specs/spec-x' } }
    expect(await publish([row], ctx)).toEqual({ inApp: 1, queued: 2 })
    expect(await publish([row], ctx)).toEqual({ inApp: 0, queued: 0 })
    expect(await deliveries()).toHaveLength(2)
  })

  it('retries failures with backoff, gives up after the last attempt, and marks the channel', async () => {
    await connectBoth()
    await setNotificationRule(F.org, 'review.requested', { slack: false }, alice)
    respond = () => new Response('upstream down', { status: 503 })
    await reviewForErin()
    let [d] = await deliveries()
    expect(d).toMatchObject({ status: 'pending', attempts: 1, lastError: 'HTTP 503: upstream down' })
    expect(d.nextAttemptAt.getTime()).toBeGreaterThan(Date.now())
    expect((await listChannels(F.org)).email).toMatchObject({ status: 'error', lastError: 'HTTP 503: upstream down' })
    expect(await processDeliveries()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0 }) // not due yet

    for (let i = 2; i <= MAX_ATTEMPTS; i++) {
      await (db as any).update(notificationDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) })
      await processDeliveries()
    }
    ;[d] = await deliveries()
    expect(d).toMatchObject({ status: 'failed', attempts: MAX_ATTEMPTS })
  })

  it('fails at once on a permanent error and recovers the channel on the next success', async () => {
    await connectBoth()
    respond = (url) => url === HOOK ? new Response('no_service', { status: 404 }) : new Response('{}', { status: 200 })
    await reviewForErin()
    const slack = (await deliveries()).find((d) => d.channelKind === 'slack_webhook')!
    expect(slack).toMatchObject({ status: 'failed', attempts: 1, lastError: 'HTTP 404: no_service' })
    expect((await listChannels(F.org)).slack.status).toBe('error')
    respond = () => new Response('ok', { status: 200 })
    expect(await sendTestSlack(F.org, alice)).toEqual({ ok: true })
    expect((await listChannels(F.org)).slack).toMatchObject({ status: 'active', lastError: null })
  })

  it('skips queued deliveries whose channel was removed', async () => {
    await connectBoth()
    respond = () => new Response('down', { status: 503 })
    await reviewForErin()
    await removeChannel(F.org, 'email_resend', alice)
    await removeChannel(F.org, 'slack_webhook', alice)
    await (db as any).update(notificationDeliveries).set({ nextAttemptAt: new Date(Date.now() - 1000) })
    // The review email and Slack post, plus the Slack post for the new spec.
    expect(await processDeliveries()).toMatchObject({ skipped: 3 })
  })

  it('runs the periodic job: recovers stuck sends and prunes old rows', async () => {
    await connectBoth()
    respond = () => new Response('down', { status: 503 })
    await reviewForErin()
    const old = new Date(Date.now() - 20 * 60_000)
    await (db as any).update(notificationDeliveries).set({ status: 'sending', nextAttemptAt: old })
    respond = () => new Response('{}', { status: 200 })
    expect(await runNotificationJobs()).toMatchObject({ sent: 3 })
    await runNotificationJobs(new Date(Date.now() + 91 * 86_400_000))
    expect(await deliveries()).toHaveLength(0)
  })
})

describe('integration errors', () => {
  it('tell workspace admins, in-app and by email', async () => {
    await connectBoth()
    const [conn] = await (db as any).insert(integrations).values({ organizationId: F.org, provider: 'github', name: 'GitHub issues' }).returning()
    await notifyIntegrationError(conn, 'Bad credentials')
    expect((await listNotifications(F.alice)).map((n) => [n.eventType, n.title, n.summary])).toEqual([['integration.error', 'GitHub issues failed to sync', 'Bad credentials']])
    expect(await listNotifications(F.bob)).toHaveLength(0)
    expect(emails().map((e) => e.body.to)).toEqual([['alice@test.local']])
    expect(slackPosts()).toHaveLength(0) // Slack is off by default for this event
  })
})

describe('test sends', () => {
  it('report the provider\'s answer to the admin', async () => {
    expect(await sendTestEmail(F.org, alice)).toEqual({ ok: false, error: expect.stringMatching(/Resend API key/) })
    await connectBoth()
    expect(await sendTestEmail(F.org, alice)).toEqual({ ok: true, to: 'alice@test.local' })
    respond = () => new Response('{"message":"The example.com domain is not verified"}', { status: 403 })
    expect(await sendTestEmail(F.org, alice)).toEqual({ ok: false, error: expect.stringContaining('not verified') })
    await expect(sendTestSlack(F.org, { id: F.bob })).rejects.toThrow(/owner or admin/)
  })
})

describe('templates', () => {
  it('escape content and explain why the person was told', () => {
    const mail = renderEmail({ eventType: 'comment.mention', title: 'Bob mentioned you on <Plan>', summary: '<script>x</script>', url: '/plans/1', reason: 'mentioned', productName: 'Web' })
    expect(mail.html).not.toContain('<script>')
    expect(mail.html).toContain('&lt;Plan&gt;')
    expect(mail.html).toContain('You were mentioned.')
    expect(mail.text).toContain('http://localhost:3000/plans/1')
    expect(renderEmail({ eventType: 'spec.revised', title: 't', url: '/x', reason: 'architect:api' }).text).toContain("You're getting this as an architect · api.")
    const slack = renderSlack({ eventType: 'spec.created', title: 'A <b> & c', url: '/specs/1', byAgent: true })
    expect(JSON.stringify(slack.blocks)).toContain('A &lt;b&gt; &amp; c')
    expect(JSON.stringify(slack.blocks)).toContain('by an AI agent')
  })
})

describe('cron endpoint', () => {
  it('needs CRON_SECRET and the matching bearer token', async () => {
    const req = (auth?: string) => new Request('http://localhost/api/cron/notifications', { headers: auth ? { authorization: auth } : {} })
    expect((await cronGET(req())).status).toBe(503)
    vi.stubEnv('CRON_SECRET', 'cron-secret-value')
    expect((await cronGET(req('Bearer wrong'))).status).toBe(401)
    const ok = await cronGET(req('Bearer cron-secret-value'))
    expect(ok.status).toBe(200)
    expect(await ok.json()).toEqual({ sent: 0, retrying: 0, failed: 0, skipped: 0 })
  })
})
