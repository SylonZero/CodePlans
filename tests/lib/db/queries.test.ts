import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import {
  getDashboardStats,
  getProducts,
  getProduct,
  getCodePlans,
  getCodePlan,
  getTasks,
  getOrganization,
  getTeamMembers,
} from '@/lib/db/queries'

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
// getDashboardStats
// ---------------------------------------------------------------------------

describe('getDashboardStats', () => {
  it('returns zero stats for user with no products', async () => {
    // carol has a product but no assets/plans/tasks
    const stats = await getDashboardStats(F.carol)
    expect(stats.totalProducts).toBe(1)
    expect(stats.totalAssets).toBe(0)
    expect(stats.activePlans).toBe(0)
    expect(stats.completedPlans).toBe(0)
    expect(stats.totalTasks).toBe(0)
    expect(stats.completedTasks).toBe(0)
    expect(stats.tasksThisWeek).toBe(0)
    expect(stats.velocity).toBe(0)
  })

  it('counts assets and plans correctly for org user', async () => {
    const stats = await getDashboardStats(F.alice)
    expect(stats.totalProducts).toBe(1)   // productShared
    expect(stats.totalAssets).toBe(2)     // assetApi + assetDb
    expect(stats.activePlans).toBe(1)     // planActive
    expect(stats.completedPlans).toBe(1)  // planCompleted
  })

  it('counts tasks correctly', async () => {
    const stats = await getDashboardStats(F.alice)
    expect(stats.totalTasks).toBe(4)      // task1–4
    expect(stats.completedTasks).toBe(2)  // task3 + task4
  })

  it('only counts done tasks from the last 7 days as tasksThisWeek', async () => {
    const stats = await getDashboardStats(F.alice)
    // task3 is done+recent, task4 is done+14d old → only task3 counts
    expect(stats.tasksThisWeek).toBe(1)
    expect(stats.velocity).toBe(1)
  })

  it('org member (bob) sees same org stats as owner (alice)', async () => {
    const aliceStats = await getDashboardStats(F.alice)
    const bobStats = await getDashboardStats(F.bob)
    expect(bobStats.totalProducts).toBe(aliceStats.totalProducts)
    expect(bobStats.totalAssets).toBe(aliceStats.totalAssets)
    expect(bobStats.activePlans).toBe(aliceStats.activePlans)
  })

  it('returns all-zero object when user has no products at all', async () => {
    // Insert a brand new user with no products
    const { db } = await import('@/lib/db/index')
    const schema = await import('@/lib/db/schema.sqlite')
    await (db as any).insert(schema.users).values({
      id: 'empty-user',
      email: 'empty@test.local',
      name: 'Empty',
      billingTier: 'free',
      role: 'viewer',
      organizationId: null,
      featureFlags: {},
    })
    const stats = await getDashboardStats('empty-user')
    expect(stats).toEqual({
      totalProducts: 0,
      totalAssets: 0,
      activePlans: 0,
      completedPlans: 0,
      totalTasks: 0,
      completedTasks: 0,
      tasksThisWeek: 0,
      velocity: 0,
    })
  })
})

// ---------------------------------------------------------------------------
// getProducts
// ---------------------------------------------------------------------------

describe('getProducts', () => {
  it('returns only org products for an org member', async () => {
    const prods = await getProducts(F.alice)
    expect(prods).toHaveLength(1)
    expect(prods[0].id).toBe(F.productShared)
  })

  it('bob (org member) sees the same org product', async () => {
    const prods = await getProducts(F.bob)
    expect(prods).toHaveLength(1)
    expect(prods[0].id).toBe(F.productShared)
  })

  it('carol sees only her own product', async () => {
    const prods = await getProducts(F.carol)
    expect(prods).toHaveLength(1)
    expect(prods[0].id).toBe(F.productCarol)
  })

  it('populates assetCount and activePlanCount', async () => {
    const prods = await getProducts(F.alice)
    expect(prods[0].assetCount).toBe(2)
    expect(prods[0].activePlanCount).toBe(1)
  })

  it('createdAt is an ISO string', async () => {
    const prods = await getProducts(F.alice)
    expect(() => new Date(prods[0].createdAt)).not.toThrow()
    expect(prods[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ---------------------------------------------------------------------------
// getProduct
// ---------------------------------------------------------------------------

describe('getProduct', () => {
  it('returns product with assets', async () => {
    const prod = await getProduct('shared-product', F.alice)
    expect(prod).not.toBeNull()
    expect(prod!.id).toBe(F.productShared)
    expect(prod!.assets).toHaveLength(2)
  })

  it('returns null for non-existent slug', async () => {
    const prod = await getProduct('does-not-exist', F.alice)
    expect(prod).toBeNull()
  })

  it('returns null when user has no access to product', async () => {
    // carol tries to access alice's org product
    const prod = await getProduct('shared-product', F.carol)
    expect(prod).toBeNull()
  })

  it('asset fields are mapped correctly', async () => {
    const prod = await getProduct('shared-product', F.alice)
    const api = prod!.assets.find((a) => a.id === F.assetApi)
    expect(api).toBeDefined()
    expect(api!.name).toBe('API Service')
    expect(api!.type).toBe('service')
    expect(api!.health).toBe('healthy')
    expect(api!.dependencies).toEqual([])  // resolved separately
  })

  it('activePlanCount reflects plan count', async () => {
    const prod = await getProduct('shared-product', F.alice)
    expect(prod!.activePlanCount).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// getCodePlans
// ---------------------------------------------------------------------------

describe('getCodePlans', () => {
  it('returns all accessible plans', async () => {
    const plans = await getCodePlans(F.alice)
    expect(plans).toHaveLength(3)  // planActive + planDraft + planCompleted
  })

  it('carol has no plans', async () => {
    const plans = await getCodePlans(F.carol)
    expect(plans).toHaveLength(0)
  })

  it('filters by status', async () => {
    const active = await getCodePlans(F.alice, { status: 'active' })
    expect(active).toHaveLength(1)
    expect(active[0].id).toBe(F.planActive)

    const draft = await getCodePlans(F.alice, { status: 'draft' })
    expect(draft).toHaveLength(1)
    expect(draft[0].id).toBe(F.planDraft)
  })

  it('filters by type', async () => {
    const features = await getCodePlans(F.alice, { type: 'feature' })
    expect(features).toHaveLength(1)
    expect(features[0].id).toBe(F.planActive)
  })

  it('filters by productId', async () => {
    const plans = await getCodePlans(F.alice, { productId: F.productShared })
    expect(plans).toHaveLength(3)
  })

  it('computes taskCount and completedTaskCount', async () => {
    const plans = await getCodePlans(F.alice)
    const active = plans.find((p) => p.id === F.planActive)!
    expect(active.taskCount).toBe(3)        // task1, task2, task3
    expect(active.completedTaskCount).toBe(1)  // task3
    expect(active.progress).toBe(33)        // 1/3 ≈ 33%
  })

  it('includes productName', async () => {
    const plans = await getCodePlans(F.alice)
    expect(plans[0].productName).toBe('Shared Product')
  })
})

// ---------------------------------------------------------------------------
// getCodePlan
// ---------------------------------------------------------------------------

describe('getCodePlan', () => {
  it('returns plan with tasks, assignees, and target assets', async () => {
    const plan = await getCodePlan(F.planActive, F.alice)
    expect(plan).not.toBeNull()
    expect(plan!.tasks).toHaveLength(3)
    expect(plan!.assignees).toHaveLength(1)
    expect(plan!.assignees[0].id).toBe(F.bob)
    expect(plan!.targetAssets).toHaveLength(1)
    expect(plan!.targetAssets[0].id).toBe(F.assetApi)
  })

  it('returns null for unknown id', async () => {
    const plan = await getCodePlan('nonexistent-id', F.alice)
    expect(plan).toBeNull()
  })

  it('computes progress correctly', async () => {
    const plan = await getCodePlan(F.planActive, F.alice)
    // 1 done out of 3 = 33%
    expect(plan!.progress).toBe(33)
    expect(plan!.taskCount).toBe(3)
    expect(plan!.completedTaskCount).toBe(1)
  })

  it('returns empty assignees and assets when none set', async () => {
    const plan = await getCodePlan(F.planDraft, F.alice)
    expect(plan!.assignees).toEqual([])
    expect(plan!.targetAssets).toEqual([])
  })

  it('denies access to plans outside the user scope', async () => {
    // carol is not in the org and did not create the shared product
    const plan = await getCodePlan(F.planActive, F.carol)
    expect(plan).toBeNull()
  })

  it('exposes per-asset plan rows (planAssets)', async () => {
    const plan = await getCodePlan(F.planActive, F.alice)
    expect(plan!.planAssets).toHaveLength(1)
    expect(plan!.planAssets[0].assetId).toBe(F.assetApi)
    expect(plan!.planAssets[0].assetName).toBe('API Service')
    expect(plan!.planAssets[0].prStatus).toBe('none')
  })

  it('task fields are mapped correctly', async () => {
    const plan = await getCodePlan(F.planActive, F.alice)
    const t1 = plan!.tasks.find((t) => t.id === F.task1)!
    expect(t1.status).toBe('not_started')
    expect(t1.priority).toBe('high')
    expect(t1.assigneeId).toBe(F.bob)
    expect(t1.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ---------------------------------------------------------------------------
// getTasks
// ---------------------------------------------------------------------------

describe('getTasks', () => {
  it('returns all tasks for an org member', async () => {
    const taskList = await getTasks(F.alice)
    expect(taskList).toHaveLength(4)
  })

  it('carol has no tasks', async () => {
    const taskList = await getTasks(F.carol)
    expect(taskList).toHaveLength(0)
  })

  it('filters by status', async () => {
    const done = await getTasks(F.alice, { status: 'done' })
    expect(done).toHaveLength(2)
    expect(done.every((t) => t.status === 'done')).toBe(true)

    const inProg = await getTasks(F.alice, { status: 'in_progress' })
    expect(inProg).toHaveLength(1)
    expect(inProg[0].id).toBe(F.task2)
  })

  it('filters by planId', async () => {
    const activeTasks = await getTasks(F.alice, { planId: F.planActive })
    expect(activeTasks).toHaveLength(3)

    const completedTasks = await getTasks(F.alice, { planId: F.planCompleted })
    expect(completedTasks).toHaveLength(1)
    expect(completedTasks[0].id).toBe(F.task4)
  })

  it('filters by assigneeId', async () => {
    const bobTasks = await getTasks(F.alice, { assigneeId: F.bob })
    expect(bobTasks).toHaveLength(1)
    expect(bobTasks[0].id).toBe(F.task1)
  })

  it('includes planTitle, assetName, and assigneeName', async () => {
    const taskList = await getTasks(F.alice)
    const t1 = taskList.find((t) => t.id === F.task1)!
    expect(t1.planTitle).toBe('Active Plan')
    expect(t1.assigneeName).toBe('Bob')
    expect(t1.assetName).toBeNull()  // task1 has no assetId
  })
})

// ---------------------------------------------------------------------------
// getOrganization
// ---------------------------------------------------------------------------

describe('getOrganization', () => {
  it('returns org with memberCount', async () => {
    const org = await getOrganization(F.org)
    expect(org).not.toBeNull()
    expect(org!.id).toBe(F.org)
    expect(org!.name).toBe('Acme Inc')
    expect(org!.slug).toBe('acme-inc')
    expect(org!.memberCount).toBe(2)  // alice + bob (both have joinedAt)
  })

  it('returns null for unknown id', async () => {
    const org = await getOrganization('nonexistent-org')
    expect(org).toBeNull()
  })

  it('createdAt is an ISO string', async () => {
    const org = await getOrganization(F.org)
    expect(org!.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })
})

// ---------------------------------------------------------------------------
// getTeamMembers
// ---------------------------------------------------------------------------

describe('getTeamMembers', () => {
  it('returns members with joinedAt set', async () => {
    const members = await getTeamMembers(F.org)
    expect(members).toHaveLength(2)
  })

  it('includes user details', async () => {
    const members = await getTeamMembers(F.org)
    const alice = members.find((m) => m.userId === F.alice)!
    expect(alice.role).toBe('owner')
    expect(alice.user.email).toBe('alice@test.local')
    expect(alice.user.name).toBe('Alice')
  })

  it('joinedAt is an ISO string', async () => {
    const members = await getTeamMembers(F.org)
    expect(members[0].joinedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('returns empty array for org with no members', async () => {
    // Insert a new org with no members
    const { db } = await import('@/lib/db/index')
    const schema = await import('@/lib/db/schema.sqlite')
    await (db as any).insert(schema.organizations).values({
      id: 'empty-org',
      name: 'Empty Org',
      slug: 'empty-org',
      ownerId: F.carol,
      billingTier: 'free',
      productLimit: 1,
    })
    const members = await getTeamMembers('empty-org')
    expect(members).toEqual([])
  })
})
