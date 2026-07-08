import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createAsset } from '@/lib/db/mutations'
import { getProduct } from '@/lib/db/queries'

beforeAll(async () => { await runMigrations() })
beforeEach(async () => { await seedFixtures() })
afterEach(async () => { await clearTables() })

describe('createAsset dedup', () => {
  it('returns the existing asset for a duplicate (product, name) instead of creating', async () => {
    const first = await createAsset({
      productId: F.productShared, name: 'UI Kit', type: 'library', description: 'a', tags: [],
    })
    const second = await createAsset({
      productId: F.productShared, name: 'UI Kit', type: 'library', description: 'b', tags: [],
    })
    expect(second.id).toBe(first.id)
    const product = await getProduct('shared-product', F.alice)
    expect(product!.assets.filter((a) => a.name === 'UI Kit')).toHaveLength(1)
  })

  it('same name under a different product still creates', async () => {
    const a = await createAsset({ productId: F.productShared, name: 'API', type: 'service', description: '', tags: [] })
    const b = await createAsset({ productId: F.productCarol, name: 'API', type: 'service', description: '', tags: [] })
    expect(a.id).not.toBe(b.id)
  })
})
