import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createIntegration, deleteIntegration, updateIntegration, IntegrationScopeChangeError } from '@/lib/db/mutations'
import { runSync, reconcileDeleted, scopeLabel } from '@/lib/integrations/sync'
import { githubConnector } from '@/lib/integrations/github'
import type { Connector, ExternalItem } from '@/lib/integrations/types'
import { db } from '@/lib/db/index'
import { workItems, syncLog, integrations } from '@/lib/db/schema.sqlite'

const d = db as any

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  process.env.TEST_SYNC_TOKEN = 'test-token'
})
afterEach(async () => {
  await clearTables()
  delete process.env.TEST_SYNC_TOKEN
  vi.unstubAllGlobals()
})

const issue = (n: number, updatedAt = '2026-07-01T00:00:00Z'): ExternalItem => ({
  externalId: String(n), externalKey: `#${n}`, externalUrl: `https://github.com/acme/app/issues/${n}`,
  title: `Issue ${n}`, description: '', state: 'open', labels: [], updatedAt,
})

function connector(items: ExternalItem[], allIds?: Set<string> | null | (() => never)): Connector {
  return {
    provider: 'github',
    defaultStatusMap: { open: 'open', closed: 'resolved' },
    listItems: async () => items,
    ...(allIds !== undefined ? { listAllIds: async () => (typeof allIds === 'function' ? allIds() : allIds) } : {}),
  }
}

const makeIntegration = (repo = 'acme/app') => createIntegration({
  organizationId: F.org, provider: 'github', name: 'Test repo', authRef: 'TEST_SYNC_TOKEN',
  config: { repo, productId: F.productShared, statusMap: { triage: 'open' } },
})
const reload = async (id: string) => d.query.integrations.findFirst({ where: eq(integrations.id, id) })
const items = async (connectionId?: string) => (await d.select().from(workItems))
  .filter((w: any) => w.source === 'github' && (connectionId === undefined || w.connectionId === connectionId))

describe('which repo an item came from', () => {
  it('records the scope on every mirrored item', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)]))
    const [row] = await items(conn.id)
    expect(row.externalData.scope).toBe('acme/app')
  })

  it('labels self-hosted scopes with their host', () => {
    expect(scopeLabel({ repo: 'grp/proj', baseUrl: 'https://gitlab.acme.dev/' })).toBe('https://gitlab.acme.dev/grp/proj')
    expect(scopeLabel({})).toBeNull()
  })

  it('refuses to re-point a connection that already mirrors items', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)]))
    await expect(updateIntegration(conn.id, { config: { repo: 'acme/other', productId: F.productShared } }))
      .rejects.toBeInstanceOf(IntegrationScopeChangeError)
    expect((await reload(conn.id)).config.repo).toBe('acme/app')
  })

  it('allows scope changes before anything is mirrored, and other edits after', async () => {
    const conn = await makeIntegration()
    await updateIntegration(conn.id, { config: { repo: 'acme/other', productId: F.productShared } })
    expect((await reload(conn.id)).config.repo).toBe('acme/other')
    await runSync(await reload(conn.id), connector([issue(1)]))
    await updateIntegration(conn.id, { name: 'Renamed', config: { repo: 'ACME/other/', productId: F.productShared } })
    expect((await reload(conn.id)).name).toBe('Renamed')
  })

  it('keeps settings the edit form does not show', async () => {
    const conn = await makeIntegration()
    await updateIntegration(conn.id, { config: { repo: 'acme/app', productId: F.productShared } })
    expect((await reload(conn.id)).config.statusMap).toEqual({ triage: 'open' })
  })
})

describe('reconnecting after a connection was deleted', () => {
  it('adopts the orphaned items instead of duplicating them', async () => {
    const first = await makeIntegration()
    await runSync(first, connector([issue(1), issue(2)]))
    const [one] = (await items()).filter((w: any) => w.externalId === '1')
    await d.update(workItems).set({ area: 'auth', severity: 'high' }).where(eq(workItems.id, one.id))

    await deleteIntegration(first.id)
    expect((await items()).every((w: any) => w.connectionId === null)).toBe(true)

    const second = await makeIntegration()
    const result = await runSync(second, connector([issue(1), issue(2), issue(3)]))
    expect(result).toMatchObject({ created: 1, updated: 2 })
    const all = await items()
    expect(all).toHaveLength(3)
    expect(all.every((w: any) => w.connectionId === second.id)).toBe(true)
    const kept = all.find((w: any) => w.id === one.id)
    expect(kept).toMatchObject({ area: 'auth', severity: 'high', externalId: '1' })
    const logged = (await d.select().from(syncLog)).filter((l: any) => l.event === 'relinked')
    expect(logged).toHaveLength(2)
  })

  it('does not adopt items still owned by another connection', async () => {
    const a = await makeIntegration()
    await runSync(a, connector([issue(1)]))
    const b = await makeIntegration()
    await runSync(b, connector([issue(1)]))
    expect(await items(a.id)).toHaveLength(1)
    expect(await items(b.id)).toHaveLength(1)
  })
})

describe('items deleted upstream', () => {
  it('marks missing items deleted on the daily check and logs it', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1), issue(2)], new Set(['1', '2'])))
    expect((await reload(conn.id)).lastReconciledAt).toBeTruthy()

    const later = new Date(Date.now() + 25 * 3600_000)
    const r = await reconcileDeleted(await reload(conn.id), connector([], new Set(['1'])), { token: 't' }, {}, later)
    expect(r).toEqual({ markedDeleted: 1, restored: 0 })
    const two = (await items(conn.id)).find((w: any) => w.externalId === '2')
    expect(two.externalDeleted).toBe(true)
    expect((await d.select().from(syncLog)).some((l: any) => l.event === 'external_deleted' && l.entityId === two.id)).toBe(true)
  })

  it('runs at most once a day', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)], new Set(['1'])))
    const r = await reconcileDeleted(await reload(conn.id), connector([], new Set()), { token: 't' }, {}, new Date(Date.now() + 3600_000))
    expect(r).toEqual({})
  })

  it('clears the flag when the item comes back', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)], new Set(['1'])))
    const later = (h: number) => new Date(Date.now() + h * 3600_000)
    await reconcileDeleted(await reload(conn.id), connector([], new Set(['9'])), { token: 't' }, {}, later(25))
    expect((await items(conn.id))[0].externalDeleted).toBe(true)
    const r = await reconcileDeleted(await reload(conn.id), connector([], new Set(['1'])), { token: 't' }, {}, later(50))
    expect(r).toEqual({ markedDeleted: 0, restored: 1 })
    expect((await items(conn.id))[0].externalDeleted).toBe(false)
  })

  it('an item seen again by a normal sync is no longer marked deleted', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)], new Set(['1'])))
    await reconcileDeleted(await reload(conn.id), connector([], new Set(['9'])), { token: 't' }, {}, new Date(Date.now() + 25 * 3600_000))
    await runSync(await reload(conn.id), connector([issue(1)]))
    expect((await items(conn.id))[0].externalDeleted).toBe(false)
  })

  it('skips the check when the listing is incomplete, empty, or fails', async () => {
    const conn = await makeIntegration()
    await runSync(conn, connector([issue(1)]))
    const row = { ...(await reload(conn.id)), lastReconciledAt: null }
    expect(await reconcileDeleted(row, connector([], null), { token: 't' }, {})).toEqual({})
    expect(await reconcileDeleted(row, connector([], new Set()), { token: 't' }, {})).toEqual({})
    expect(await reconcileDeleted(row, connector([], () => { throw new Error('boom') }), { token: 't' }, {})).toEqual({})
    expect((await items(conn.id))[0].externalDeleted).toBe(false)
  })
})

describe('githubConnector.listAllIds', () => {
  const page = (from: number, n: number, withPr = false) => Array.from({ length: n }, (_, i) => ({
    number: from + i, ...(withPr && i === 0 ? { pull_request: {} } : {}),
  }))

  it('lists every issue number across pages, skipping pull requests', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => page(1, 100, true) })
      .mockResolvedValueOnce({ ok: true, json: async () => page(101, 3) })
    vi.stubGlobal('fetch', fetchMock)
    const ids = await githubConnector.listAllIds!({ token: 't' }, { repo: 'acme/app' })
    expect(ids!.size).toBe(102)
    expect(ids!.has('1')).toBe(false)
    expect(String(fetchMock.mock.calls[0][0])).toContain('/repos/acme/app/issues?state=all')
  })

  it('returns null past the 5000-issue cap', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async () => ({ ok: true, json: async () => page(1, 100) })))
    expect(await githubConnector.listAllIds!({ token: 't' }, { repo: 'acme/app' })).toBeNull()
  })
})
