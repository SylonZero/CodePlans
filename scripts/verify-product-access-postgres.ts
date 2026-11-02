/** Opt-in integration verification against an EMPTY disposable Postgres database.
 * PRODUCT_ACCESS_TEST_DATABASE_URL=postgres://... pnpm exec tsx scripts/verify-product-access-postgres.ts
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq, sql } from 'drizzle-orm'

async function main() {
  const url = process.env.PRODUCT_ACCESS_TEST_DATABASE_URL ?? process.env.SPEC_TEST_DATABASE_URL
  if (!url) {
    throw new Error('Set PRODUCT_ACCESS_TEST_DATABASE_URL (or SPEC_TEST_DATABASE_URL) to an empty disposable Postgres database')
  }
  process.env.DB_PROVIDER = 'postgres'
  process.env.DATABASE_URL = url
  process.env.DB_SSL = 'false'
  process.env.AUTH_SECRET = process.env.AUTH_SECRET ?? 'test-secret-at-least-32-bytes-xxxx'

  const { db } = await import('../lib/db')
  const { users, organizations, organizationMembers, products, productAccessGrants } = await import('../lib/db/schema.pg')
  const { getProducts } = await import('../lib/db/queries')
  const { getProductRole } = await import('../lib/db/authz')
  const {
    setProductAccessRestricted,
    grantProductAccess,
    clearProductAccessForUserInOrg,
  } = await import('../lib/db/product-access')
  const { createApiKey, verifyApiKey, revokeAllApiKeysForUser } = await import('../lib/mcp/auth')

  const client = (db as unknown as { $client: { end(): Promise<void> } }).$client
  try {
    const existing = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)
    assert.equal(existing.length, 0, 'Refusing to run: test database must be empty')
    await migrate(db, { migrationsFolder: 'lib/db/migrations/postgres' })
    await migrate(db, { migrationsFolder: 'lib/db/migrations/postgres' })

    const [col] = await db.execute(sql`
      select column_name from information_schema.columns
      where table_schema = 'public' and table_name = 'products' and column_name = 'access_restricted'`)
    assert.equal(col.length, 1, 'products.access_restricted column missing after migration')
    const [grantTable] = await db.execute(sql`
      select tablename from pg_tables where schemaname = 'public' and tablename = 'product_access_grants'`)
    assert.equal(grantTable.length, 1, 'product_access_grants table missing after migration')

    const orgId = randomUUID()
    const alice = randomUUID()
    const bob = randomUUID()
    const productId = randomUUID()

    await db.insert(users).values([
      { id: alice, email: 'alice-pg@test.local', name: 'Alice', role: 'owner' },
      { id: bob, email: 'bob-pg@test.local', name: 'Bob', role: 'editor' },
    ])
    await db.insert(organizations).values({ id: orgId, name: 'Acme', slug: `acme-${randomUUID().slice(0, 8)}`, ownerId: alice })
    await db.insert(organizationMembers).values([
      { id: randomUUID(), organizationId: orgId, userId: alice, role: 'owner', joinedAt: new Date() },
      { id: randomUUID(), organizationId: orgId, userId: bob, role: 'editor', joinedAt: new Date() },
    ])
    await db.insert(products).values({
      id: productId,
      name: 'Shared',
      slug: `shared-${randomUUID().slice(0, 8)}`,
      creatorId: alice,
      organizationId: orgId,
    })

    assert.equal((await getProducts(bob)).length, 1)

    await setProductAccessRestricted(productId, true, { id: alice, kind: 'user' })
    await db.delete(productAccessGrants).where(eq(productAccessGrants.userId, bob))

    assert.equal((await getProducts(bob)).length, 0)
    assert.equal(await getProductRole(bob, productId), 'none')
    assert.equal((await getProducts(alice)).length, 1)

    await grantProductAccess(productId, bob, { id: alice, kind: 'user' })
    assert.equal((await getProducts(bob)).length, 1)
    assert.equal(await getProductRole(bob, productId), 'editor')

    const { plaintext } = await createApiKey(bob, 'agent', 'write')
    assert.ok(await verifyApiKey(plaintext))
    assert.equal(await revokeAllApiKeysForUser(bob), 1)
    assert.equal(await verifyApiKey(plaintext), null)

    await clearProductAccessForUserInOrg(bob, orgId)
    const grants = await db.select().from(productAccessGrants).where(eq(productAccessGrants.userId, bob))
    assert.equal(grants.length, 0)

    console.log(
      'Postgres passed: migration chain + rerun, schema objects, restricted visibility, grants, MCP key revocation, grant cleanup.',
    )
  } finally {
    await client.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
