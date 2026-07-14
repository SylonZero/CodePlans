import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import {
  createProduct,
  updateProduct,
  deleteProduct,
  createAsset,
  updateAsset,
  deleteAsset,
  createCodePlan,
  updateCodePlan,
  deleteCodePlan,
  createTask,
  updateTask,
  updateTaskStatus,
  deleteTask,
} from '@/lib/db/mutations'
import { getCodePlan } from '@/lib/db/queries'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

describe('createProduct', () => {
  it('inserts a product and returns it', async () => {
    const product = await createProduct(
      {
        name: 'New Product',
        slug: 'new-product',
        description: 'Created in test',
        tags: ['api', 'v2'],
      },
      F.alice,
    )
    expect(product.id).toBeTruthy()
    expect(product.name).toBe('New Product')
    expect(product.slug).toBe('new-product')
    expect(product.creatorId).toBe(F.alice)
    expect(product.tags).toEqual(['api', 'v2'])
  })

  it('accepts optional organizationId', async () => {
    const product = await createProduct(
      {
        name: 'Org Product',
        slug: 'org-product-2',
        description: '',
        tags: [],
        organizationId: F.org,
      },
      F.alice,
    )
    expect(product.organizationId).toBe(F.org)
  })
})

describe('updateProduct', () => {
  it('updates fields and returns the updated product', async () => {
    const updated = await updateProduct(
      F.productShared,
      { name: 'Renamed Product', tags: ['updated'] },
      F.alice,
    )
    expect(updated).not.toBeNull()
    expect(updated!.name).toBe('Renamed Product')
    expect(updated!.tags).toEqual(['updated'])
    expect(updated!.slug).toBe('shared-product')  // unchanged
  })

  it('returns null when userId is not the creator', async () => {
    const result = await updateProduct(F.productShared, { name: 'Hacked' }, F.carol)
    expect(result).toBeNull()
  })

  it('returns null for non-existent product', async () => {
    const result = await updateProduct('nonexistent', { name: 'X' }, F.alice)
    expect(result).toBeNull()
  })
})

describe('deleteProduct', () => {
  it('deletes the product and returns its id', async () => {
    const result = await deleteProduct(F.productCarol, F.carol)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(F.productCarol)
  })

  it('returns null when userId is not the creator', async () => {
    const result = await deleteProduct(F.productShared, F.carol)
    expect(result).toBeNull()
  })

  it('returns null for non-existent product', async () => {
    const result = await deleteProduct('nonexistent', F.alice)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

describe('createAsset', () => {
  it('inserts an asset and returns it', async () => {
    const asset = await createAsset({
      productId: F.productShared,
      name: 'New Service',
      type: 'app',
      description: 'A new app',
      tags: ['frontend'],
    })
    expect(asset.id).toBeTruthy()
    expect(asset.name).toBe('New Service')
    expect(asset.type).toBe('app')
    expect(asset.productId).toBe(F.productShared)
    expect(asset.health).toBe('healthy')  // default
  })
})

describe('updateAsset', () => {
  it('updates asset fields and bumps updatedAt', async () => {
    // SQLite stores timestamps in seconds; floor before to nearest second for comparison
    const before = Math.floor(Date.now() / 1000) * 1000
    const updated = await updateAsset(F.assetApi, {
      health: 'critical',
      techDebtScore: 75,
      name: 'Renamed API',
    })
    expect(updated).not.toBeNull()
    expect(updated!.health).toBe('critical')
    expect(updated!.techDebtScore).toBe(75)
    expect(updated!.name).toBe('Renamed API')
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('returns null for non-existent asset', async () => {
    const result = await updateAsset('nonexistent', { name: 'X' })
    expect(result).toBeNull()
  })
})

describe('deleteAsset', () => {
  it('deletes the asset and returns its id', async () => {
    const result = await deleteAsset(F.assetDb)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(F.assetDb)
  })

  it('returns null for non-existent asset', async () => {
    const result = await deleteAsset('nonexistent')
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Code Plans
// ---------------------------------------------------------------------------

describe('createCodePlan', () => {
  it('inserts a plan with status=draft and returns it', async () => {
    const plan = await createCodePlan(
      {
        title: 'New Plan',
        description: 'Test plan',
        productId: F.productShared,
        type: 'improvement',
        tags: ['perf'],
        targetAssetIds: [F.assetApi],
      },
      F.alice,
    )
    expect(plan.id).toBeTruthy()
    expect(plan.title).toBe('New Plan')
    expect(plan.status).toBe('draft')
    expect(plan.creatorId).toBe(F.alice)

    // Target assets live in the join table (array column dropped in v0.3.0).
    // Assignees aren't a stored link at all — a fresh plan with no tasks has none.
    const detail = await getCodePlan(plan.id, F.alice)
    expect(detail!.targetAssetIds).toEqual([F.assetApi])
    expect(detail!.assignees).toEqual([])
  })
})

describe('updateCodePlan', () => {
  it('updates plan status and returns updated plan', async () => {
    const updated = await updateCodePlan(F.planDraft, { status: 'active' })
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('active')
  })

  it('updates multiple fields at once', async () => {
    const updated = await updateCodePlan(F.planActive, {
      title: 'Renamed Plan',
      tags: ['new-tag'],
    })
    expect(updated!.title).toBe('Renamed Plan')
    expect(updated!.tags).toEqual(['new-tag'])
  })

  it('returns null for non-existent plan', async () => {
    const result = await updateCodePlan('nonexistent', { status: 'active' })
    expect(result).toBeNull()
  })
})

describe('plan assignees (derived from task assignment)', () => {
  it('reflects the unique set of assignees across the plan\'s tasks', async () => {
    // Fixture: planActive already has task1 assigned to bob.
    let detail = await getCodePlan(F.planActive, F.alice)
    expect(detail!.assignees.map((a) => a.id)).toEqual([F.bob])

    // Assigning task2 to carol adds her to the derived set.
    await updateTask(F.task2, { assigneeId: F.carol })
    detail = await getCodePlan(F.planActive, F.alice)
    expect(detail!.assignees.map((a) => a.id).sort()).toEqual([F.bob, F.carol].sort())

    // Unassigning task1 removes bob once no task in the plan points to him.
    await updateTask(F.task1, { assigneeId: null })
    detail = await getCodePlan(F.planActive, F.alice)
    expect(detail!.assignees.map((a) => a.id)).toEqual([F.carol])
  })

  it('a plan with no tasks has no assignees', async () => {
    const detail = await getCodePlan(F.planDraft, F.alice)
    expect(detail!.assignees).toEqual([])
  })
})

describe('deleteCodePlan', () => {
  it('deletes plan when userId is creator', async () => {
    const result = await deleteCodePlan(F.planDraft, F.alice)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(F.planDraft)
  })

  it('returns null when userId is not the creator', async () => {
    const result = await deleteCodePlan(F.planActive, F.bob)
    expect(result).toBeNull()
  })

  it('returns null for non-existent plan', async () => {
    const result = await deleteCodePlan('nonexistent', F.alice)
    expect(result).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

describe('createTask', () => {
  it('inserts a task with status=not_started and returns it', async () => {
    const task = await createTask({
      codePlanId: F.planActive,
      title: 'New Task',
      description: 'A new task',
      priority: 'critical',
      tags: ['urgent'],
    })
    expect(task.id).toBeTruthy()
    expect(task.title).toBe('New Task')
    expect(task.status).toBe('not_started')
    expect(task.priority).toBe('critical')
    expect(task.codePlanId).toBe(F.planActive)
  })

  it('accepts optional assigneeId and estimatedEffort', async () => {
    const task = await createTask({
      codePlanId: F.planActive,
      title: 'Assigned Task',
      description: '',
      priority: 'medium',
      tags: [],
      assigneeId: F.bob,
      estimatedEffort: 3,
    })
    expect(task.assigneeId).toBe(F.bob)
    expect(task.estimatedEffort).toBe(3)
  })
})

describe('updateTask', () => {
  it('updates task fields and bumps updatedAt', async () => {
    // SQLite stores timestamps in seconds; floor before to nearest second for comparison
    const before = Math.floor(Date.now() / 1000) * 1000
    const updated = await updateTask(F.task1, {
      title: 'Renamed Task',
      priority: 'low',
      estimatedEffort: 5,
    })
    expect(updated).not.toBeNull()
    expect(updated!.title).toBe('Renamed Task')
    expect(updated!.priority).toBe('low')
    expect(updated!.estimatedEffort).toBe(5)
    expect(updated!.updatedAt.getTime()).toBeGreaterThanOrEqual(before)
  })

  it('can update status', async () => {
    const updated = await updateTask(F.task1, { status: 'in_progress' })
    expect(updated!.status).toBe('in_progress')
  })

  it('returns null for non-existent task', async () => {
    const result = await updateTask('nonexistent', { title: 'X' })
    expect(result).toBeNull()
  })
})

describe('updateTaskStatus', () => {
  it('updates status to done', async () => {
    const updated = await updateTaskStatus(F.task2, 'done')
    expect(updated).not.toBeNull()
    expect(updated!.status).toBe('done')
  })

  it('updates status to not_started', async () => {
    const updated = await updateTaskStatus(F.task3, 'not_started')
    expect(updated!.status).toBe('not_started')
  })

  it('returns null for non-existent task', async () => {
    const result = await updateTaskStatus('nonexistent', 'done')
    expect(result).toBeNull()
  })
})

describe('deleteTask', () => {
  it('deletes the task and returns its id', async () => {
    const result = await deleteTask(F.task1)
    expect(result).not.toBeNull()
    expect(result!.id).toBe(F.task1)
  })

  it('returns null for non-existent task', async () => {
    const result = await deleteTask('nonexistent')
    expect(result).toBeNull()
  })
})
