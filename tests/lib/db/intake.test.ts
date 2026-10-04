import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db/index'
import { workItems, syncLog } from '@/lib/db/schema.sqlite'
import { createWorkItem, updateWorkItem } from '@/lib/db/mutations'
import { importExternalWorkItems, triageWorkItem, IntakeError, type ImportItem } from '@/lib/db/intake'

const d = db as any
const agent = { id: F.alice, kind: 'agent' as const }

beforeAll(async () => { await runMigrations() })
beforeEach(async () => { await seedFixtures() })
afterEach(async () => { await clearTables() })

const report = (n: number, extra: Partial<ImportItem> = {}): ImportItem => ({
  key: `antirez/ds4#${n}`, url: `https://github.com/antirez/ds4/issues/${n}`, title: `Issue ${n}`,
  state: 'open', author: 'reporter', createdAt: '2026-09-01T00:00:00Z', labels: ['bug'], ...extra,
})
const byKey = async (key: string) => (await d.select().from(workItems)).find((w: any) => w.externalKey === key)

describe('importExternalWorkItems', () => {
  it('creates untriaged external items with upstream facts, type inferred from labels', async () => {
    const r = await importExternalWorkItems(F.productShared, [report(1), report(2, { labels: ['enhancement'] })], agent)
    expect(r).toMatchObject({ created: 2, updated: 0, unchanged: 0 })
    const one = await byKey('antirez/ds4#1')
    expect(one).toMatchObject({ origin: 'external', triageState: 'untriaged', source: 'native', type: 'bug', status: 'open', connectionId: null })
    expect(one.externalData).toMatchObject({ state: 'open', author: 'reporter', labels: ['bug'] })
    expect((await byKey('antirez/ds4#2')).type).toBe('enhancement')
  })

  it('is idempotent and only refreshes upstream facts on re-import', async () => {
    await importExternalWorkItems(F.productShared, [report(1)], agent)
    const item = await byKey('antirez/ds4#1')
    await updateWorkItem(item.id, { title: 'Edited by the team', severity: 'high' }, agent)
    await triageWorkItem(item.id, { state: 'accepted' }, agent)

    expect(await importExternalWorkItems(F.productShared, [report(1)], agent)).toMatchObject({ created: 0, updated: 0, unchanged: 1 })
    const r = await importExternalWorkItems(F.productShared, [report(1, { state: 'closed', title: 'Upstream retitle', triage: { state: 'declined', declineReason: 'spam', note: 'x' } })], agent)
    expect(r).toMatchObject({ created: 0, updated: 1 })
    const after = await byKey('antirez/ds4#1')
    expect(after).toMatchObject({ title: 'Edited by the team', severity: 'high', triageState: 'accepted', status: 'open' })
    expect(after.externalData.state).toBe('closed')
    expect((await d.select().from(workItems)).filter((w: any) => w.externalKey === 'antirez/ds4#1')).toHaveLength(1)
  })

  it('applies a supplied decision to a still-untriaged item', async () => {
    await importExternalWorkItems(F.productShared, [report(5)], agent)
    await importExternalWorkItems(F.productShared, [report(5, { triage: { state: 'declined', declineReason: 'already_shipped', note: 'Merged as e88a71e' } })], agent)
    expect(await byKey('antirez/ds4#5')).toMatchObject({ triageState: 'declined', declineReason: 'already_shipped', triageNote: 'Merged as e88a71e', status: 'wont_do' })
  })

  it('imports decisions up front, so skipped reports keep their reasons', async () => {
    await importExternalWorkItems(F.productShared, [
      report(22, { triage: { state: 'declined', declineReason: 'already_shipped', note: 'Responses API merged as e88a71e' } }),
      report(113, { triage: { state: 'declined', declineReason: 'question_answered', note: 'Answered in thread' } }),
      report(410, { triage: { state: 'accepted' }, assetId: F.assetApi, severity: 'high' }),
    ], agent)
    expect(await byKey('antirez/ds4#22')).toMatchObject({ status: 'wont_do', declineReason: 'already_shipped', triagedById: F.alice, triagedByKind: 'agent' })
    expect(await byKey('antirez/ds4#410')).toMatchObject({ triageState: 'accepted', assetId: F.assetApi, severity: 'high', status: 'open' })
  })

  it('rejects bad input before writing anything', async () => {
    await expect(importExternalWorkItems(F.productShared, [report(1), report(1)], agent)).rejects.toThrow(/appears twice/)
    await expect(importExternalWorkItems(F.productShared, [report(1, { triage: { state: 'declined' } })], agent)).rejects.toThrow(/needs a reason/)
    await expect(importExternalWorkItems(F.productShared, [report(1, { triage: { state: 'declined', declineReason: 'spam' } })], agent)).rejects.toThrow(/needs a note/)
    await expect(importExternalWorkItems(F.productShared, [report(1, { assetId: 'nope' })], agent)).rejects.toThrow(/not in this product/)
    await expect(importExternalWorkItems(F.productShared, [report(1, { title: ' ' })], agent)).rejects.toThrow(/needs a title/)
    expect(await byKey('antirez/ds4#1')).toBeUndefined()
  })

  it('keys are per product', async () => {
    await importExternalWorkItems(F.productShared, [report(1)], agent)
    await importExternalWorkItems(F.productCarol, [report(1)], { id: F.carol, kind: 'agent' })
    expect((await d.select().from(workItems)).filter((w: any) => w.externalKey === 'antirez/ds4#1')).toHaveLength(2)
  })
})

describe('triageWorkItem', () => {
  it('couples status to the decision and records who decided', async () => {
    await importExternalWorkItems(F.productShared, [report(7)], agent)
    const item = await byKey('antirez/ds4#7')
    const declined = await triageWorkItem(item.id, { state: 'declined', declineReason: 'duplicate', note: 'Same as #724' }, agent)
    expect(declined).toMatchObject({ status: 'wont_do', declineReason: 'duplicate', triageNote: 'Same as #724' })
    const reopened = await triageWorkItem(item.id, { state: 'needs_info', note: 'Which GPU?' }, agent)
    expect(reopened).toMatchObject({ status: 'open', triageState: 'needs_info', declineReason: null, triageNote: 'Which GPU?' })
    const log = (await d.select().from(syncLog)).filter((l: any) => l.event === 'triaged' && l.entityId === item.id)
    expect(log).toHaveLength(2)
  })

  it('only applies to external items', async () => {
    const internal = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'Internal', description: '', severity: 'low', tags: [] }, F.alice)
    await expect(triageWorkItem(internal.id, { state: 'accepted' }, agent)).rejects.toBeInstanceOf(IntakeError)
  })
})

describe('external reference on create/update (W7)', () => {
  it('create_work_item with a reference makes it external and untriaged', async () => {
    const item = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'From forum', description: '', severity: 'medium', tags: [],
      external: { key: 'forum:thread-88', url: 'https://forum.example/t/88' } }, F.alice, 'agent')
    expect(item).toMatchObject({ origin: 'external', triageState: 'untriaged', externalKey: 'forum:thread-88', source: 'native' })
  })

  it('refuses a key another item already holds, and can attach or remove later', async () => {
    await importExternalWorkItems(F.productShared, [report(9)], agent)
    const other = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'Other', description: '', severity: 'low', tags: [] }, F.alice)
    await expect(updateWorkItem(other.id, { external: { key: 'antirez/ds4#9' } }, agent)).rejects.toThrow(/already has external key/)
    const attached = await updateWorkItem(other.id, { external: { key: 'antirez/ds4#10' } }, agent)
    expect(attached).toMatchObject({ origin: 'external', triageState: 'untriaged' })
    const removed = await updateWorkItem(other.id, { external: null }, agent)
    expect(removed).toMatchObject({ origin: 'internal', externalKey: null, triageState: null })
  })
})
