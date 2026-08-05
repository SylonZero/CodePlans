import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getAssetInventory } from '@/lib/db/queries'
import { moveAsset, updateAsset, createRelease, updateRelease, setReleaseAsset } from '@/lib/db/mutations'
import { effectiveLayer } from '@/lib/types'
import { db } from '@/lib/db/index'
import { workItems, releaseAssets } from '@/lib/db/schema.sqlite'
import { eq } from 'drizzle-orm'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('layers', () => {
  it('effectiveLayer: explicit beats type default', () => {
    expect(effectiveLayer('service')).toBe('backend')
    expect(effectiveLayer('app', null)).toBe('frontend')
    expect(effectiveLayer('library', 'domain')).toBe('domain')
    expect(effectiveLayer('datastore', '  ')).toBe('data')
  })

  it('inventory carries explicit and effective layers', async () => {
    await updateAsset(F.assetDb, { layer: 'domain' })
    const inv = await getAssetInventory(F.alice)
    const dbRow = inv.assets.find((a) => a.id === F.assetDb)!
    expect(dbRow.layer).toBe('domain')
    expect(dbRow.effectiveLayer).toBe('domain')
    const apiRow = inv.assets.find((a) => a.id === F.assetApi)!
    expect(apiRow.layer).toBeUndefined()
    expect(apiRow.effectiveLayer).toBe('backend') // service default

    // Clearing the explicit layer restores the type default (datastore → data).
    await updateAsset(F.assetDb, { layer: null })
    const cleared = await getAssetInventory(F.alice)
    expect(cleared.assets.find((a) => a.id === F.assetDb)!.effectiveLayer).toBe('data')
  })
})

describe('moveAsset', () => {
  it('is blocked while draft/active plans target the asset, listing them', async () => {
    // planActive (active) targets assetApi in the fixtures.
    const result = await moveAsset(F.assetApi, F.productCarol)
    expect('error' in result).toBe(true)
    const blocking = 'blockingPlans' in result ? result.blockingPlans : undefined
    expect(blocking?.map((p) => p.id)).toEqual([F.planActive])
  })

  it('moves the asset, carries its work items, and preserves history', async () => {
    await (db as any).insert(workItems).values({
      id: 'wi-on-db',
      productId: F.productShared,
      assetId: F.assetDb,
      type: 'tech_debt',
      title: 'No TTLs',
      status: 'open',
      severity: 'high',
      tags: [],
    })
    const release = await createRelease({ productId: F.productShared, name: 'DB v1' }, F.alice)
    await setReleaseAsset(release.id, F.assetDb, { version: 'v1.0.0' })
    await updateRelease(release.id, { status: 'shipped' })

    const result = await moveAsset(F.assetDb, F.productCarol)
    if ('error' in result) throw new Error(result.error)
    expect(result.moved).toBe(true)
    expect(result.asset.productId).toBe(F.productCarol)

    // Demand followed the asset…
    const item = await db.query.workItems.findFirst({ where: (w: any, { eq: e }: any) => e(w.id, 'wi-on-db') })
    expect(item!.productId).toBe(F.productCarol)
    // …and history stayed put: the shipped stamp survives untouched.
    const stamp = await (db as any).select().from(releaseAssets).where(eq(releaseAssets.assetId, F.assetDb))
    expect(stamp).toHaveLength(1)
    expect(stamp[0].version).toBe('v1.0.0')

    // Access re-scopes: carol sees it now; it left alice's inventory.
    expect((await getAssetInventory(F.carol)).assets.map((a) => a.id)).toEqual([F.assetDb])
    expect((await getAssetInventory(F.alice)).assets.some((a) => a.id === F.assetDb)).toBe(false)
  })

  it('no-ops when already in the target product and validates the target', async () => {
    const same = await moveAsset(F.assetDb, F.productShared)
    if ('error' in same) throw new Error(same.error)
    expect(same.moved).toBe(false)

    const bad = await moveAsset(F.assetDb, 'nope')
    expect('error' in bad).toBe(true)
  })
})
