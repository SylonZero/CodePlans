import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { eq, isNull } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { ensureTeamWorkspace, joinTeamWorkspace } from '@/lib/db/bootstrap'
import { db } from '@/lib/db/index'
import {
  users,
  organizations,
  organizationMembers,
  products,
} from '@/lib/db/schema.sqlite'

const d = db as any

beforeAll(async () => {
  await runMigrations()
})

afterEach(async () => {
  await clearTables()
})

describe('ensureTeamWorkspace', () => {
  it('returns null when no users exist', async () => {
    const orgId = await ensureTeamWorkspace()
    expect(orgId).toBeNull()
    const orgs = await d.select().from(organizations)
    expect(orgs).toHaveLength(0)
  })

  it('creates the workspace from the first user and makes them owner', async () => {
    await d.insert(users).values({
      id: 'first-user',
      email: 'first@test.local',
      name: 'First',
      billingTier: 'free',
      role: 'viewer',
      featureFlags: {},
    })

    const orgId = await ensureTeamWorkspace()
    expect(orgId).not.toBeNull()

    const membership = await d
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, 'first-user'))
    expect(membership).toHaveLength(1)
    expect(membership[0].role).toBe('owner')
    expect(membership[0].joinedAt).not.toBeNull()
  })

  it('reuses the existing org and assigns org-less products to it', async () => {
    await seedFixtures()
    const orgId = await ensureTeamWorkspace()
    expect(orgId).toBe(F.org)

    const orphans = await d.select().from(products).where(isNull(products.organizationId))
    expect(orphans).toHaveLength(0) // carol's solo product was adopted
  })

  it('is idempotent', async () => {
    await seedFixtures()
    const first = await ensureTeamWorkspace()
    const second = await ensureTeamWorkspace()
    expect(second).toBe(first)
    const orgs = await d.select().from(organizations)
    expect(orgs).toHaveLength(1)
  })
})

describe('joinTeamWorkspace', () => {
  beforeEach(async () => {
    await seedFixtures()
  })

  it('adds a membership row and sets the current-org pointer', async () => {
    // carol has no membership in fixtures
    await joinTeamWorkspace(F.carol)

    const membership = await d
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, F.carol))
    expect(membership).toHaveLength(1)
    expect(membership[0].organizationId).toBe(F.org)
    expect(membership[0].role).toBe('editor')

    const [carol] = await d.select().from(users).where(eq(users.id, F.carol))
    expect(carol.organizationId).toBe(F.org)
  })

  it('does not duplicate an existing membership', async () => {
    await joinTeamWorkspace(F.bob)
    const membership = await d
      .select()
      .from(organizationMembers)
      .where(eq(organizationMembers.userId, F.bob))
    expect(membership).toHaveLength(1)
  })
})
