import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getAssetInventory } from '@/lib/db/queries'
import { createRelease, updateRelease, setReleaseAsset, graduateWorkItem } from '@/lib/db/mutations'
import { db } from '@/lib/db/index'
import { workItems, assetDependencies } from '@/lib/db/schema.sqlite'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('getAssetInventory', () => {
  it('returns per-asset stats: debt, open items, active plans, version, capabilities', async () => {
    await (db as any).insert(workItems).values([
      {
        id: 'wi-debt', productId: F.productShared, assetId: F.assetApi,
        type: 'tech_debt', title: 'Retry logic', status: 'open', severity: 'high', tags: [],
      },
      {
        id: 'wi-bug', productId: F.productShared, assetId: F.assetApi,
        type: 'bug', title: 'Crash', status: 'in_progress', severity: 'medium', tags: [],
      },
      {
        id: 'wi-done', productId: F.productShared, assetId: F.assetApi,
        type: 'feature', title: 'Bulk export', status: 'resolved', severity: 'medium', tags: [],
      },
    ])
    await graduateWorkItem('wi-done')

    const release = await createRelease({ productId: F.productShared, name: 'API v2' }, F.alice)
    await setReleaseAsset(release.id, F.assetApi, { version: 'v2.0.0' })
    await updateRelease(release.id, { status: 'shipped' })

    const inv = await getAssetInventory(F.alice)
    expect(inv.assets.map((a) => a.name).sort()).toEqual(['API Service', 'Database'])

    const api = inv.assets.find((a) => a.id === F.assetApi)!
    expect(api.openItemCount).toBe(2)
    expect(api.openDebtCount).toBe(1)
    expect(api.effectiveDebtScore).toBe(15) // one open high-severity item
    expect(api.debtIsManual).toBe(false)
    expect(api.activePlanCount).toBe(1) // planActive targets assetApi in fixtures
    expect(api.capabilityCount).toBe(1)
    expect(api.currentVersion).toBe('v2.0.0')
    expect(api.lastShippedAt).toBeTruthy()

    const dbAsset = inv.assets.find((a) => a.id === F.assetDb)!
    expect(dbAsset.activePlanCount).toBe(0)
    expect(dbAsset.currentVersion).toBeUndefined()
  })

  it('returns dependency edges between visible assets', async () => {
    await (db as any).insert(assetDependencies).values({
      id: 'edge-1',
      sourceAssetId: F.assetApi,
      targetAssetId: F.assetDb,
      dependencyType: 'depends_on',
      description: 'User store',
    })
    const inv = await getAssetInventory(F.alice)
    expect(inv.edges).toHaveLength(1)
    expect(inv.edges[0].sourceAssetName).toBe('API Service')
    expect(inv.edges[0].targetAssetName).toBe('Database')
  })

  it('scopes by product and enforces org access', async () => {
    const scoped = await getAssetInventory(F.alice, { productId: F.productCarol })
    expect(scoped.assets).toHaveLength(0)

    const carol = await getAssetInventory(F.carol)
    expect(carol.assets).toHaveLength(0)
  })
})
