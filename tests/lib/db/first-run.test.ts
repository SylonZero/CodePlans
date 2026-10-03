import { describe, it, expect, beforeAll, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { runMigrations, clearTables } from '@/tests/helpers/db'
import { db } from '@/lib/db/index'
import { users, organizationMembers, organizations } from '@/lib/db/schema.sqlite'
import { checkSetupCode, createOwnerAccount, ensureOwnerFromEnv, needsSetup, setupCode } from '@/lib/db/first-run'
import { migrateDatabase } from '@/lib/db/migrate'

const d = db as any

beforeAll(async () => {
  await runMigrations()
})

afterEach(async () => {
  await clearTables()
})

describe('setup code', () => {
  it('is stable for a secret and differs between secrets', () => {
    const code = setupCode('secret-one-xxxxxxxxxxxxxxxxxxxxxxxxx')
    expect(code).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/)
    expect(setupCode('secret-one-xxxxxxxxxxxxxxxxxxxxxxxxx')).toBe(code)
    expect(setupCode('secret-two-xxxxxxxxxxxxxxxxxxxxxxxxx')).not.toBe(code)
  })

  it('accepts the code regardless of case and dashes, and rejects others', () => {
    const code = setupCode()
    expect(checkSetupCode(code)).toBe(true)
    expect(checkSetupCode(code.toLowerCase().replace(/-/g, ' '))).toBe(true)
    expect(checkSetupCode('AAAA-AAAA-AAAA')).toBe(false)
    expect(checkSetupCode('')).toBe(false)
    expect(checkSetupCode(code, '')).toBe(false)
  })
})

describe('first-run owner', () => {
  it('needs setup only while there are no users', async () => {
    expect(await needsSetup()).toBe(true)
    await createOwnerAccount({ email: 'owner@test.local', password: 'long-enough', name: 'Owner', orgName: 'Acme Eng' })
    expect(await needsSetup()).toBe(false)
  })

  it('creates the owner with a workspace they own', async () => {
    const id = await createOwnerAccount({ email: 'owner@test.local', password: 'long-enough', name: 'Owner', orgName: 'Acme Eng' })
    const user = await d.query.users.findFirst({ where: eq(users.id, id) })
    expect(user.role).toBe('owner')
    expect(user.passwordHash).toBeTruthy()
    const org = await d.query.organizations.findFirst({ where: eq(organizations.id, user.organizationId) })
    expect(org).toMatchObject({ name: 'Acme Eng', slug: 'acme-eng', ownerId: id })
    const member = await d.query.organizationMembers.findFirst({ where: eq(organizationMembers.userId, id) })
    expect(member.role).toBe('owner')
  })

  it('creates the owner from ADMIN_EMAIL / ADMIN_PASSWORD once', async () => {
    const env = { ADMIN_EMAIL: 'boot@test.local', ADMIN_PASSWORD: 'long-enough', ADMIN_NAME: 'Boot' }
    expect(await ensureOwnerFromEnv(env)).toBe('created')
    expect(await ensureOwnerFromEnv(env)).toBe('skipped')
    expect(await ensureOwnerFromEnv({ ...env, ADMIN_EMAIL: 'other@test.local' })).toBe('skipped')
    const all = await d.select().from(users)
    expect(all.map((u: { email: string }) => u.email)).toEqual(['boot@test.local'])
  })

  it('skips without credentials or with a short password', async () => {
    expect(await ensureOwnerFromEnv({})).toBe('skipped')
    expect(await ensureOwnerFromEnv({ ADMIN_EMAIL: 'a@test.local', ADMIN_PASSWORD: 'short' })).toBe('skipped')
    expect(await needsSetup()).toBe(true)
  })
})

describe('migrateDatabase (sqlite)', () => {
  it('is a no-op on an up-to-date database', async () => {
    const r = await migrateDatabase()
    expect(r.provider).toBe('sqlite')
    expect(r.applied).toBe(0)
    expect(r.total).toBeGreaterThan(30)
  })
})
