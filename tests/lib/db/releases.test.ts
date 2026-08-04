import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { getReleases, getRelease, getSuggestedReleaseAssets } from '@/lib/db/queries'
import {
  createRelease,
  updateRelease,
  deleteRelease,
  attachPlanToRelease,
  detachPlanFromRelease,
  setReleaseAsset,
  removeReleaseAsset,
} from '@/lib/db/mutations'
import { db } from '@/lib/db/index'
import { codePlans, workItems, workItemCodePlans } from '@/lib/db/schema.sqlite'
import { eq } from 'drizzle-orm'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

async function seedRelease() {
  const release = await createRelease(
    { productId: F.productShared, name: 'API v2.0.0', description: 'Big one', tags: ['q3'] },
    F.alice,
  )
  await attachPlanToRelease(F.planActive, release.id)
  await attachPlanToRelease(F.planCompleted, release.id)
  return release
}

describe('releases mutations', () => {
  it('creates a planned release and stamps asset versions via upsert', async () => {
    const release = await seedRelease()
    expect(release.status).toBe('planned')

    await setReleaseAsset(release.id, F.assetApi, { version: 'v2.0.0' })
    await setReleaseAsset(release.id, F.assetApi, { version: 'v2.0.1', notes: 'hotfix rolled in' })

    const detail = await getRelease(release.id, F.alice)
    expect(detail!.assets).toHaveLength(1)
    expect(detail!.assets[0].version).toBe('v2.0.1')
    expect(detail!.assets[0].notes).toBe('hotfix rolled in')
  })

  it('sets shippedAt when shipping and clears it on reopen', async () => {
    const release = await seedRelease()
    const shipped = await updateRelease(release.id, { status: 'shipped' })
    expect(shipped!.shippedAt).toBeInstanceOf(Date)
    const reopened = await updateRelease(release.id, { status: 'in_progress' })
    expect(reopened!.shippedAt).toBeNull()
  })

  it('detaches plans (never deletes) when the release is deleted', async () => {
    const release = await seedRelease()
    await deleteRelease(release.id)
    const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, F.planActive) })
    expect(plan).toBeTruthy()
    expect(plan!.releaseId).toBeNull()
  })

  it('detachPlanFromRelease clears only that plan', async () => {
    const release = await seedRelease()
    await detachPlanFromRelease(F.planActive)
    const detail = await getRelease(release.id, F.alice)
    expect(detail!.plans.map((p) => p.planId)).toEqual([F.planCompleted])
  })

  it('removeReleaseAsset drops the version stamp', async () => {
    const release = await seedRelease()
    await setReleaseAsset(release.id, F.assetDb, { version: '1.1' })
    await removeReleaseAsset(release.id, F.assetDb)
    const detail = await getRelease(release.id, F.alice)
    expect(detail!.assets).toHaveLength(0)
  })
})

describe('getReleases / getRelease', () => {
  it('rolls up plan counts and derived work items through attached plans', async () => {
    const release = await seedRelease()
    await (db as any).insert(workItems).values([
      {
        id: 'wi-feat',
        productId: F.productShared,
        type: 'feature',
        title: 'Bulk export',
        status: 'resolved',
        severity: 'medium',
        tags: [],
      },
      {
        id: 'wi-debt',
        productId: F.productShared,
        assetId: F.assetApi,
        type: 'tech_debt',
        title: 'Retry logic',
        status: 'open',
        severity: 'high',
        tags: [],
      },
    ])
    await (db as any).insert(workItemCodePlans).values([
      { workItemId: 'wi-feat', codePlanId: F.planActive },
      // Linked to both plans in the same release — must count once.
      { workItemId: 'wi-debt', codePlanId: F.planActive },
      { workItemId: 'wi-debt', codePlanId: F.planCompleted },
    ])

    const rows = await getReleases(F.alice)
    expect(rows).toHaveLength(1)
    expect(rows[0].planCount).toBe(2)
    expect(rows[0].workItemCounts).toEqual({ feature: 1, tech_debt: 1 })

    const detail = await getRelease(release.id, F.alice)
    expect(detail!.workItems).toHaveLength(2)
    expect(detail!.plans.find((p) => p.planId === F.planActive)!.taskCount).toBe(3)
  })

  it('filters by product and status', async () => {
    const release = await seedRelease()
    await updateRelease(release.id, { status: 'shipped' })
    expect(await getReleases(F.alice, { status: 'shipped' })).toHaveLength(1)
    expect(await getReleases(F.alice, { status: 'planned' })).toHaveLength(0)
    expect(await getReleases(F.alice, { productId: F.productCarol })).toHaveLength(0)
  })

  it('enforces org-scope access', async () => {
    const release = await seedRelease()
    expect(await getReleases(F.carol)).toHaveLength(0)
    expect(await getRelease(release.id, F.carol)).toBeNull()
  })

  it('suggests assets targeted by attached plans but missing from the release', async () => {
    const release = await seedRelease()
    // planActive targets assetApi in the shared fixtures; nothing on the release yet.
    let suggestions = await getSuggestedReleaseAssets(release.id)
    expect(suggestions.map((s) => s.assetId)).toEqual([F.assetApi])
    await setReleaseAsset(release.id, F.assetApi, {})
    suggestions = await getSuggestedReleaseAssets(release.id)
    expect(suggestions).toHaveLength(0)
  })
})
