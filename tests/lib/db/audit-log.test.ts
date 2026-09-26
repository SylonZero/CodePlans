import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db/index'
import { syncLog } from '@/lib/db/schema.sqlite'
import { eq } from 'drizzle-orm'
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createTask,
  updateTask,
  deleteTask,
  deleteWorkItem,
  deleteCodePlan,
  createRelease,
  deleteRelease,
  createWorkItem,
} from '@/lib/db/mutations'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

async function auditRowsFor(entityId: string) {
  return db.query.syncLog.findMany({ where: eq(syncLog.entityId, entityId) })
}

describe('logAudit (via mutations)', () => {
  it('records a "created" event with the org resolved from the actor', async () => {
    const product = await createProduct(
      { name: 'Audited Product', slug: 'audited-product', description: '', tags: [] },
      F.alice,
    )
    const rows = await auditRowsFor(product.id)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entityType: 'product',
      event: 'created',
      actorId: F.alice,
      organizationId: F.org,
    })
  })

  it('records an "updated" event on update', async () => {
    const product = await createProduct(
      { name: 'P', slug: 'p-update', description: '', tags: [] },
      F.alice,
    )
    await updateProduct(product.id, { name: 'P renamed' }, F.alice)
    const rows = await auditRowsFor(product.id)
    expect(rows.map((r) => r.event)).toEqual(['created', 'updated'])
  })

  it('records a "deleted" event on delete — the acute gap this initiative closes', async () => {
    const product = await createProduct(
      { name: 'P', slug: 'p-delete', description: '', tags: [] },
      F.alice,
    )
    await deleteProduct(product.id, { id: F.alice })
    const rows = await auditRowsFor(product.id)
    expect(rows.map((r) => r.event)).toEqual(['created', 'deleted'])
  })

  it('deleteTask logs even though the UI action never did before this initiative', async () => {
    await deleteTask(F.task1, { id: F.alice, kind: 'user' })
    const rows = await auditRowsFor(F.task1)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entityType: 'task', event: 'deleted', actorId: F.alice })
  })

  it('deleteCodePlan logs (creator-only mutation, still audited)', async () => {
    await deleteCodePlan(F.planDraft, F.alice)
    const rows = await auditRowsFor(F.planDraft)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entityType: 'code_plan', event: 'deleted', actorId: F.alice })
  })

  it('deleteWorkItem logs deletion (previously the only entity that did, now centralized)', async () => {
    const item = await createWorkItem(
      { productId: F.productShared, type: 'bug', title: 'Boom', description: '', severity: 'high', tags: [] },
      F.alice,
    )
    await deleteWorkItem(item.id, { id: F.alice, kind: 'user' })
    const rows = await auditRowsFor(item.id)
    expect(rows.map((r) => r.event)).toEqual(['created', 'deleted'])
  })

  it('createRelease/deleteRelease both log, scoped to the release id', async () => {
    const release = await createRelease({ productId: F.productShared, name: 'v1' }, F.alice)
    await deleteRelease(release.id, { id: F.alice, kind: 'user' })
    const rows = await auditRowsFor(release.id)
    expect(rows.map((r) => r.event)).toEqual(['created', 'deleted'])
  })

  it('no-ops silently (no row, no throw) when no actor is given', async () => {
    await expect(deleteTask(F.task2)).resolves.toBeTruthy()
    const rows = await auditRowsFor(F.task2)
    expect(rows).toHaveLength(0)
  })

  it('no-ops silently when the actor has no resolvable organization', async () => {
    // Carol's product has no organizationId — logAudit can't resolve an org to scope the row to.
    const product = await createProduct(
      { name: 'Solo', slug: 'solo-product-audit', description: '', tags: [] },
      F.carol,
    )
    const rows = await auditRowsFor(product.id)
    expect(rows).toHaveLength(0)
  })
})

describe('attribution stamping (via mutations)', () => {
  it('stamps createdById/createdByKind on task creation', async () => {
    const task = await createTask(
      { codePlanId: F.planActive, title: 'Attributed task', description: '', priority: 'medium', tags: [] },
      { id: F.bob, kind: 'user' },
    )
    expect(task.createdById).toBe(F.bob)
    expect(task.createdByKind).toBe('user')
  })

  it('stamps updatedById/updatedByKind on task update, independent of createdBy', async () => {
    const task = await createTask(
      { codePlanId: F.planActive, title: 'Two actors', description: '', priority: 'medium', tags: [] },
      { id: F.alice, kind: 'user' },
    )
    const updated = await updateTask(task.id, { priority: 'high' }, { id: F.bob, kind: 'agent' })
    expect(updated?.createdById).toBe(F.alice)
    expect(updated?.updatedById).toBe(F.bob)
    expect(updated?.updatedByKind).toBe('agent')
  })

  it('leaves attribution null when no actor is passed, rather than guessing from another field', async () => {
    const task = await createTask(
      { codePlanId: F.planActive, title: 'Unattributed', description: '', priority: 'low', tags: [] },
    )
    expect(task.createdById).toBeNull()
  })
})

describe('audit scope (product + org of the entity, not the actor)', () => {
  it('stamps productId and actorKind on product-scoped events', async () => {
    const item = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'Scoped', description: '', severity: 'low', tags: [] }, F.bob, 'agent')
    const [row] = await auditRowsFor(item.id)
    expect(row).toMatchObject({ productId: F.productShared, organizationId: F.org, actorKind: 'agent' })
  })

  it('files events under the product\'s org even when the actor\'s current org differs', async () => {
    const { organizations, users } = await import('@/lib/db/schema.sqlite')
    await (db as any).insert(organizations).values({ id: 'org-other', name: 'Other', slug: 'other', ownerId: F.bob, billingTier: 'free', productLimit: 5 })
    await (db as any).update(users).set({ organizationId: 'org-other' }).where(eq(users.id, F.bob))
    const task = await createTask({ codePlanId: F.planActive, title: 'Cross-org task', description: '', priority: 'low', tags: [] }, { id: F.bob })
    const [row] = await auditRowsFor(task.id)
    expect(row).toMatchObject({ organizationId: F.org, productId: F.productShared })
  })

  it('keeps the product on delete events after the entity is gone', async () => {
    const item = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'Doomed', description: '', severity: 'low', tags: [] }, F.alice)
    await deleteWorkItem(item.id, { id: F.alice })
    const rows = await auditRowsFor(item.id)
    expect(rows.find((r) => r.event === 'deleted')).toMatchObject({ productId: F.productShared })
    await deleteTask(F.task1, { id: F.alice })
    expect((await auditRowsFor(F.task1))[0]).toMatchObject({ productId: F.productShared, event: 'deleted' })
  })

  it('falls back to the actor\'s org for solo products', async () => {
    await (db as any).update((await import('@/lib/db/schema.sqlite')).users).set({ organizationId: F.org }).where(eq((await import('@/lib/db/schema.sqlite')).users.id, F.carol))
    const release = await createRelease({ productId: F.productCarol, name: 'Solo 1.0', description: '', tags: [] }, F.carol)
    expect((await auditRowsFor(release.id))[0]).toMatchObject({ productId: F.productCarol, organizationId: F.org })
  })
})

describe('spec events in the activity stream', () => {
  it('records created, revised, activated, linked and superseded with the spec\'s product', async () => {
    const { createSpec, updateSpec, linkSpec, supersedeSpec } = await import('@/lib/db/specs')
    const spec = await createSpec({ productId: F.productShared, title: 'Checkout', body: 'v1', specType: 'feature' }, F.alice)
    await updateSpec(spec.id, { body: 'v2' }, F.alice)
    await updateSpec(spec.id, { status: 'active' }, F.alice)
    await updateSpec(spec.id, { area: 'checkout' }, F.alice)
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    const next = await supersedeSpec(spec.id, 'new approach', undefined, F.alice)
    const events = (await auditRowsFor(spec.id)).map((r) => [r.event, (r.payload as any).version])
    // Status and details changes are recorded but keep the version.
    expect(events).toEqual([['created', 1], ['revised', 2], ['activated', 2], ['details_changed', 2], ['linked', 2], ['superseded', 2]])
    const rows = await auditRowsFor(spec.id)
    expect(rows.every((r) => r.entityType === 'spec' && r.productId === F.productShared && r.organizationId === F.org)).toBe(true)
    expect((await auditRowsFor(next.id)).map((r) => r.event)).toEqual(['created'])
  })

  it('shows spec events in the feed and filters the feed by product', async () => {
    const { createSpec } = await import('@/lib/db/specs')
    const { getActivityFeed } = await import('@/lib/db/queries')
    await createSpec({ productId: F.productShared, title: 'Feed spec', body: '', specType: 'api' }, F.alice)
    const feed = await getActivityFeed(F.alice)
    expect(feed.find((a) => a.description === 'Feed spec')).toMatchObject({ type: 'spec_updated', title: 'created a spec' })
    expect(await getActivityFeed(F.alice, 15, { productId: 'product-nope' })).toEqual([])
    expect((await getActivityFeed(F.alice, 15, { productId: F.productShared })).length).toBeGreaterThan(0)
  })
})
