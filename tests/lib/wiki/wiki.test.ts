import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import {
  assets,
  products,
  users,
  organizationMembers,
  workItems,
  codePlans,
} from '@/lib/db/schema.sqlite'
import { eq } from 'drizzle-orm'
import { getWikiProduct } from '@/lib/db/wiki'
import { createSpec, linkSpec, updateSpec } from '@/lib/db/specs'
import {
  createAsset,
  updateAsset,
  createWorkItem,
  createRelease,
  updateRelease,
  setReleaseAsset,
  attachPlanToRelease,
  graduateWorkItem,
  createDesignNote,
} from '@/lib/db/mutations'
import { searchWiki } from '@/lib/wiki/model'
const d = db as any
beforeAll(runMigrations)
beforeEach(seedFixtures)
afterEach(clearTables)
// Match fixture slug independently of its display name.
async function read(user = F.alice as string) {
  const [p] = await d
    .select()
    .from(products)
    .where(eq(products.id, F.productShared))
  return getWikiProduct(p.slug, user)
}

describe('product wiki', () => {
  it('filters product visibility before loading searchable content, including pending membership', async () => {
    expect(await read(F.carol)).toBeNull()
    expect(await read(F.bob)).not.toBeNull()
    await d
      .update(organizationMembers)
      .set({ joinedAt: null })
      .where(eq(organizationMembers.userId, F.bob))
    expect(await read(F.bob)).toBeNull()
    expect(await getWikiProduct('missing', F.alice)).toBeNull()
  })
  it('deduplicates transitive spec associations while preserving their reasons and unassigned content', async () => {
    const s = await createSpec(
      {
        productId: F.productShared,
        title: 'Shared design',
        body: '# Contract\n\nMAX_FILE_SIZE_BYTES = 25',
        specType: 'schema',
      },
      F.alice,
    )
    const item = await createWorkItem(
      {
        productId: F.productShared,
        assetId: F.assetApi,
        title: 'Upload support',
        type: 'feature',
        description: 'Files',
        tags: [],
        severity: 'high',
      },
      F.alice,
    )
    await linkSpec(s.id, 'asset', F.assetApi, undefined, F.alice)
    await linkSpec(s.id, 'code_plan', F.planActive, 'references', F.alice)
    await linkSpec(s.id, 'work_item', item.id, undefined, F.alice)
    const loose = await createSpec(
      {
        productId: F.productShared,
        title: 'Product proposal',
        body: 'Unassigned',
        specType: 'architecture',
      },
      F.alice,
    )
    const result = (await read())!
    expect(
      result.documents.filter((d) => d.key === `spec:${s.id}`),
    ).toHaveLength(1)
    expect(
      result.documents
        .find((d) => d.id === s.id)
        ?.associations.filter((a) => a.assetId === F.assetApi).length,
    ).toBeGreaterThan(1)
    expect(
      result.documents.find((d) => d.id === loose.id)?.associations,
    ).toEqual([])
    expect(
      searchWiki(result.documents, {
        q: 'MAX_FILE_SIZE_BYTES',
        asset: F.assetApi,
      }).map((r) => r.document.id),
    ).toEqual([s.id])
    expect(
      searchWiki(result.documents, {
        q: 'MAX_FILE_SIZE_BYTES',
        asset: F.assetDb,
      }),
    ).toEqual([])
    expect(
      result.activity.filter(
        (e) => e.kind === 'spec_linked' && e.assetIds.includes(F.assetApi),
      ),
    ).toMatchObject([{ documentKeys: [`spec:${s.id}`], count: 3 }])
  })
  it('distinguishes shipped stamps from in-progress release versions and pins delivery gaps', async () => {
    const r = await createRelease(
      { productId: F.productShared, name: 'Rollout v9' },
      F.alice,
    )
    await setReleaseAsset(r.id, F.assetApi, { version: '9.0' })
    await attachPlanToRelease(F.planCompleted, r.id)
    const s = await createSpec(
      {
        productId: F.productShared,
        title: 'Feature v9',
        body: 'Intent',
        specType: 'feature',
      },
      F.alice,
    )
    const i = await createWorkItem(
      {
        productId: F.productShared,
        assetId: F.assetApi,
        title: 'Ready',
        description: 'Implemented',
        type: 'feature',
        tags: [],
        severity: 'medium',
      },
      F.alice,
    )
    await d
      .update(workItems)
      .set({ status: 'resolved' })
      .where(eq(workItems.id, i.id))
    await linkSpec(s.id, 'work_item', i.id, undefined, F.alice)
    await graduateWorkItem(i.id, undefined, { id: F.bob, kind: 'agent' })
    await updateSpec(s.id, { body: 'Next revision' }, F.alice)
    let result = (await read())!
    expect(
      result.assets.find((a) => a.id === F.assetApi)?.version,
    ).toBeUndefined()
    expect(result.receipts).toMatchObject([{ specId: s.id, version: 1 }])
    expect(result.documents.find((d) => d.id === s.id)?.version).toBe(2)
    await updateRelease(r.id, { status: 'shipped' }, { id: F.alice })
    result = (await read())!
    expect(result.assets.find((a) => a.id === F.assetApi)?.version).toBe('9.0')
  })
  it('records actual creators/editors, clears unknown edit attribution, and preserves old unknowns', async () => {
    const a = await createAsset(
      {
        productId: F.productShared,
        name: 'Worker',
        type: 'service',
        description: 'Initial',
        tags: [],
      },
      { id: F.alice, kind: 'agent' },
    )
    await updateAsset(a.id, { notes: 'Runbook' }, { id: F.bob })
    let result = (await read())!,
      doc = result.documents.find((d) => d.key === `asset:${a.id}`)!
    expect(doc).toMatchObject({
      createdBy: 'Alice',
      createdByKind: 'agent',
      updatedBy: 'Bob',
      updatedByKind: 'user',
    })
    expect(
      result.documents.find((d) => d.key === `asset:${F.assetApi}`)?.createdBy,
    ).toBeNull()
    await updateAsset(a.id, { notes: 'External update' })
    expect(
      (await read())!.documents.find((d) => d.key === `asset:${a.id}`)
        ?.updatedBy,
    ).toBeNull()
    // Attribution FKs must use SET NULL, including SQLite's additive migration.
    await d.delete(users).where(eq(users.id, F.bob))
    expect((await read())!.assets.some((x) => x.id === a.id)).toBe(true)
  })
  it('attributes atomic design-note spec revisions and rejects stale edits without changing metadata', async () => {
    const s = await createSpec(
      {
        productId: F.productShared,
        title: 'Contract',
        body: 'v1',
        specType: 'api',
      },
      F.alice,
    )
    await linkSpec(s.id, 'asset', F.assetApi, undefined, F.alice)
    await createDesignNote({
      assetId: F.assetApi,
      title: 'Why',
      body: 'Decision',
      authorId: F.bob,
      authorKind: 'agent',
      revisesSpecId: s.id,
      revisedSpecBody: 'v2',
      expectedSpecVersion: 1,
    })
    await expect(
      updateSpec(s.id, { body: 'stale', expectedVersion: 1 }, F.alice),
    ).rejects.toThrow()
    const doc = (await read())!.documents.find((d) => d.id === s.id)!
    expect(doc).toMatchObject({
      updatedBy: 'Bob',
      updatedByKind: 'agent',
      version: 2,
    })
  })
  it('does not expose out-of-product assets through legacy plan associations', async () => {
    const foreign = await createAsset({
      productId: F.productCarol,
      name: 'Private asset',
      type: 'service',
      description: 'secret',
      tags: [],
    })
    const { codePlanAssets } = await import('@/lib/db/schema.sqlite')
    await d
      .insert(codePlanAssets)
      .values({ codePlanId: F.planActive, assetId: foreign.id })
    const result = (await read())!
    expect(JSON.stringify(result)).not.toContain('Private asset')
    expect(
      result.documents
        .flatMap((d) => d.associations)
        .some((a) => a.assetId === foreign.id),
    ).toBe(false)
  })
})
