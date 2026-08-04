import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getAssetHistory } from '@/lib/db/queries'
import { db } from '@/lib/db/index'
import { codePlanAssets, syncLog, workItems } from '@/lib/db/schema.sqlite'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

const DAY = 24 * 60 * 60 * 1000

/** Extra rows on top of the shared fixtures: history for assetApi. */
async function seedHistory() {
  const d = db as any
  // The completed plan delivered a change to assetApi with a merged PR.
  await d.insert(codePlanAssets).values({
    codePlanId: F.planCompleted,
    assetId: F.assetApi,
    branch: 'fix/api-timeouts',
    prUrl: 'https://github.com/acme/api/pull/7',
    prStatus: 'merged',
  })
  await d.insert(workItems).values([
    {
      id: 'wi-bug-resolved',
      productId: F.productShared,
      assetId: F.assetApi,
      type: 'bug',
      title: 'Timeouts on bulk export',
      status: 'resolved',
      severity: 'high',
      tags: [],
      createdAt: new Date(Date.now() - 10 * DAY),
      updatedAt: new Date(Date.now() - 2 * DAY),
    },
    {
      id: 'wi-debt-open',
      productId: F.productShared,
      assetId: F.assetApi,
      type: 'tech_debt',
      title: 'Legacy retry logic',
      status: 'open',
      severity: 'medium',
      tags: [],
      area: 'lib/retry',
      createdAt: new Date(Date.now() - 5 * DAY),
      updatedAt: new Date(Date.now() - 5 * DAY),
    },
    {
      id: 'wi-debt-resolved',
      productId: F.productShared,
      assetId: F.assetApi,
      type: 'tech_debt',
      title: 'Unpinned client deps',
      status: 'resolved',
      severity: 'low',
      tags: [],
      createdAt: new Date(Date.now() - 20 * DAY),
      updatedAt: new Date(Date.now() - 1 * DAY),
    },
    {
      // Different asset — must not appear in assetApi history.
      id: 'wi-other-asset',
      productId: F.productShared,
      assetId: F.assetDb,
      type: 'bug',
      title: 'Slow migrations',
      status: 'resolved',
      severity: 'medium',
      tags: [],
    },
  ])
}

describe('getAssetHistory', () => {
  it('composes plan deliveries, resolved items, and debt movement for the asset only', async () => {
    await seedHistory()
    const entries = await getAssetHistory(F.assetApi, F.alice)
    expect(entries).not.toBeNull()
    const kinds = entries!.map((e) => e.kind).sort()
    expect(kinds).toEqual(['debt_opened', 'debt_opened', 'debt_resolved', 'plan_completed', 'work_item_resolved'])
    expect(entries!.some((e) => e.workItemId === 'wi-other-asset')).toBe(false)
  })

  it('carries per-asset PR context on plan entries', async () => {
    await seedHistory()
    const entries = await getAssetHistory(F.assetApi, F.alice)
    const plan = entries!.find((e) => e.kind === 'plan_completed')!
    expect(plan.planId).toBe(F.planCompleted)
    expect(plan.branch).toBe('fix/api-timeouts')
    expect(plan.prStatus).toBe('merged')
    expect(plan.prUrl).toContain('/pull/7')
  })

  it('emits both an opened and a resolved entry for resolved debt', async () => {
    await seedHistory()
    const entries = await getAssetHistory(F.assetApi, F.alice)
    const debtEntries = entries!.filter((e) => e.workItemId === 'wi-debt-resolved')
    expect(debtEntries.map((e) => e.kind).sort()).toEqual(['debt_opened', 'debt_resolved'])
    const opened = debtEntries.find((e) => e.kind === 'debt_opened')!
    const resolved = debtEntries.find((e) => e.kind === 'debt_resolved')!
    expect(opened.timestamp < resolved.timestamp).toBe(true)
  })

  it('excludes active and draft plans', async () => {
    // planActive targets assetApi in the shared fixtures.
    const entries = await getAssetHistory(F.assetApi, F.alice)
    expect(entries!.some((e) => e.planId === F.planActive)).toBe(false)
  })

  it('prefers the sync_log completion event for plan timestamps', async () => {
    await seedHistory()
    const completedAt = new Date(Date.now() - 3 * DAY)
    await (db as any).insert(syncLog).values({
      organizationId: F.org,
      entityType: 'code_plan',
      entityId: F.planCompleted,
      event: 'completed',
      actorId: F.alice,
      payload: {},
      createdAt: completedAt,
    })
    const entries = await getAssetHistory(F.assetApi, F.alice)
    const plan = entries!.find((e) => e.kind === 'plan_completed')!
    expect(new Date(plan.timestamp).getTime()).toBe(Math.floor(completedAt.getTime() / 1000) * 1000)
  })

  it('sorts entries newest first', async () => {
    await seedHistory()
    const entries = await getAssetHistory(F.assetApi, F.alice)
    const timestamps = entries!.map((e) => e.timestamp)
    expect([...timestamps].sort().reverse()).toEqual(timestamps)
  })

  it('returns null for users without access to the product', async () => {
    await seedHistory()
    expect(await getAssetHistory(F.assetApi, F.carol)).toBeNull()
  })

  it('returns null for an unknown asset', async () => {
    expect(await getAssetHistory('no-such-asset', F.alice)).toBeNull()
  })
})
