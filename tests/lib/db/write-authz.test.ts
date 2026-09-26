import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, products } from '@/lib/db/schema'
import {
  getProductRole,
  canWriteProduct,
  assertCanWrite,
  productIdFor,
  isOrgAdmin,
  canCreateProductIn,
  ForbiddenError,
  VIEW_ONLY_MESSAGE,
  NOT_ACCESSIBLE_MESSAGE,
} from '@/lib/db/authz'
import { createSpec, updateSpec } from '@/lib/db/specs'
import { eq } from 'drizzle-orm'

const DAVE = 'user-dave' // viewer member of F.org

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
  const d = db as any
  await d.insert(users).values({ id: DAVE, email: 'dave@test.local', name: 'Dave', billingTier: 'free', role: 'viewer', organizationId: F.org, featureFlags: {} })
  await d.insert(organizationMembers).values({ id: 'member-dave', organizationId: F.org, userId: DAVE, role: 'viewer', joinedAt: new Date() })
})

afterEach(async () => {
  await clearTables()
})

describe('getProductRole', () => {
  it('maps org membership roles onto the product', async () => {
    expect(await getProductRole(F.alice, F.productShared)).toBe('admin')
    expect(await getProductRole(F.bob, F.productShared)).toBe('editor')
    expect(await getProductRole(DAVE, F.productShared)).toBe('viewer')
  })

  it('gives no role to users outside the org', async () => {
    expect(await getProductRole(F.carol, F.productShared)).toBe('none')
  })

  it('treats the creator of a solo product as its admin and everyone else as none', async () => {
    expect(await getProductRole(F.carol, F.productCarol)).toBe('admin')
    expect(await getProductRole(F.alice, F.productCarol)).toBe('none')
  })

  it('makes archived products read-only unless includeArchived', async () => {
    await (db as any).update(products).set({ archivedAt: new Date() }).where(eq(products.id, F.productShared))
    expect(await getProductRole(F.alice, F.productShared)).toBe('none')
    expect(await getProductRole(F.alice, F.productShared, { includeArchived: true })).toBe('admin')
  })

  it('ignores pending (not yet joined) memberships', async () => {
    await (db as any).update(organizationMembers).set({ joinedAt: null }).where(eq(organizationMembers.userId, F.bob))
    expect(await getProductRole(F.bob, F.productShared)).toBe('none')
  })
})

describe('productIdFor', () => {
  it('resolves nested entities to their product', async () => {
    expect(await productIdFor({ assetId: F.assetApi })).toBe(F.productShared)
    expect(await productIdFor({ codePlanId: F.planActive })).toBe(F.productShared)
    expect(await productIdFor({ taskId: F.task1 })).toBe(F.productShared)
    expect(await productIdFor({ assetId: 'missing' })).toBeNull()
  })
})

describe('assertCanWrite', () => {
  it('allows editors and admins', async () => {
    await expect(assertCanWrite(F.bob, { taskId: F.task1 })).resolves.toBeUndefined()
    await expect(assertCanWrite(F.alice, { assetId: F.assetApi }, { codePlanId: F.planDraft })).resolves.toBeUndefined()
    expect(await canWriteProduct(F.bob, F.productShared)).toBe(true)
  })

  it('rejects viewers with a view-only message', async () => {
    await expect(assertCanWrite(DAVE, { assetId: F.assetApi })).rejects.toThrow(VIEW_ONLY_MESSAGE)
    expect(await canWriteProduct(DAVE, F.productShared)).toBe(false)
  })

  it('reports invisible targets as not found without leaking existence', async () => {
    const err = await assertCanWrite(F.carol, { codePlanId: F.planActive }).catch((e) => e)
    expect(err).toBeInstanceOf(ForbiddenError)
    expect(err.message).toBe(NOT_ACCESSIBLE_MESSAGE)
    await expect(assertCanWrite(F.bob, { assetId: 'missing' })).rejects.toThrow(NOT_ACCESSIBLE_MESSAGE)
  })

  it('fails when any one of several targets is not writable', async () => {
    await expect(assertCanWrite(F.carol, { productId: F.productCarol }, { assetId: F.assetApi })).rejects.toThrow(NOT_ACCESSIBLE_MESSAGE)
  })
})

describe('org-level checks', () => {
  it('isOrgAdmin is true only for owner/admin members', async () => {
    expect(await isOrgAdmin(F.org, F.alice)).toBe(true)
    expect(await isOrgAdmin(F.org, F.bob)).toBe(false)
    expect(await isOrgAdmin(F.org, DAVE)).toBe(false)
  })

  it('canCreateProductIn blocks viewers but always allows solo products', async () => {
    expect(await canCreateProductIn(F.bob, F.org)).toBe(true)
    expect(await canCreateProductIn(DAVE, F.org)).toBe(false)
    expect(await canCreateProductIn(DAVE, null)).toBe(true)
    expect(await canCreateProductIn(F.carol, F.org)).toBe(false)
  })
})

describe('spec writes respect roles', () => {
  it('lets editors create and revise specs, and blocks viewers', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'API contract', body: 'v1', specType: 'api' }, F.bob)
    await expect(createSpec({ productId: F.productShared, title: 'Nope', body: '', specType: 'api' }, DAVE)).rejects.toThrow(VIEW_ONLY_MESSAGE)
    await expect(updateSpec(spec.id, { body: 'v2' }, DAVE)).rejects.toThrow(VIEW_ONLY_MESSAGE)
    const revised = await updateSpec(spec.id, { body: 'v2' }, F.bob)
    expect(revised.version).toBe(2)
  })
})
