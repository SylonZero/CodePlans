import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createIntegration, updateWorkItem, updateWorkItemStatus } from '@/lib/db/mutations'
import { runSync, syncConnection } from '@/lib/integrations/sync'
import { githubConnector } from '@/lib/integrations/github'
import type { Connector, ExternalItem } from '@/lib/integrations/types'
import { db } from '@/lib/db/index'
import { workItems, syncLog, integrations } from '@/lib/db/schema.sqlite'

const d = db as any

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
  process.env.TEST_SYNC_TOKEN = 'test-token'
})

afterEach(async () => {
  await clearTables()
  delete process.env.TEST_SYNC_TOKEN
  vi.unstubAllGlobals()
})

function makeItems(): ExternalItem[] {
  return [
    {
      externalId: '1',
      externalKey: '#1',
      externalUrl: 'https://github.com/acme/app/issues/1',
      title: 'Login broken on Safari',
      description: 'Cookie not set',
      state: 'open',
      labels: ['bug', 'auth'],
      updatedAt: '2026-07-01T00:00:00Z',
    },
    {
      externalId: '2',
      externalKey: '#2',
      externalUrl: 'https://github.com/acme/app/issues/2',
      title: 'Dark mode support',
      description: '',
      state: 'closed',
      labels: ['enhancement'],
      updatedAt: '2026-07-02T00:00:00Z',
    },
  ]
}

function stubConnector(items: ExternalItem[]): Connector {
  return {
    provider: 'github',
    defaultStatusMap: { open: 'open', closed: 'resolved' },
    listItems: async () => items,
  }
}

async function makeIntegration() {
  return createIntegration({
    organizationId: F.org,
    provider: 'github',
    name: 'Test repo',
    authRef: 'TEST_SYNC_TOKEN',
    config: { repo: 'acme/app', productId: F.productShared },
  })
}

describe('runSync', () => {
  it('creates mirrored work items with mapped status and inferred type', async () => {
    const integration = await makeIntegration()
    const result = await runSync(integration as any, stubConnector(makeItems()))
    expect(result).toMatchObject({ created: 2, updated: 0, unchanged: 0 })

    const rows = await d.select().from(workItems).where(eq(workItems.connectionId, integration.id))
    expect(rows).toHaveLength(2)

    const bug = rows.find((r: any) => r.externalId === '1')
    expect(bug.source).toBe('github')
    expect(bug.type).toBe('bug') // inferred from the "bug" label
    expect(bug.status).toBe('open')
    expect(bug.externalKey).toBe('#1')

    const enhancement = rows.find((r: any) => r.externalId === '2')
    expect(enhancement.type).toBe('enhancement')
    expect(enhancement.status).toBe('resolved') // closed → resolved
  })

  it('is idempotent: unchanged items are skipped, changed ones updated', async () => {
    const integration = await makeIntegration()
    await runSync(integration as any, stubConnector(makeItems()))

    // Same payload again → everything unchanged
    const second = await runSync(integration as any, stubConnector(makeItems()))
    expect(second).toMatchObject({ created: 0, updated: 0, unchanged: 2 })

    // Change one item upstream
    const changed = makeItems()
    changed[0] = { ...changed[0], title: 'Login broken on Safari 18', updatedAt: '2026-07-03T00:00:00Z' }
    const third = await runSync(integration as any, stubConnector(changed))
    expect(third).toMatchObject({ created: 0, updated: 1, unchanged: 1 })

    const [row] = await d
      .select()
      .from(workItems)
      .where(eq(workItems.externalId, '1'))
    expect(row.title).toBe('Login broken on Safari 18')
  })

  it('preserves native annotations (asset, area) across syncs', async () => {
    const integration = await makeIntegration()
    await runSync(integration as any, stubConnector(makeItems()))

    const [mirrored] = await d.select().from(workItems).where(eq(workItems.externalId, '1'))
    await updateWorkItem(mirrored.id, { assetId: F.assetApi, area: 'auth/session' })

    const changed = makeItems()
    changed[0] = { ...changed[0], title: 'Retitled upstream', updatedAt: '2026-07-04T00:00:00Z' }
    await runSync(integration as any, stubConnector(changed))

    const [after] = await d.select().from(workItems).where(eq(workItems.externalId, '1'))
    expect(after.title).toBe('Retitled upstream') // mirrored field followed upstream
    expect(after.assetId).toBe(F.assetApi)        // native annotation preserved
    expect(after.area).toBe('auth/session')
  })

  it('rejects local edits to mirrored fields', async () => {
    const integration = await makeIntegration()
    await runSync(integration as any, stubConnector(makeItems()))
    const [mirrored] = await d.select().from(workItems).where(eq(workItems.externalId, '1'))

    const updated = await updateWorkItem(mirrored.id, { title: 'Local rename', assetId: F.assetDb })
    expect(updated!.title).toBe('Login broken on Safari') // mirrored: unchanged
    expect(updated!.assetId).toBe(F.assetDb)              // native: applied

    expect(await updateWorkItemStatus(mirrored.id, 'resolved')).toBeNull()
  })

  it('writes sync_log entries attributed to the connection', async () => {
    const integration = await makeIntegration()
    await runSync(integration as any, stubConnector(makeItems()))
    const logs = await d.select().from(syncLog).where(eq(syncLog.connectionId, integration.id))
    expect(logs).toHaveLength(2)
    expect(logs[0].actorId).toBeNull()
    expect(logs[0].event).toBe('created')
  })

  it('errors cleanly when the token env var is missing', async () => {
    delete process.env.TEST_SYNC_TOKEN
    const integration = await makeIntegration()
    const result = await runSync(integration as any, stubConnector(makeItems()))
    expect(result.error).toContain('TEST_SYNC_TOKEN')
    expect(result.created).toBe(0)
  })
})

describe('syncConnection', () => {
  it('records connector failures on the integration row', async () => {
    const integration = await makeIntegration()
    // No fetch stub → real connector would be used; stub fetch to fail fast.
    vi.stubGlobal('fetch', vi.fn(async () => new Response('nope', { status: 401 })))
    const result = await syncConnection(integration.id)
    expect(result.error).toContain('GitHub API 401')

    const [row] = await d.select().from(integrations).where(eq(integrations.id, integration.id))
    expect(row.status).toBe('error')
    expect(row.lastError).toContain('GitHub API 401')
  })

  it('returns an error for unknown connections', async () => {
    const result = await syncConnection('nonexistent')
    expect(result.error).toBe('Connection not found')
  })
})

describe('githubConnector', () => {
  it('maps issues and excludes pull requests', async () => {
    const payload = [
      {
        number: 7,
        html_url: 'https://github.com/acme/app/issues/7',
        title: 'Crash on startup',
        body: 'Stack trace attached',
        state: 'open',
        labels: [{ name: 'bug' }, 'critical'],
        assignee: { login: 'octocat' },
        updated_at: '2026-07-01T10:00:00Z',
      },
      {
        number: 8,
        html_url: 'https://github.com/acme/app/pull/8',
        title: 'A pull request',
        body: '',
        state: 'open',
        labels: [],
        assignee: null,
        updated_at: '2026-07-01T11:00:00Z',
        pull_request: { url: 'x' },
      },
    ]
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify(payload), { status: 200 })),
    )

    const items = await githubConnector.listItems(
      { token: 't' },
      { repo: 'acme/app' },
    )
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      externalId: '7',
      externalKey: '#7',
      title: 'Crash on startup',
      state: 'open',
      labels: ['bug', 'critical'],
      assigneeName: 'octocat',
    })
  })

  it('throws with API status on failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('forbidden', { status: 403 })))
    await expect(
      githubConnector.listItems({ token: 't' }, { repo: 'acme/app' }),
    ).rejects.toThrow('GitHub API 403')
  })
})

describe('phase 5: milestone-linked plans & PR auto-linking', () => {
  const scopeItems: ExternalItem[] = [
    {
      externalId: '101',
      externalKey: '#101',
      externalUrl: 'https://github.com/acme/app/issues/101',
      title: 'Implement API endpoint',
      description: '',
      state: 'open',
      labels: [],
      updatedAt: '2026-07-05T00:00:00Z',
    },
    {
      externalId: '102',
      externalKey: '#102',
      externalUrl: 'https://github.com/acme/app/issues/102',
      title: 'Write migration',
      description: '',
      state: 'closed',
      labels: [],
      updatedAt: '2026-07-05T01:00:00Z',
    },
  ]

  function fullStubConnector(): Connector {
    return {
      provider: 'github',
      defaultStatusMap: { open: 'open', closed: 'resolved' },
      listItems: async () => [],
      listScopeItems: async () => scopeItems,
      fetchPullRequest: async () => 'merged',
    }
  }

  async function linkPlan(integrationId: string) {
    const { linkPlanToExternalScope } = await import('@/lib/db/mutations')
    await linkPlanToExternalScope(F.planActive, {
      provider: 'github',
      connectionId: integrationId,
      externalId: '5',
      externalKey: 'v1.0',
    })
  }

  it('mirrors milestone issues as plan tasks (mixed with native tasks)', async () => {
    const integration = await makeIntegration()
    await linkPlan(integration.id)

    const result = await runSync(integration as any, fullStubConnector())
    expect(result.tasksCreated).toBe(2)

    const { tasks } = await import('@/lib/db/schema.sqlite')
    const planTasks = await d.select().from(tasks).where(eq(tasks.codePlanId, F.planActive))
    // 3 native fixture tasks + 2 mirrored
    expect(planTasks).toHaveLength(5)

    const mirrored = planTasks.find((t: any) => t.externalId === '102')
    expect(mirrored.source).toBe('github')
    expect(mirrored.status).toBe('done') // closed → done

    // Idempotent second run
    const second = await runSync(integration as any, fullStubConnector())
    expect(second.tasksCreated).toBe(0)
    expect(second.tasksUpdated).toBe(0)
  })

  it('rejects local status changes on mirrored tasks; allows native fields', async () => {
    const integration = await makeIntegration()
    await linkPlan(integration.id)
    await runSync(integration as any, fullStubConnector())

    const { tasks } = await import('@/lib/db/schema.sqlite')
    const { updateTask, updateTaskStatus } = await import('@/lib/db/mutations')
    const [mirrored] = await d.select().from(tasks).where(eq(tasks.externalId, '101'))

    expect(await updateTaskStatus(mirrored.id, 'done')).toBeNull()

    const updated = await updateTask(mirrored.id, { title: 'renamed', assigneeId: F.bob, estimatedEffort: 4 })
    expect(updated!.title).toBe('Implement API endpoint') // mirrored: unchanged
    expect(updated!.assigneeId).toBe(F.bob)               // native: applied
    expect(updated!.estimatedEffort).toBe(4)
  })

  it('unlinking converts mirrored tasks to native', async () => {
    const integration = await makeIntegration()
    await linkPlan(integration.id)
    await runSync(integration as any, fullStubConnector())

    const { unlinkPlanFromExternalScope } = await import('@/lib/db/mutations')
    await unlinkPlanFromExternalScope(F.planActive)

    const { tasks, codePlans } = await import('@/lib/db/schema.sqlite')
    const planTasks = await d.select().from(tasks).where(eq(tasks.codePlanId, F.planActive))
    expect(planTasks.every((t: any) => t.source === 'native')).toBe(true)
    const [plan] = await d.select().from(codePlans).where(eq(codePlans.id, F.planActive))
    expect(plan.source).toBe('native')
    expect(plan.connectionId).toBeNull()
  })

  it('updates prStatus for plan assets whose PR URL points at the repo', async () => {
    const integration = await makeIntegration()
    const { updatePlanAsset } = await import('@/lib/db/mutations')
    // fixture: planActive targets assetApi via code_plan_assets
    await updatePlanAsset(F.planActive, F.assetApi, {
      prUrl: 'https://github.com/acme/app/pull/42',
      prStatus: 'open',
    })

    const result = await runSync(integration as any, fullStubConnector())
    expect(result.prsUpdated).toBe(1)

    const { codePlanAssets } = await import('@/lib/db/schema.sqlite')
    const [row] = await d
      .select()
      .from(codePlanAssets)
      .where(eq(codePlanAssets.codePlanId, F.planActive))
    expect(row.prStatus).toBe('merged')

    // Second run: status already merged → no update
    const second = await runSync(integration as any, fullStubConnector())
    expect(second.prsUpdated).toBe(0)
  })

  it('ignores PR URLs pointing at other repos', async () => {
    const integration = await makeIntegration()
    const { updatePlanAsset } = await import('@/lib/db/mutations')
    await updatePlanAsset(F.planActive, F.assetApi, {
      prUrl: 'https://github.com/other/repo/pull/9',
      prStatus: 'open',
    })
    const result = await runSync(integration as any, fullStubConnector())
    expect(result.prsUpdated).toBe(0)
  })
})
