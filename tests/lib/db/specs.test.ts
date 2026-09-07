import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { workItems, codePlans, specs, specEvents, specLinks, assetDesignLog } from '@/lib/db/schema.sqlite'
import { eq } from 'drizzle-orm'
import { createSpec, updateSpec, supersedeSpec, linkSpec, unlinkSpec, getSpec, listSpecs } from '@/lib/db/specs'
import { createDesignNote, graduateWorkItem, moveAsset, addPlanAsset, deleteCodePlan } from '@/lib/db/mutations'
import { getAssetHistory, getAssetRecord } from '@/lib/db/queries'
import { migrateLegacySpecs, IMPORT_PLACEHOLDER } from '@/lib/db/spec-migration'

beforeAll(runMigrations)
beforeEach(seedFixtures)
afterEach(clearTables)
const d = db as any
const input = { productId: F.productShared, title: 'Quota contract', body: '# Quotas\n\nInitial design', specType: 'schema' }
async function item(id = 'wi-feature') {
  await d.insert(workItems).values({ id, productId: F.productShared, assetId: F.assetApi, type: 'feature', title: 'Quota enforcement', status: 'resolved' })
  return id
}

describe('native specs', () => {
  it('uses open taxonomy and protects access, target ownership, and relationship semantics', async () => {
    const spec = await createSpec({ ...input, specType: 'custom-kind', area: 'quotas' }, F.alice, 'agent')
    expect(spec).toMatchObject({ version: 1, status: 'draft', authorType: 'agent', specType: 'custom-kind' })
    await expect(createSpec(input, F.carol)).rejects.toThrow('accessible')
    await expect(getSpec(spec.id, F.carol)).rejects.toThrow('accessible')
    await expect(updateSpec(spec.id, { body: 'forbidden' }, F.carol)).rejects.toThrow('accessible')
    expect(await listSpecs(F.carol)).toEqual([])
    const other = await createSpec({ ...input, productId: F.productCarol }, F.carol)
    await expect(linkSpec(other.id, 'asset', F.assetApi, undefined, F.carol)).rejects.toThrow('same product')
    await expect(linkSpec(spec.id, 'asset', 'missing', undefined, F.alice)).rejects.toThrow('not found')
    await expect(linkSpec(spec.id, 'asset', F.assetApi, 'creates', F.alice)).rejects.toThrow('only to code plans')
    await expect(listSpecs(F.alice, { targetType: 'asset' })).rejects.toThrow('together')
    await expect(updateSpec(spec.id, {}, F.alice)).rejects.toThrow('body or status')
    await expect(updateSpec(spec.id, { status: 'superseded' as any }, F.alice)).rejects.toThrow()
  })

  it('deduplicates links and snapshots each revision event, including transitive plan links', async () => {
    const spec = await createSpec(input, F.alice)
    const link = await linkSpec(spec.id, 'code_plan', F.planActive, 'creates', F.alice)
    expect((await linkSpec(spec.id, 'code_plan', F.planActive, 'creates', F.alice)).id).toBe(link.id)
    await updateSpec(spec.id, { body: 'second', expectedVersion: 1 }, F.alice)
    await updateSpec(spec.id, { body: 'third', expectedVersion: 2 }, F.alice)
    await expect(updateSpec(spec.id, { body: 'stale', expectedVersion: 1 }, F.alice)).rejects.toThrow('changed')
    const history = (await getAssetHistory(F.assetApi, F.alice))!.filter((e) => e.specId === spec.id)
    expect(history).toHaveLength(3)
    expect(history.find((e) => e.kind === 'spec_linked')).toMatchObject({ specVersion: 1, planId: F.planActive })
    expect(history.filter((e) => e.kind === 'spec_updated').map((e) => [e.fromVersion, e.toVersion]).sort()).toEqual([[1, 2], [2, 3]])
    await unlinkSpec(link.id, F.alice)
    expect((await getAssetHistory(F.assetApi, F.alice))!.filter((e) => e.specId === spec.id)).toHaveLength(3)
    expect((await getAssetRecord(F.assetApi, F.alice))!.activeSpecs).toEqual([])
  })

  it('records arrival when a spec-linked plan gains an asset and cleans deleted target links', async () => {
    const spec = await createSpec(input, F.alice)
    await linkSpec(spec.id, 'code_plan', F.planDraft, 'creates', F.alice)
    expect((await getAssetHistory(F.assetDb, F.alice))!.filter((e) => e.specId === spec.id)).toHaveLength(0)
    await addPlanAsset(F.planDraft, F.assetDb)
    expect((await getAssetHistory(F.assetDb, F.alice))!.filter((e) => e.specId === spec.id)).toMatchObject([{ kind: 'spec_linked', version: 1, planId: F.planDraft }])
    await deleteCodePlan(F.planDraft, F.alice)
    expect((await getSpec(spec.id, F.alice)).links).toHaveLength(0)
    expect((await getAssetHistory(F.assetDb, F.alice))!.filter((e) => e.specId === spec.id)).toHaveLength(1)
  })

  it('keeps delivered version fixed after revision, repeated graduation, unlinking and supersession', async () => {
    const id = await item()
    const spec = await createSpec(input, F.alice)
    await linkSpec(spec.id, 'work_item', id, undefined, F.alice)
    const graduated = await graduateWorkItem(id)
    if ('error' in graduated) throw new Error(graduated.error)
    expect(graduated.capability.sourceSpecVersion).toBe(1)
    await updateSpec(spec.id, { body: 'new contract' }, F.alice)
    const record = (await getAssetRecord(F.assetApi, F.alice))!
    expect(record.capabilities[0]).toMatchObject({ sourceSpecId: spec.id, sourceSpecVersion: 1 })
    expect(record.activeSpecs[0]).toMatchObject({ currentVersion: 2, deliveredThroughVersion: 1 })
    expect((await graduateWorkItem(id))).toMatchObject({ existed: true, capability: { sourceSpecVersion: 1 } })
    const next = await supersedeSpec(spec.id, 'Replacement design', undefined, F.alice)
    expect(next).toMatchObject({ version: 1, status: 'draft', supersedes: spec.id })
    expect(await getSpec(spec.id, F.alice)).toMatchObject({ status: 'superseded', supersededBy: next.id })
    const after = (await getAssetRecord(F.assetApi, F.alice))!
    expect(after.capabilities[0].sourceSpecId).toBe(spec.id)
    expect(after.activeSpecs).toMatchObject([{ specId: next.id, currentVersion: 1, deliveredThroughVersion: null }])
    await expect(updateSpec(spec.id, { body: 'rewrite' }, F.alice)).rejects.toThrow('read-only')
    await expect(supersedeSpec(spec.id, 'Again', undefined, F.alice)).rejects.toThrow('already superseded')
  })

  it('requires an explicit delivery choice when multiple specs are linked', async () => {
    const id = await item()
    const first = await createSpec(input, F.alice)
    const second = await createSpec({ ...input, title: 'UX contract', specType: 'ux' }, F.alice)
    await linkSpec(first.id, 'work_item', id, undefined, F.alice)
    await linkSpec(second.id, 'work_item', id, undefined, F.alice)
    expect(await graduateWorkItem(id)).toHaveProperty('error')
    expect(await graduateWorkItem(id, 'unlinked')).toHaveProperty('error')
    expect(await graduateWorkItem(id, second.id)).toMatchObject({ capability: { sourceSpecId: second.id, sourceSpecVersion: 1 } })
  })

  it('commits note and revision together with separate cross-linked history entries', async () => {
    const spec = await createSpec(input, F.alice)
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    const note = await createDesignNote({ assetId: F.assetApi, title: 'Review', body: 'Why we changed this', revisesSpecId: spec.id, revisedSpecBody: 'New spec text', expectedSpecVersion: 1 })
    const history = (await getAssetHistory(F.assetApi, F.alice))!
    expect(history.find((e) => e.kind === 'design_note')).toMatchObject({ noteId: note.id, specEventId: note.specEventId, body: 'Why we changed this' })
    expect(history.find((e) => e.kind === 'spec_updated')).toMatchObject({ id: `spec_event:${note.specEventId}`, noteId: note.id, fromVersion: 1, toVersion: 2 })
    await expect(createDesignNote({ assetId: F.assetApi, title: 'Stale note', revisesSpecId: spec.id, revisedSpecBody: 'lost text', expectedSpecVersion: 1 })).rejects.toThrow('changed')
    expect(await d.select().from(assetDesignLog)).toHaveLength(1)
    await expect(createDesignNote({ assetId: F.assetApi, title: 'No replacement', revisesSpecId: spec.id })).rejects.toThrow('requires')
    await expect(createDesignNote({ assetId: F.assetDb, title: 'Wrong asset', revisesSpecId: spec.id, revisedSpecBody: 'wrong' })).rejects.toThrow('linked to this asset')
  })

  it('does not move linked work items into a different spec ownership boundary', async () => {
    const id = await item()
    const spec = await createSpec(input, F.alice)
    await linkSpec(spec.id, 'work_item', id, undefined, F.alice)
    // Database asset has no open-plan blocker.
    await d.update(workItems).set({ assetId: F.assetDb }).where(eq(workItems.id, id))
    expect(await moveAsset(F.assetDb, F.productCarol)).toMatchObject({ error: expect.stringContaining('Unlink specs') })
  })
})

describe('legacy import', () => {
  it('dry-runs without writes, collapses duplicates, handles broken URLs, and reruns without overwriting edits', async () => {
    const url = 'https://gitlab.com/team/project/-/blob/main/docs/schema.md'
    await d.update(codePlans).set({ specUrl: url }).where(eq(codePlans.id, F.planActive))
    await d.update(codePlans).set({ specUrl: url }).where(eq(codePlans.id, F.planDraft))
    const id = await item()
    await d.update(workItems).set({ specUrl: 'https://gitlab.com/malformed/docs/spec.md' }).where(eq(workItems.id, id))
    const fetchBody = async (source: string) => source === url ? '# Imported schema' : null
    const dry = await migrateLegacySpecs(F.productShared, { fetchBody })
    expect(dry).toMatchObject({ dryRun: true, sourceCount: 3, uniqueUrls: 2, createCount: 2, collapsedDuplicates: 1, placeholderCount: 1 })
    expect(await d.select().from(specs)).toHaveLength(0)
    expect(await d.select().from(specLinks)).toHaveLength(0)
    expect(await d.select().from(specEvents)).toHaveLength(0)
    const applied = await migrateLegacySpecs(F.productShared, { apply: true, fetchBody })
    const imported = applied.entries.find((e) => e.sourceUrl === url)!
    expect(await getSpec(imported.specId!, F.alice)).toMatchObject({ body: '# Imported schema', sourceType: 'git_import', specType: 'schema', needsReview: true, links: [{ relationshipType: 'creates' }, { relationshipType: 'creates' }] })
    expect((await listSpecs(F.alice)).find((s) => s.sourceUrl?.includes('malformed'))!.body).toBe(IMPORT_PLACEHOLDER)
    await updateSpec(imported.specId!, { body: 'Curated content' }, F.alice)
    await updateSpec(imported.specId!, { specType: 'api', area: 'quotas', needsReview: false }, F.alice)
    expect(await getSpec(imported.specId!, F.alice)).toMatchObject({ specType: 'api', area: 'quotas', needsReview: false })
    const rerun = await migrateLegacySpecs(F.productShared, { apply: true, fetchBody })
    expect(rerun.createCount).toBe(0)
    expect(await d.select().from(specLinks)).toHaveLength(3)
    expect((await getSpec(imported.specId!, F.alice)).body).toBe('Curated content')
  })
})
