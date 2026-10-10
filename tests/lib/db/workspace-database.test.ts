import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { runMigrations, clearTables } from '@/tests/helpers/db'
import { db, ReadOnlyDatabaseError } from '@/lib/db/index'
import { users, organizations, organizationMembers } from '@/lib/db/schema.sqlite'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'
import { enterpriseHost } from '@/lib/ee/host'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = db as any
const dir = mkdtempSync(join(tmpdir(), 'codeplans-ws-'))
const otherUrl = `file:${join(dir, 'other.db')}`

const insertUser = (email: string) => d.insert(users).values({ id: crypto.randomUUID(), email, name: email })
const emails = async () => ((await d.select({ email: users.email }).from(users)) as { email: string }[]).map((u) => u.email)

beforeAll(async () => {
  await runMigrations()
  registerEnterpriseHooks({ workspaceDatabase: () => ({ url: otherUrl }) })
  await enterpriseHost.migrateDatabase()
  resetEnterpriseHooks()
})

afterEach(async () => {
  resetEnterpriseHooks()
  await clearTables()
})

afterAll(() => rmSync(dir, { recursive: true, force: true }))

describe('db without an enterprise module', () => {
  it('reads and writes DATABASE_URL', async () => {
    await insertUser('community@example.com')
    expect(await emails()).toEqual(['community@example.com'])
  })

  it('counts joined workspace members, not pending invites, through the host API', async () => {
    expect(await enterpriseHost.countMembers()).toBe(0)
    const [joined, invited] = [crypto.randomUUID(), crypto.randomUUID()]
    await d.insert(users).values([{ id: joined, email: 'j@example.com', name: 'J' }, { id: invited, email: 'i@example.com', name: 'I' }])
    const [org] = await d.insert(organizations).values({ name: 'W', slug: 'w', ownerId: joined }).returning()
    await d.insert(organizationMembers).values([
      { organizationId: org.id, userId: joined, role: 'owner', joinedAt: new Date() },
      { organizationId: org.id, userId: invited, role: 'editor', joinedAt: null },
    ])
    expect(await enterpriseHost.countMembers()).toBe(1)
  })
})

describe('db with a workspaceDatabase hook', () => {
  it('sends queries to the database the hook names', async () => {
    registerEnterpriseHooks({ workspaceDatabase: () => ({ url: otherUrl }) })
    await insertUser('tenant@example.com')
    expect(await emails()).toEqual(['tenant@example.com'])

    resetEnterpriseHooks()
    expect(await emails()).toEqual([])

    registerEnterpriseHooks({ workspaceDatabase: () => ({ url: otherUrl }) })
    await d.delete(users)
  })

  it('rejects writes with the given reason when the workspace is read-only, but still reads', async () => {
    registerEnterpriseHooks({ workspaceDatabase: () => ({ url: otherUrl, readOnly: 'Subscription inactive' }) })
    expect(() => insertUser('x@example.com')).toThrow(ReadOnlyDatabaseError)
    expect(() => d.transaction(async () => {})).toThrow('Subscription inactive')
    expect(await emails()).toEqual([])
  })
})
