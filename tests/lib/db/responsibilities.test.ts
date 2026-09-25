import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, syncLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { setAssetOwners } from '@/lib/db/mutations'
import {
  addProductMember,
  removeProductMember,
  getProductPeople,
  getUserResponsibilities,
  canManageResponsibilities,
} from '@/lib/db/responsibilities'

const DAVE = 'user-dave-resp' // viewer member

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: DAVE, email: 'dave-resp@test.local', name: 'Dave', billingTier: 'free', role: 'viewer', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'member-dave-resp', organizationId: F.org, userId: DAVE, role: 'viewer', joinedAt: new Date() })
})
afterEach(async () => { await clearTables() })

describe('product responsibilities', () => {
  it('lets an org admin assign and lists people with code owners', async () => {
    await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'architect', area: 'schema' }, { id: F.alice })
    await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
    await setAssetOwners(F.assetApi, [F.bob], { id: F.alice })
    const people = await getProductPeople(F.productShared, DAVE)
    expect(people.members.map((m) => [m.name, m.responsibility, m.area])).toEqual(
      expect.arrayContaining([['Bob', 'architect', 'schema'], ['Alice', 'eng_manager', null]]),
    )
    expect(people.codeOwners).toEqual([{ userId: F.bob, name: 'Bob', email: 'bob@test.local', assets: [{ id: F.assetApi, name: 'API Service' }] }])
  })

  it('is idempotent and only keeps an area for architects', async () => {
    const a = await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'contributor', area: 'ignored' }, { id: F.alice })
    const b = await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'contributor' }, { id: F.alice })
    expect(a.id).toBe(b.id)
    expect(a.area).toBe('')
  })

  it('lets an engineering manager who is an editor manage, but not a plain editor or viewer', async () => {
    expect(await canManageResponsibilities(F.bob, F.productShared)).toBe(false)
    await expect(addProductMember({ productId: F.productShared, userId: DAVE, responsibility: 'contributor' }, { id: F.bob })).rejects.toThrow('engineering manager')
    await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'eng_manager' }, { id: F.alice })
    expect(await canManageResponsibilities(F.bob, F.productShared)).toBe(true)
    await addProductMember({ productId: F.productShared, userId: DAVE, responsibility: 'contributor' }, { id: F.bob })
    expect(await canManageResponsibilities(DAVE, F.productShared)).toBe(false)
  })

  it('refuses people without access to the product', async () => {
    await expect(addProductMember({ productId: F.productShared, userId: F.carol, responsibility: 'architect' }, { id: F.alice })).rejects.toThrow('access')
    await expect(getProductPeople(F.productShared, F.carol)).rejects.toThrow('accessible')
  })

  it('removes assignments and audits both changes', async () => {
    const row = await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'architect' }, { id: F.alice })
    await removeProductMember(row.id, { id: F.alice })
    expect((await getProductPeople(F.productShared, F.alice)).members).toEqual([])
    const events = await db.query.syncLog.findMany({ where: eq(syncLog.entityId, F.productShared) })
    expect(events.map((e) => e.event)).toEqual(['member_added', 'member_removed'])
    expect(events[0].payload).toMatchObject({ userId: F.bob, responsibility: 'architect' })
  })

  it('collects a user\'s responsibilities across products, including code ownership', async () => {
    await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'architect', area: 'api' }, { id: F.alice })
    await setAssetOwners(F.assetDb, [F.bob], { id: F.alice })
    expect(await getUserResponsibilities(F.bob)).toEqual(expect.arrayContaining([
      { kind: 'architect', productId: F.productShared, area: 'api' },
      { kind: 'code_owner', productId: F.productShared, assetId: F.assetDb },
    ]))
    expect(await getUserResponsibilities(F.bob, [F.productCarol])).toEqual([])
  })
})
