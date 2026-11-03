import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { organizationMembers, productAccessGrants } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getProducts } from '@/lib/db/queries'
import { getProductRole } from '@/lib/db/authz'
import {
  setProductAccessRestricted,
  grantProductAccess,
  clearProductAccessForUserInOrg,
} from '@/lib/db/product-access'
import { createApiKey, verifyApiKey, revokeAllApiKeysForUser } from '@/lib/mcp/auth'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('product access allowlist', () => {
  it('hides restricted products from members without a grant', async () => {
    await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    await (db as any).delete(productAccessGrants).where(eq(productAccessGrants.userId, F.bob))

    expect(await getProducts(F.bob)).toHaveLength(0)
    expect(await getProductRole(F.bob, F.productShared)).toBe('none')
    expect(await getProducts(F.alice)).toHaveLength(1)
  })

  it('lets org admins see restricted products without a grant row', async () => {
    await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    await (db as any).delete(productAccessGrants).where(eq(productAccessGrants.userId, F.alice))

    expect(await getProducts(F.alice)).toHaveLength(1)
    expect(await getProductRole(F.alice, F.productShared)).toBe('admin')
  })

  it('restores member visibility when a grant is added', async () => {
    await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    await (db as any).delete(productAccessGrants).where(eq(productAccessGrants.userId, F.bob))
    await grantProductAccess(F.productShared, F.bob, { id: F.alice, kind: 'user' })

    expect(await getProducts(F.bob)).toHaveLength(1)
    expect(await getProductRole(F.bob, F.productShared)).toBe('editor')
  })

  it('seeds one grant per person when a member has duplicate membership rows', async () => {
    await (db as any).insert(organizationMembers).values({
      id: 'member-bob-dup',
      organizationId: F.org,
      userId: F.bob,
      role: 'editor',
      joinedAt: new Date(),
    })
    const result = await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    expect(result?.grants?.map((g) => g.userId).sort()).toEqual([F.alice, F.bob].sort())
  })

  it('seeds grants for all members when restriction is enabled', async () => {
    const result = await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    expect(result?.accessRestricted).toBe(true)
    expect(result?.grants?.map((g) => g.userId).sort()).toEqual([F.alice, F.bob].sort())
    expect(await getProducts(F.bob)).toHaveLength(1)
  })

  it('returns unrestricted visibility when restriction is turned off', async () => {
    await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    await (db as any).delete(productAccessGrants).where(eq(productAccessGrants.userId, F.bob))
    expect(await getProducts(F.bob)).toHaveLength(0)

    await setProductAccessRestricted(F.productShared, false, { id: F.alice, kind: 'user' })
    expect(await getProducts(F.bob)).toHaveLength(1)
  })
})

describe('revoke grants and MCP keys', () => {
  it('revokeAllApiKeysForUser invalidates every active key', async () => {
    const { plaintext } = await createApiKey(F.bob, 'agent', 'write')
    expect(await verifyApiKey(plaintext)).not.toBeNull()
    expect(await revokeAllApiKeysForUser(F.bob)).toBe(1)
    expect(await verifyApiKey(plaintext)).toBeNull()
  })

  it('clearProductAccessForUserInOrg removes grant rows', async () => {
    await setProductAccessRestricted(F.productShared, true, { id: F.alice, kind: 'user' })
    await clearProductAccessForUserInOrg(F.bob, F.org)
    const rows = await (db as any).query.productAccessGrants.findMany({
      where: eq(productAccessGrants.userId, F.bob),
    })
    expect(rows).toHaveLength(0)
  })
})
