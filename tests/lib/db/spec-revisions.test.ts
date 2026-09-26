import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createSpec, updateSpec, supersedeSpec, linkSpec, listSpecRevisions, getSpecRevision } from '@/lib/db/specs'
import { createDesignNote } from '@/lib/db/mutations'

beforeAll(async () => { await runMigrations() })
beforeEach(async () => { await seedFixtures() })
afterEach(async () => { await clearTables() })

describe('spec revision history', () => {
  it('snapshots v1 on create and every later version on revise', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Auth', body: 'first', specType: 'api' }, F.alice)
    await updateSpec(spec.id, { body: 'second', changeSummary: 'Tighten token rules' }, F.bob)
    await updateSpec(spec.id, { status: 'active' }, F.alice)
    const revisions = await listSpecRevisions(spec.id, F.alice)
    expect(revisions.map((r) => [r.version, r.body, r.status])).toEqual([[3, 'second', 'active'], [2, 'second', 'draft'], [1, 'first', 'draft']])
    expect(revisions[1]).toMatchObject({ changeSummary: 'Tighten token rules', createdById: F.bob, authorName: 'Bob', createdByKind: 'user' })
  })

  it('keeps the pinned text readable after the spec moves on', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Auth', body: 'original intent', specType: 'api' }, F.alice)
    await updateSpec(spec.id, { body: 'new intent', title: 'Auth v2' }, F.alice)
    expect(await getSpecRevision(spec.id, 1, F.alice)).toMatchObject({ body: 'original intent', title: 'Auth' })
    expect(await getSpecRevision(spec.id, 2, F.alice)).toMatchObject({ body: 'new intent', title: 'Auth v2' })
    expect(await getSpecRevision(spec.id, 9, F.alice)).toBeNull()
  })

  it('does not change the version or history when a revise is rejected', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Auth', body: 'a', specType: 'api' }, F.alice)
    await expect(updateSpec(spec.id, { body: 'b', expectedVersion: 5 }, F.alice)).rejects.toThrow('reload')
    expect(await listSpecRevisions(spec.id, F.alice)).toHaveLength(1)
  })

  it('records the note-driven revision and the supersession start', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Schema', body: 'tables', specType: 'schema' }, F.alice)
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    await createDesignNote({ assetId: F.assetApi, title: 'Split table', revisesSpecId: spec.id, revisedSpecBody: 'split tables', authorId: F.alice, authorKind: 'agent' })
    expect((await getSpecRevision(spec.id, 2, F.alice))).toMatchObject({ body: 'split tables', createdByKind: 'agent' })
    const next = await supersedeSpec(spec.id, 'event sourced', undefined, F.alice)
    const [first] = await listSpecRevisions(next.id, F.alice)
    expect(first).toMatchObject({ version: 1, body: 'event sourced' })
    expect(first.changeSummary).toContain('Replaces')
  })

  it('hides history from users who cannot see the product', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Private', body: 'x', specType: 'api' }, F.alice)
    await expect(listSpecRevisions(spec.id, F.carol)).rejects.toThrow('accessible')
    await expect(getSpecRevision(spec.id, 1, F.carol)).rejects.toThrow('accessible')
  })
})
