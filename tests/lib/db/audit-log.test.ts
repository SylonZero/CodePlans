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
