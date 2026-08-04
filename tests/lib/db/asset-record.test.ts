import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getAssetRecord } from '@/lib/db/queries'
import {
  createRelease,
  updateRelease,
  attachPlanToRelease,
  setReleaseAsset,
  graduateWorkItem,
  updateCapability,
  removeCapability,
} from '@/lib/db/mutations'
import { db } from '@/lib/db/index'
import { workItems, workItemCodePlans } from '@/lib/db/schema.sqlite'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

async function insertItem(overrides: Record<string, unknown>) {
  await (db as any).insert(workItems).values({
    productId: F.productShared,
    assetId: F.assetApi,
    type: 'feature',
    status: 'resolved',
    severity: 'medium',
    tags: [],
    ...overrides,
  })
}

describe('graduateWorkItem', () => {
  it('rejects missing, unresolved, wrong-type, and asset-less items', async () => {
    expect(await graduateWorkItem('nope')).toEqual({ error: 'Work item not found' })

    await insertItem({ id: 'wi-open', title: 'Still cooking', status: 'in_progress' })
    expect('error' in (await graduateWorkItem('wi-open'))).toBe(true)

    await insertItem({ id: 'wi-bug', title: 'Crash on save', type: 'bug' })
    expect('error' in (await graduateWorkItem('wi-bug'))).toBe(true)

    await insertItem({ id: 'wi-orphan', title: 'No home', assetId: null })
    expect('error' in (await graduateWorkItem('wi-orphan'))).toBe(true)
  })

  it('captures the full delivery lineage: work item → plan → release stamp', async () => {
    const release = await createRelease({ productId: F.productShared, name: 'API v2' }, F.alice)
    await attachPlanToRelease(F.planCompleted, release.id)
    await setReleaseAsset(release.id, F.assetApi, { version: 'v2.0.0' })
    await updateRelease(release.id, { status: 'shipped' })

    await insertItem({ id: 'wi-feat', title: 'Bulk export', description: 'CSV + JSON', area: 'exports' })
    await (db as any).insert(workItemCodePlans).values({ workItemId: 'wi-feat', codePlanId: F.planCompleted })

    const result = await graduateWorkItem('wi-feat')
    if ('error' in result) throw new Error(result.error)
    expect(result.existed).toBe(false)
    expect(result.capability.title).toBe('Bulk export')
    expect(result.capability.area).toBe('exports')
    expect(result.capability.originWorkItemId).toBe('wi-feat')
    expect(result.capability.originCodePlanId).toBe(F.planCompleted)
    expect(result.capability.originReleaseId).toBe(release.id)
    expect(result.capability.originSummary).toBe('WI: Bulk export · Plan: Completed Plan · API v2 (v2.0.0)')
  })

  it('is idempotent per work item', async () => {
    await insertItem({ id: 'wi-feat', title: 'Bulk export' })
    const first = await graduateWorkItem('wi-feat')
    const second = await graduateWorkItem('wi-feat')
    if ('error' in first || 'error' in second) throw new Error('graduation failed')
    expect(second.existed).toBe(true)
    expect(second.capability.id).toBe(first.capability.id)
  })

  it('graduates unplanned items with work-item-only lineage', async () => {
    await insertItem({ id: 'wi-solo', title: 'Dark mode', type: 'enhancement' })
    const result = await graduateWorkItem('wi-solo')
    if ('error' in result) throw new Error(result.error)
    expect(result.capability.originSummary).toBe('WI: Dark mode')
    expect(result.capability.originCodePlanId).toBeNull()
    expect(result.capability.originReleaseId).toBeNull()
  })
})

describe('getAssetRecord', () => {
  it('composes capabilities, derived registers, and graduation candidates', async () => {
    await insertItem({ id: 'wi-feat', title: 'Bulk export' })
    await insertItem({ id: 'wi-cand', title: 'Webhooks', type: 'enhancement' })
    await insertItem({ id: 'wi-bug', title: 'Crash on save', type: 'bug', status: 'open', severity: 'critical' })
    await insertItem({ id: 'wi-debt', title: 'Retry spaghetti', type: 'tech_debt', status: 'open', severity: 'high' })
    await insertItem({ id: 'wi-closed-bug', title: 'Old bug', type: 'bug', status: 'resolved' })
    await graduateWorkItem('wi-feat')

    const record = await getAssetRecord(F.assetApi, F.alice)
    expect(record).toBeTruthy()
    expect(record!.capabilities.map((c) => c.title)).toEqual(['Bulk export'])
    expect(record!.knownIssues.map((i) => i.id)).toEqual(['wi-bug'])
    expect(record!.debt.map((i) => i.id)).toEqual(['wi-debt'])
    // Graduated item is no longer a candidate; the resolved bug never is.
    expect(record!.candidates.map((c) => c.workItemId)).toEqual(['wi-cand'])
  })

  it('enforces org-scope access', async () => {
    expect(await getAssetRecord(F.assetApi, F.carol)).toBeNull()
    expect(await getAssetRecord('nope', F.alice)).toBeNull()
  })
})

describe('capability editing and tombstones', () => {
  it('updateCapability edits the claim without touching lineage', async () => {
    await insertItem({ id: 'wi-feat', title: 'Bulk export' })
    const result = await graduateWorkItem('wi-feat')
    if ('error' in result) throw new Error(result.error)

    const updated = await updateCapability(result.capability.id, { title: 'Bulk data export', area: 'exports' })
    expect(updated!.title).toBe('Bulk data export')
    expect(updated!.originWorkItemId).toBe('wi-feat')
    expect(updated!.originSummary).toBe('WI: Bulk export')
  })

  it('removeCapability tombstones with a reason instead of deleting', async () => {
    await insertItem({ id: 'wi-feat', title: 'Bulk export', description: 'CSV export' })
    const result = await graduateWorkItem('wi-feat')
    if ('error' in result) throw new Error(result.error)

    const removed = await removeCapability(result.capability.id, 'Replaced by the streaming pipeline')
    expect(removed!.status).toBe('removed')
    expect(removed!.removedAt).toBeInstanceOf(Date)
    expect(removed!.description).toBe('CSV export\n\n**Removed:** Replaced by the streaming pipeline')

    const record = await getAssetRecord(F.assetApi, F.alice)
    expect(record!.capabilities).toHaveLength(1)
    expect(record!.capabilities[0].status).toBe('removed')
    // A tombstoned item does not reappear as a graduation candidate.
    expect(record!.candidates).toHaveLength(0)
  })
})
