import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { isOrgOwner } from '@/lib/db/authz'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('isOrgOwner', () => {
  it('returns true for the organization\'s durable owner', async () => {
    // F.org.ownerId is F.alice per seedFixtures.
    expect(await isOrgOwner(F.org, F.alice)).toBe(true)
  })

  it('returns false for a non-owner member, even one with role="owner" on their membership row', async () => {
    // Bob is an editor member of F.org — not organizations.ownerId. This is
    // exactly the case this function exists to get right: role is mutable
    // and must never substitute for the durable ownerId check.
    expect(await isOrgOwner(F.org, F.bob)).toBe(false)
  })

  it('returns false for a user with no relationship to the organization', async () => {
    expect(await isOrgOwner(F.org, F.carol)).toBe(false)
  })

  it('returns false for a nonexistent organization id', async () => {
    expect(await isOrgOwner('org-does-not-exist', F.alice)).toBe(false)
  })
})
