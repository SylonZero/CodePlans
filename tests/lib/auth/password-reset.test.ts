import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { createHash } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { passwordResetTokens, users } from '@/lib/db/schema'
import { requestPasswordReset, findResetLink, resetPassword, resetPasswordResetThrottle, RESET_LINK_TTL_MS } from '@/lib/auth/password-reset'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = db as any
type Sent = { from: string; to: string[]; subject: string; html: string; text: string }
let sent: Sent[] = []

const tokens = () => d.select().from(passwordResetTokens) as Promise<(typeof passwordResetTokens.$inferSelect)[]>
const linkIn = (mail: Sent) => mail.text.match(/https?:\/\/\S+\/reset-password\?token=([0-9a-f]+)/)!
const passwordOf = async (id: string) => (await d.query.users.findFirst({ where: eq(users.id, id) })).passwordHash as string

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  sent = []
  vi.stubEnv('RESEND_API_KEY', 're_test_1234567890')
  vi.stubEnv('RESEND_FROM_EMAIL', 'CodePlans <notifications@example.com>')
  vi.stubEnv('AUTH_URL', 'https://plans.example.com')
  vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
    sent.push(JSON.parse(String(init.body)))
    return new Response('{"id":"x"}', { status: 200 })
  }))
  resetPasswordResetThrottle()
  await seedFixtures()
  await d.update(users).set({ passwordHash: await bcrypt.hash('old-password', 4) }).where(eq(users.id, F.alice))
})
afterEach(async () => {
  resetEnterpriseHooks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await d.delete(passwordResetTokens)
  await clearTables()
})

describe('requesting a reset link', () => {
  it('emails a one-hour link, storing only a hash of its token', async () => {
    await requestPasswordReset('  Alice@Test.Local ')
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ from: 'CodePlans <notifications@example.com>', to: ['alice@test.local'], subject: 'Reset your CodePlans password' })
    const [url, token] = linkIn(sent[0])
    expect(url.startsWith('https://plans.example.com/reset-password?token=')).toBe(true)
    expect(sent[0].html).toContain(url)

    const [row] = await tokens()
    expect(row.tokenHash).toBe(createHash('sha256').update(token).digest('hex'))
    expect(JSON.stringify(row)).not.toContain(token)
    expect(row.expiresAt.getTime() - Date.now()).toBeGreaterThan(RESET_LINK_TTL_MS - 60_000)
  })

  it('does nothing for an unknown address or an account without a password', async () => {
    await requestPasswordReset('nobody@test.local')
    await d.update(users).set({ passwordHash: null }).where(eq(users.id, F.bob))
    await requestPasswordReset('bob@test.local')
    expect(sent).toEqual([])
    expect(await tokens()).toEqual([])
  })

  it('replaces an earlier link when asked again', async () => {
    await requestPasswordReset('alice@test.local')
    await requestPasswordReset('alice@test.local')
    const [first, second] = sent.map((m) => linkIn(m)[1])
    expect(await findResetLink(first)).toBeNull()
    expect(await findResetLink(second)).toMatchObject({ userId: F.alice })
    expect(await tokens()).toHaveLength(1)
  })

  it('sends at most three links an hour to one address', async () => {
    for (let i = 0; i < 5; i++) await requestPasswordReset('alice@test.local')
    expect(sent).toHaveLength(3)
    await requestPasswordReset('alice@test.local', new Date(Date.now() + 61 * 60_000))
    expect(sent).toHaveLength(4)
  })

  it('logs the link for the operator when email is not configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    const log = vi.spyOn(console, 'log').mockImplementation(() => {})
    await requestPasswordReset('alice@test.local')
    expect(sent).toEqual([])
    expect(log.mock.calls.flat().join(' ')).toMatch(/reset link for alice@test.local .*\/reset-password\?token=[0-9a-f]{64}/)
    log.mockRestore()
  })

  it("links to the workspace's own address in a hosted service", async () => {
    registerEnterpriseHooks({ publicUrl: () => 'https://acme.codeplans.app' })
    await requestPasswordReset('alice@test.local')
    expect(linkIn(sent[0])[0].startsWith('https://acme.codeplans.app/reset-password?token=')).toBe(true)
    expect(sent[0].text).toContain('your CodePlans account at acme.codeplans.app')
  })
})

describe('using a reset link', () => {
  async function link() {
    await requestPasswordReset('alice@test.local')
    return linkIn(sent.at(-1)!)[1]
  }

  it('sets the new password once', async () => {
    const token = await link()
    expect(await resetPassword(token, 'new-password-1')).toEqual({ email: 'alice@test.local' })
    expect(await bcrypt.compare('new-password-1', await passwordOf(F.alice))).toBe(true)
    expect(await bcrypt.compare('old-password', await passwordOf(F.alice))).toBe(false)
    expect(await resetPassword(token, 'another-password')).toEqual({ error: expect.stringMatching(/invalid or has expired/) })
    expect(await tokens()).toEqual([])
  })

  it('refuses expired, unknown and malformed links, and short passwords', async () => {
    const token = await link()
    expect(await resetPassword(token, 'short')).toEqual({ error: expect.stringMatching(/at least 8/) })
    const later = new Date(Date.now() + RESET_LINK_TTL_MS + 1000)
    expect(await findResetLink(token, later)).toBeNull()
    expect(await resetPassword(token, 'new-password-1', later)).toEqual({ error: expect.stringMatching(/expired/) })
    expect(await findResetLink('f'.repeat(64))).toBeNull()
    expect(await findResetLink("x' or 1=1 --")).toBeNull()
    expect(await bcrypt.compare('old-password', await passwordOf(F.alice))).toBe(true)
  })
})
