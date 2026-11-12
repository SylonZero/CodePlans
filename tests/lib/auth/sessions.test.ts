import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { emailVerificationTokens, endedSessions, passwordResetTokens, users } from '@/lib/db/schema'
import { sessionUserId, bumpSessionVersion, endSession } from '@/lib/auth/session-version'
import { findInvite } from '@/lib/auth/invites'
import { requestPasswordReset, resetPassword, resetPasswordResetThrottle } from '@/lib/auth/password-reset'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = db as any
const version = async (id: string) => (await d.query.users.findFirst({ where: eq(users.id, id) })).sessionVersion as number

beforeAll(async () => { await runMigrations() })
beforeEach(async () => { await seedFixtures() })
afterEach(async () => {
  resetEnterpriseHooks()
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  await d.delete(passwordResetTokens)
  await d.delete(endedSessions)
  await d.delete(emailVerificationTokens)
  await clearTables()
})

describe('sessions', () => {
  it('accept tokens at the current version, including ones issued before versions existed', async () => {
    expect(await sessionUserId({ id: F.alice, sv: 0 })).toBe(F.alice)
    expect(await sessionUserId({ id: F.alice })).toBe(F.alice)
    expect(await sessionUserId({})).toBeNull()
  })

  it('end when the password changes, everywhere at once', async () => {
    await bumpSessionVersion(F.alice)
    expect(await version(F.alice)).toBe(1)
    expect(await sessionUserId({ id: F.alice, sv: 0 })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 1 })).toBe(F.alice)
    expect(await sessionUserId({ id: F.bob, sv: 0 })).toBe(F.bob)
  })

  it('end when the account is deleted, or outside the scope they were issued in', async () => {
    expect(await sessionUserId({ id: 'gone', sv: 0 })).toBeNull()
    registerEnterpriseHooks({ sessionScope: () => 'workspace-a' })
    expect(await sessionUserId({ id: F.alice, sv: 0, scope: 'workspace-b' })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 0, scope: 'workspace-a' })).toBe(F.alice)
  })

  it('end on sign-out for that session only, copies of its token included', async () => {
    const exp = Math.floor(Date.now() / 1000) + 3600
    await endSession({ id: F.alice, sv: 0, sid: 'laptop', exp })
    expect(await sessionUserId({ id: F.alice, sv: 0, sid: 'laptop', exp })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 0, sid: 'phone', exp })).toBe(F.alice)
    expect(await version(F.alice)).toBe(0)
    // Signing out twice (two tabs) is fine.
    await endSession({ id: F.alice, sv: 0, sid: 'laptop', exp })
  })

  it('end everywhere on sign-out of a token issued before sessions had ids', async () => {
    await endSession({ id: F.alice, sv: 0 })
    expect(await sessionUserId({ id: F.alice, sv: 0 })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 0, sid: 'phone' })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 1, sid: 'new' })).toBe(F.alice)
  })

  it('forget signed-out sessions once they would have expired', async () => {
    const past = Math.floor(Date.now() / 1000) - 60
    await endSession({ id: F.alice, sv: 0, sid: 'old', exp: past })
    await endSession({ id: F.bob, sv: 0, sid: 'recent', exp: past + 7200 })
    expect((await d.select().from(endedSessions)).map((r: { id: string }) => r.id)).toEqual(['recent'])
  })

  it('end when a reset link sets a new password', async () => {
    vi.stubEnv('RESEND_API_KEY', '')
    vi.spyOn(console, 'log').mockImplementation(() => {})
    resetPasswordResetThrottle()
    await d.update(users).set({ passwordHash: await bcrypt.hash('old-password', 4) }).where(eq(users.id, F.alice))
    await requestPasswordReset('alice@test.local')
    const link = String(vi.mocked(console.log).mock.calls.flat().join(' ')).match(/token=([0-9a-f]{64})/)![1]
    await resetPassword(link, 'new-password-1')
    expect(await sessionUserId({ id: F.alice, sv: 0 })).toBeNull()
    expect(await sessionUserId({ id: F.alice, sv: 1 })).toBe(F.alice)
  })
})

describe('invite links', () => {
  const later = new Date(Date.now() + 3600_000)

  it('are found by token; email-change links never count as invites', async () => {
    await d.insert(emailVerificationTokens).values([
      { userId: F.bob, newEmail: 'bob@test.local', purpose: 'invite', token: 'invite-token', expiresAt: later },
      { userId: F.alice, newEmail: 'alice@new.example', purpose: 'email_change', token: 'change-token', expiresAt: later },
    ])
    expect(await findInvite('invite-token')).toMatchObject({ userId: F.bob })
    expect(await findInvite('change-token')).toBeNull()
    expect(await findInvite('')).toBeNull()
  })

  it('expire', async () => {
    await d.insert(emailVerificationTokens).values({ userId: F.bob, newEmail: 'bob@test.local', purpose: 'invite', token: 'invite-token', expiresAt: later })
    expect(await findInvite('invite-token', new Date(later.getTime() + 1000))).toBeNull()
  })

  it('default to email-change links when no purpose is given', async () => {
    await d.insert(emailVerificationTokens).values({ userId: F.alice, newEmail: 'alice@new.example', token: 'legacy', expiresAt: later })
    expect(await findInvite('legacy')).toBeNull()
  })
})
