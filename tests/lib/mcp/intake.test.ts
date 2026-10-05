import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createSpec } from '@/lib/db/specs'
import { paginate } from '@/lib/mcp/list-shape'
import { normalizeRepo } from '@/lib/integrations/github-public'

const { registered } = vi.hoisted(() => ({ registered: new Map<string, (...args: any[]) => Promise<any>>() }))
vi.mock('mcp-handler', () => ({
  createMcpHandler: (register: (server: any) => void) => {
    register({ tool: (name: string, _d: string, _s: unknown, handler: (...args: any[]) => Promise<any>) => registered.set(name, handler) })
    return () => {}
  },
  withMcpAuth: (handler: unknown) => handler,
}))
beforeAll(async () => { await runMigrations(); await import('@/app/api/mcp/[transport]/route') })
beforeEach(seedFixtures)
afterEach(async () => { await clearTables(); vi.unstubAllGlobals() })
const extra = (userId: string, write = true) => ({ authInfo: { scopes: write ? ['read', 'write'] : ['read'], extra: { userId } } })
const call = async (tool: string, data: unknown, user = F.alice as string) => JSON.parse((await registered.get(tool)!(data, extra(user))).content[0].text)

const items = (n: number, from = 1) => Array.from({ length: n }, (_, i) => ({
  externalKey: `acme/app#${from + i}`, externalUrl: `https://github.com/acme/app/issues/${from + i}`, title: `Report ${from + i}`, labels: ['bug'], externalState: 'open',
}))

describe('list shape', () => {
  it('pages with an opaque cursor', () => {
    const rows = Array.from({ length: 5 }, (_, i) => i)
    const a = paginate(rows, { limit: 2 })
    expect(a).toMatchObject({ items: [0, 1], total: 5 })
    const b = paginate(rows, { limit: 2, cursor: a.nextCursor! })
    const c = paginate(rows, { limit: 2, cursor: b.nextCursor! })
    expect([b.items, c.items, c.nextCursor]).toEqual([[2, 3], [4], null])
    expect(() => paginate(rows, { cursor: 'not-a-cursor' })).toThrow(/Invalid cursor/)
  })
})

describe('list_work_items', () => {
  it('returns a compact page by default and full rows on request', async () => {
    await call('import_work_items', { productId: F.productShared, items: items(3) })
    const page = await call('list_work_items', { productId: F.productShared, origin: 'external', limit: 2 })
    expect(page.total).toBe(3)
    expect(page.items).toHaveLength(2)
    expect(page.items[0]).toMatchObject({ origin: 'external', triageState: 'untriaged', externalKey: expect.stringMatching(/^acme\/app#/), externalState: 'open' })
    expect(page.items[0].description).toBeUndefined()
    const next = await call('list_work_items', { productId: F.productShared, origin: 'external', limit: 2, cursor: page.nextCursor })
    expect(next.items).toHaveLength(1)
    const full = await call('list_work_items', { productId: F.productShared, origin: 'external', fields: 'full' })
    expect(full.items[0]).toHaveProperty('description')
  })

  it('filters by severity, tag, origin and triage state', async () => {
    await call('import_work_items', { productId: F.productShared, items: [
      { ...items(1)[0], severity: 'critical', tags: ['gpu'] },
      { ...items(1, 2)[0], triage: { state: 'declined', declineReason: 'question', note: 'Support question' } },
    ] })
    expect((await call('list_work_items', { severity: 'critical' })).items.map((i: any) => i.title)).toEqual(['Report 1'])
    expect((await call('list_work_items', { tag: 'gpu' })).total).toBe(1)
    expect((await call('list_work_items', { triageState: 'declined' })).items[0]).toMatchObject({ declineReason: 'question', status: 'wont_do' })
    const internal = await call('list_work_items', { productId: F.productShared, origin: 'internal' })
    expect(internal.items.every((i: any) => i.origin === 'internal')).toBe(true)
  })
})

describe('list_specs', () => {
  it('omits bodies by default', async () => {
    await createSpec({ productId: F.productShared, title: 'Big', body: 'x'.repeat(5000), specType: 'feature' }, F.alice)
    const page = await call('list_specs', { productId: F.productShared })
    expect(page.items[0]).toMatchObject({ title: 'Big', bodyLength: 5000 })
    expect(page.items[0].body).toBeUndefined()
    expect((await call('list_specs', { productId: F.productShared, fields: 'full' })).items[0].body).toHaveLength(5000)
  })
})

describe('import, triage and external references over MCP', () => {
  it('re-importing creates nothing new', async () => {
    expect(await call('import_work_items', { productId: F.productShared, items: items(4) })).toMatchObject({ created: 4 })
    expect(await call('import_work_items', { productId: F.productShared, items: items(4) })).toMatchObject({ created: 0, unchanged: 4 })
  })

  it('returns rule violations as errors instead of throwing', async () => {
    const { items: [row] } = await call('import_work_items', { productId: F.productShared, items: items(1) })
    expect(await call('triage_work_item', { id: row.id, state: 'declined' })).toMatchObject({ error: expect.stringMatching(/needs a reason/) })
    expect(await call('triage_work_item', { id: row.id, state: 'declined', declineReason: 'duplicate', note: 'Same as #724' })).toMatchObject({ status: 'wont_do' })
    expect(await call('create_work_item', { productId: F.productShared, title: 'Dup', type: 'bug', severity: 'low', description: '', tags: [], externalKey: 'acme/app#1' }))
      .toMatchObject({ error: expect.stringMatching(/already has external key/) })
  })

  it('create_work_item and update_work_item carry an external reference', async () => {
    const created = await call('create_work_item', { productId: F.productShared, title: 'Forum post', type: 'ux', severity: 'low', description: '', tags: [],
      externalKey: 'forum:88', externalUrl: 'https://forum.example/t/88', externalState: 'open' })
    expect(created).toMatchObject({ origin: 'external', triageState: 'untriaged', externalKey: 'forum:88' })
    expect(await call('update_work_item', { id: created.id, removeExternalRef: true })).toMatchObject({ origin: 'internal', externalKey: null })
  })

  it('requires write access to the product', async () => {
    await expect(registered.get('import_work_items')!({ productId: F.productShared, items: items(1) }, extra(F.alice, false))).rejects.toThrow('read-only')
    await expect(call('import_work_items', { productId: F.productShared, items: items(1) }, F.carol)).rejects.toThrow()
  })
})

describe('import_github_issues', () => {
  const issue = (n: number, extraFields: Record<string, unknown> = {}) => ({
    number: n, html_url: `https://github.com/Acme/App/issues/${n}`, title: `Issue ${n}`, body: 'Steps…', state: 'open',
    created_at: '2026-09-01T00:00:00Z', user: { login: 'reporter' }, labels: [{ name: 'enhancement' }], ...extraFields,
  })
  const respond = (body: unknown, status = 200, headers: Record<string, string> = { 'x-ratelimit-remaining': '57' }) =>
    ({ ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body), headers: new Headers(headers) })

  it('imports issues read-only, skips pull requests, and is idempotent', async () => {
    const fetchMock = vi.fn().mockImplementation(async () => respond([issue(1), issue(2, { pull_request: {} }), issue(3)]))
    vi.stubGlobal('fetch', fetchMock)
    const r = await call('import_github_issues', { productId: F.productShared, repo: 'https://github.com/Acme/App' })
    expect(r).toMatchObject({ repo: 'acme/app', fetched: 2, created: 2, githubRateRemaining: 57 })
    expect(fetchMock.mock.calls.every(([, init]: any) => !init?.method || init.method === 'GET')).toBe(true)
    const listed = await call('list_work_items', { productId: F.productShared, origin: 'external' })
    expect(listed.items.map((i: any) => i.externalKey).sort()).toEqual(['acme/app#1', 'acme/app#3'])
    expect(listed.items[0]).toMatchObject({ type: 'enhancement', triageState: 'untriaged' })
    expect(await call('import_github_issues', { productId: F.productShared, repo: 'acme/app' })).toMatchObject({ created: 0, unchanged: 2 })
  })

  it('reports not-found and rate limits clearly', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({ message: 'Not Found' }, 404)))
    expect(await call('import_github_issues', { productId: F.productShared, repo: 'acme/nope' })).toMatchObject({ error: expect.stringMatching(/not found or is private/) })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(respond({}, 403, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': '1790000000' })))
    expect(await call('import_github_issues', { productId: F.productShared, repo: 'acme/app' })).toMatchObject({ error: expect.stringMatching(/rate limit.*GITHUB_PUBLIC_TOKEN/) })
  })

  it('normalizes repo names', () => {
    expect(normalizeRepo('https://github.com/Antirez/ds4.git')).toBe('antirez/ds4')
    expect(() => normalizeRepo('not a repo')).toThrow(/owner\/name/)
  })
})
