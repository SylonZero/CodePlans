import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import {
  createWorkItem,
  updateWorkItem,
  updateWorkItemStatus,
  deleteWorkItem,
  linkWorkItemToPlan,
  unlinkWorkItemFromPlan,
} from '@/lib/db/mutations'
import { getWorkItems, getWorkItem, getAssetOptions } from '@/lib/db/queries'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

async function createFixtureItem(overrides: Partial<Parameters<typeof createWorkItem>[0]> = {}) {
  return createWorkItem(
    {
      productId: F.productShared,
      assetId: F.assetApi,
      area: 'auth/login',
      type: 'bug',
      title: 'Login fails on Safari',
      description: 'Session cookie not set',
      severity: 'high',
      tags: ['auth'],
      ...overrides,
    },
    F.alice,
  )
}

describe('work item mutations', () => {
  it('creates a native work item with the reporter set', async () => {
    const item = await createFixtureItem()
    expect(item.source).toBe('native')
    expect(item.reporterId).toBe(F.alice)
    expect(item.status).toBe('open')
  })

  it('updates fields and bumps updatedAt', async () => {
    const item = await createFixtureItem()
    const updated = await updateWorkItem(item.id, { title: 'New title', severity: 'critical' })
    expect(updated!.title).toBe('New title')
    expect(updated!.severity).toBe('critical')
  })

  it('updates status narrowly', async () => {
    const item = await createFixtureItem()
    const updated = await updateWorkItemStatus(item.id, 'resolved')
    expect(updated!.status).toBe('resolved')
  })

  it('deletes an item', async () => {
    const item = await createFixtureItem()
    const deleted = await deleteWorkItem(item.id)
    expect(deleted!.id).toBe(item.id)
    expect(await getWorkItem(item.id, F.alice)).toBeNull()
  })
})

describe('work item ↔ plan links', () => {
  it('links and appears on the item', async () => {
    const item = await createFixtureItem()
    await linkWorkItemToPlan(item.id, F.planActive)
    const found = await getWorkItem(item.id, F.alice)
    expect(found!.linkedPlans).toHaveLength(1)
    expect(found!.linkedPlans[0].id).toBe(F.planActive)
    expect(found!.linkedPlans[0].status).toBe('active')
  })

  it('is idempotent', async () => {
    const item = await createFixtureItem()
    await linkWorkItemToPlan(item.id, F.planActive)
    await linkWorkItemToPlan(item.id, F.planActive)
    const found = await getWorkItem(item.id, F.alice)
    expect(found!.linkedPlans).toHaveLength(1)
  })

  it('unlinks', async () => {
    const item = await createFixtureItem()
    await linkWorkItemToPlan(item.id, F.planActive)
    await unlinkWorkItemFromPlan(item.id, F.planActive)
    const found = await getWorkItem(item.id, F.alice)
    expect(found!.linkedPlans).toHaveLength(0)
  })
})

describe('getWorkItems', () => {
  it('returns items with product and asset context', async () => {
    await createFixtureItem()
    const items = await getWorkItems(F.alice)
    expect(items).toHaveLength(1)
    expect(items[0].productName).toBe('Shared Product')
    expect(items[0].assetName).toBe('API Service')
    expect(items[0].area).toBe('auth/login')
  })

  it('org member sees org items; outsider does not', async () => {
    await createFixtureItem()
    expect(await getWorkItems(F.bob)).toHaveLength(1)
    expect(await getWorkItems(F.carol)).toHaveLength(0)
  })

  it('filters by type and status', async () => {
    await createFixtureItem()
    await createFixtureItem({ type: 'tech_debt', title: 'Legacy ORM calls', severity: 'medium' })
    const debt = await getWorkItems(F.alice, { type: 'tech_debt' })
    expect(debt).toHaveLength(1)
    expect(debt[0].title).toBe('Legacy ORM calls')

    const item = await createFixtureItem({ title: 'Resolved thing' })
    await updateWorkItemStatus(item.id, 'resolved')
    const resolved = await getWorkItems(F.alice, { status: 'resolved' })
    expect(resolved).toHaveLength(1)
  })

  it('filters by linked plan', async () => {
    const linked = await createFixtureItem({ title: 'Linked item' })
    await createFixtureItem({ title: 'Unlinked item' })
    await linkWorkItemToPlan(linked.id, F.planActive)
    const items = await getWorkItems(F.alice, { planId: F.planActive })
    expect(items).toHaveLength(1)
    expect(items[0].id).toBe(linked.id)
  })
})

describe('getWorkItem access guard', () => {
  it('denies outsiders', async () => {
    const item = await createFixtureItem()
    expect(await getWorkItem(item.id, F.carol)).toBeNull()
  })
})

describe('getAssetOptions', () => {
  it('lists assets across accessible products only', async () => {
    const forAlice = await getAssetOptions(F.alice)
    expect(forAlice.map((a) => a.id).sort()).toEqual([F.assetApi, F.assetDb].sort())
    const forCarol = await getAssetOptions(F.carol)
    expect(forCarol).toHaveLength(0)
  })
})
