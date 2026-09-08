/** Opt-in integration verification against an EMPTY disposable Postgres database.
 * SPEC_TEST_DATABASE_URL=postgres://... pnpm exec tsx scripts/verify-specs-postgres.ts
 */
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { migrate } from 'drizzle-orm/postgres-js/migrator'
import { eq, sql } from 'drizzle-orm'

async function main() {
  const url = process.env.SPEC_TEST_DATABASE_URL
  if (!url) throw new Error('Set SPEC_TEST_DATABASE_URL to an empty disposable Postgres database')
  process.env.DB_PROVIDER = 'postgres'
  process.env.DATABASE_URL = url
  process.env.DB_SSL = 'false'
  const { db } = await import('../lib/db')
  const { users, products, assets, workItems, specs, assetDesignLog, specLinks } = await import('../lib/db/schema.pg')
  const { createSpec, linkSpec, updateSpec, getSpec, supersedeSpec } = await import('../lib/db/specs')
  const { createDesignNote, graduateWorkItem } = await import('../lib/db/mutations')
  const { getWikiProduct } = await import('../lib/db/wiki')
  const { getAssetRecord, getAssetHistory } = await import('../lib/db/queries')
  const { migrateLegacySpecs } = await import('../lib/db/spec-migration')
  const client = (db as unknown as { $client: { end(): Promise<void> } }).$client
  try {
    const existing = await db.execute(sql`select tablename from pg_tables where schemaname = 'public'`)
    assert.equal(existing.length, 0, 'Refusing to run: test database must be empty')
    await migrate(db, { migrationsFolder: 'lib/db/migrations/postgres' })
    // Running the migrator twice must leave the schema intact.
    await migrate(db, { migrationsFolder: 'lib/db/migrations/postgres' })
    const userId = randomUUID(), productId = randomUUID(), assetId = randomUUID(), workItemId = randomUUID()
    await db.insert(users).values({ id: userId, email: 'spec-test@example.test', name: 'Spec test' })
    await db.insert(products).values({ id: productId, name: 'Spec verification', slug: 'spec-verification', creatorId: userId })
    await db.insert(assets).values({ id: assetId, productId, name: 'API', type: 'service' })
    await db.insert(workItems).values({ id: workItemId, productId, assetId, title: 'Feature', type: 'feature', status: 'resolved', specUrl: 'https://gitlab.com/broken/docs/schema.md' })
    const first = await createSpec({ productId, title: 'Quota schema', body: '# Quota v1', specType: 'schema' }, userId)
    await linkSpec(first.id, 'work_item', workItemId, undefined, userId)
    const receipt = await graduateWorkItem(workItemId)
    assert.ok(receipt.capability)
    assert.equal(receipt.capability.sourceSpecVersion, 1)
    const note = await createDesignNote({ assetId, title: 'Refinement', body: 'Retrospective', revisesSpecId: first.id, revisedSpecBody: '# Quota v2', expectedSpecVersion: 1 })
    assert.ok(note.specEventId)
    await assert.rejects(createDesignNote({ assetId, title: 'Stale', revisesSpecId: first.id, revisedSpecBody: '# stale', expectedSpecVersion: 1 }))
    assert.equal((await db.select().from(assetDesignLog)).length, 1)
    const record = (await getAssetRecord(assetId, userId))!
    assert.equal(record.capabilities[0].sourceSpecVersion, 1)
    assert.equal(record.activeSpecs[0].currentVersion, 2)
    assert.equal(record.activeSpecs[0].deliveredThroughVersion, 1)
    const history = (await getAssetHistory(assetId, userId))!
    assert.ok(history.some((e) => e.kind === 'spec_updated' && e.noteId === note.id))
    const concurrent = await Promise.allSettled([
      updateSpec(first.id, { body: 'edit A', expectedVersion: 2 }, userId),
      updateSpec(first.id, { body: 'edit B', expectedVersion: 2 }, userId),
    ])
    assert.equal(concurrent.filter((r) => r.status === 'fulfilled').length, 1)
    assert.equal((await getSpec(first.id, userId)).version, 3)
    const next = await supersedeSpec(first.id, 'Different approach', undefined, userId)
    assert.equal(next.version, 1)
    assert.equal((await getSpec(first.id, userId)).supersededBy, next.id)
    const dry = await migrateLegacySpecs(productId, { fetchBody: async () => null })
    assert.equal(dry.placeholderCount, 1)
    assert.equal(dry.createCount, 1)
    await migrateLegacySpecs(productId, { apply: true, fetchBody: async () => null })
    assert.equal((await migrateLegacySpecs(productId, { apply: true, fetchBody: async () => null })).createCount, 0)
    assert.equal((await db.select().from(specs)).length, 3)
    const imported = (await db.select().from(specs)).find((s) => s.sourceType === 'git_import')!
    await supersedeSpec(imported.id, 'Revised imported approach', undefined, userId)
    const wiki = await getWikiProduct('spec-verification', userId)
    assert.ok(wiki)
    assert.equal(wiki.documents.find((d) => d.id === first.id)?.createdBy, 'Spec test')
    assert.ok(wiki.documents.some((d) => d.kind === 'spec' && d.associations.some((a) => a.assetId === assetId)))
    assert.equal(await getWikiProduct('spec-verification', randomUUID()), null)
    await db.delete(products).where(eq(products.id, productId))
    assert.equal((await db.select().from(specs)).length, 0)
    assert.equal((await db.select().from(specLinks)).length, 0)
    console.log('Postgres passed: full migration chain + rerun, FK cleanup, concurrent edits, note rollback, pinned delivery gaps, supersession, import dry-run + idempotency, wiki assembly + access + attribution.')
  } finally { await client.end() }
}
main().catch((error) => { console.error(error); process.exitCode = 1 })
