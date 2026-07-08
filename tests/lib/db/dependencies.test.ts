import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createAssetDependency, deleteAssetDependency, addPlanAsset } from '@/lib/db/mutations'
import {
  getProductDependencyEdges,
  getImpactedAssets,
  getAnalytics,
} from '@/lib/db/queries'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('asset dependencies', () => {
  it('creates an edge and lists it on the product', async () => {
    const edge = await createAssetDependency({
      sourceAssetId: F.assetApi,
      targetAssetId: F.assetDb,
      dependencyType: 'depends_on',
      description: 'reads/writes primary data',
    })
    expect(edge).not.toBeNull()

    const edges = await getProductDependencyEdges(F.productShared)
    expect(edges).toHaveLength(1)
    expect(edges[0].sourceAssetName).toBe('API Service')
    expect(edges[0].targetAssetName).toBe('Database')
  })

  it('rejects self-dependencies and duplicates', async () => {
    expect(
      await createAssetDependency({
        sourceAssetId: F.assetApi,
        targetAssetId: F.assetApi,
        dependencyType: 'depends_on',
      }),
    ).toBeNull()

    await createAssetDependency({ sourceAssetId: F.assetApi, targetAssetId: F.assetDb, dependencyType: 'depends_on' })
    await createAssetDependency({ sourceAssetId: F.assetApi, targetAssetId: F.assetDb, dependencyType: 'depends_on' })
    const edges = await getProductDependencyEdges(F.productShared)
    expect(edges).toHaveLength(1)
  })

  it('deletes an edge', async () => {
    const edge = await createAssetDependency({
      sourceAssetId: F.assetApi,
      targetAssetId: F.assetDb,
      dependencyType: 'integrates_with',
    })
    await deleteAssetDependency(edge!.id)
    expect(await getProductDependencyEdges(F.productShared)).toHaveLength(0)
  })
})

describe('getImpactedAssets', () => {
  it('lists dependents of a plan target, excluding targets themselves', async () => {
    // planActive targets assetApi (fixture). Make assetDb depend on assetApi.
    await createAssetDependency({
      sourceAssetId: F.assetDb,
      targetAssetId: F.assetApi,
      dependencyType: 'depends_on',
    })

    const impacted = await getImpactedAssets(F.planActive)
    expect(impacted).toHaveLength(1)
    expect(impacted[0].id).toBe(F.assetDb)
    expect(impacted[0].viaAssetName).toBe('API Service')
  })

  it('excludes assets that are themselves plan targets', async () => {
    await createAssetDependency({
      sourceAssetId: F.assetDb,
      targetAssetId: F.assetApi,
      dependencyType: 'depends_on',
    })
    await addPlanAsset(F.planActive, F.assetDb) // now assetDb is also a target
    const impacted = await getImpactedAssets(F.planActive)
    expect(impacted).toHaveLength(0)
  })

  it('empty for plans with no targets', async () => {
    expect(await getImpactedAssets(F.planDraft)).toEqual([])
  })
})

describe('getAnalytics', () => {
  it('computes velocity, type distribution, and cycle time from real tasks', async () => {
    const analytics = await getAnalytics(F.alice)

    expect(analytics.velocityByWeek).toHaveLength(8)
    // task3 (done, updatedAt now) falls into the last week bucket
    expect(analytics.velocityByWeek[7].completed).toBeGreaterThanOrEqual(1)

    // 3 tasks on planActive (feature), 1 on planCompleted (bugfix)
    const feature = analytics.tasksByType.find((t) => t.name === 'Feature')
    expect(feature?.value).toBe(75)
    const bugfix = analytics.tasksByType.find((t) => t.name === 'Bug Fix')
    expect(bugfix?.value).toBe(25)

    expect(analytics.avgCycleTimeDays).not.toBeNull()
    expect(analytics.techDebtByProduct.map((p) => p.name)).toContain('Shared Product')
  })

  it('returns empty analytics for a user with no products', async () => {
    const { db } = await import('@/lib/db/index')
    const schema = await import('@/lib/db/schema.sqlite')
    await (db as any).insert(schema.users).values({
      id: 'no-products',
      email: 'none@test.local',
      name: 'None',
      billingTier: 'free',
      role: 'viewer',
      featureFlags: {},
    })
    const analytics = await getAnalytics('no-products')
    expect(analytics.velocityByWeek).toEqual([])
    expect(analytics.insights).toEqual([])
  })

  it('scopes to a single product when productId is given', async () => {
    const analytics = await getAnalytics(F.alice, F.productShared)
    expect(analytics.techDebtByProduct).toHaveLength(1)
  })
})
