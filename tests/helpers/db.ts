import { migrate } from 'drizzle-orm/libsql/migrator'
import { eq, inArray } from 'drizzle-orm'
import path from 'path'
import { db } from '@/lib/db/index'
import {
  users,
  organizations,
  organizationMembers,
  integrations,
  products,
  assets,
  codePlans,
  codePlanAssets,
  codePlanAssignees,
  workItems,
  workItemCodePlans,
  tasks,
  syncLog,
} from '@/lib/db/schema.sqlite'

const MIGRATIONS_PATH = path.join(process.cwd(), 'lib/db/migrations/sqlite')

export async function runMigrations() {
  await migrate(db as any, { migrationsFolder: MIGRATIONS_PATH })
}

export async function clearTables() {
  const d = db as any
  // Delete children before parents to respect FK order
  await d.delete(syncLog)
  await d.delete(workItemCodePlans)
  await d.delete(workItems)
  await d.delete(codePlanAssets)
  await d.delete(codePlanAssignees)
  await d.delete(tasks)
  await d.delete(codePlans)
  await d.delete(assets)
  await d.delete(integrations)
  await d.delete(products)
  await d.delete(organizationMembers)
  await d.delete(organizations)
  await d.delete(users)
}

// ---------------------------------------------------------------------------
// Fixture IDs — stable references for assertions
// ---------------------------------------------------------------------------

export const F = {
  alice: 'user-alice',
  bob: 'user-bob',
  carol: 'user-carol',
  org: 'org-acme',
  memberAlice: 'member-alice',
  memberBob: 'member-bob',
  productShared: 'product-shared',  // org product, created by alice
  productCarol: 'product-carol',    // solo product, created by carol
  assetApi: 'asset-api',            // service in productShared
  assetDb: 'asset-db',              // datastore in productShared
  planActive: 'plan-active',        // active, with 3 tasks
  planDraft: 'plan-draft',          // draft, no tasks
  planCompleted: 'plan-completed',  // completed, with 1 old done task
  task1: 'task-1',                  // not_started, assigned to bob
  task2: 'task-2',                  // in_progress
  task3: 'task-3',                  // done, updatedAt = now
  task4: 'task-4',                  // done, updatedAt = 14 days ago
} as const

// ---------------------------------------------------------------------------
// Fixture insertion
// ---------------------------------------------------------------------------

export async function seedFixtures() {
  const d = db as any
  const now = new Date()
  const oldDate = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)

  // 1. Insert users without organizationId first (circular dep: users↔org)
  await d.insert(users).values([
    {
      id: F.alice,
      email: 'alice@test.local',
      name: 'Alice',
      billingTier: 'free',
      role: 'owner',
      organizationId: null,
      featureFlags: {},
    },
    {
      id: F.bob,
      email: 'bob@test.local',
      name: 'Bob',
      billingTier: 'free',
      role: 'editor',
      organizationId: null,
      featureFlags: {},
    },
    {
      id: F.carol,
      email: 'carol@test.local',
      name: 'Carol',
      billingTier: 'free',
      role: 'viewer',
      organizationId: null,
      featureFlags: {},
    },
  ])

  // 2. Organization (references alice as owner)
  await d.insert(organizations).values({
    id: F.org,
    name: 'Acme Inc',
    slug: 'acme-inc',
    ownerId: F.alice,
    billingTier: 'free',
    productLimit: 5,
  })

  // 3. Wire alice and bob into the org
  await d
    .update(users)
    .set({ organizationId: F.org })
    .where(inArray(users.id, [F.alice, F.bob]))

  // 4. Org members (both have joinedAt set so they appear in getTeamMembers)
  await d.insert(organizationMembers).values([
    {
      id: F.memberAlice,
      organizationId: F.org,
      userId: F.alice,
      role: 'owner',
      joinedAt: now,
    },
    {
      id: F.memberBob,
      organizationId: F.org,
      userId: F.bob,
      role: 'editor',
      joinedAt: now,
    },
  ])

  // 5. Products
  await d.insert(products).values([
    {
      id: F.productShared,
      name: 'Shared Product',
      slug: 'shared-product',
      description: 'An org product',
      tags: [],
      organizationId: F.org,
      creatorId: F.alice,
    },
    {
      id: F.productCarol,
      name: 'Carol Product',
      slug: 'carol-product',
      description: 'A solo product',
      tags: [],
      organizationId: null,
      creatorId: F.carol,
    },
  ])

  // 6. Assets
  await d.insert(assets).values([
    {
      id: F.assetApi,
      productId: F.productShared,
      name: 'API Service',
      type: 'service',
      description: 'Main API',
      tags: [],
      health: 'healthy',
      status: 'active',
      metadata: {},
    },
    {
      id: F.assetDb,
      productId: F.productShared,
      name: 'Database',
      type: 'datastore',
      description: 'Main DB',
      tags: [],
      health: 'warning',
      status: 'active',
      metadata: {},
    },
  ])

  // 7. Code Plans
  await d.insert(codePlans).values([
    {
      id: F.planActive,
      title: 'Active Plan',
      description: 'An active plan',
      productId: F.productShared,
      type: 'feature',
      status: 'active',
      tags: [],
      creatorId: F.alice,
    },
    {
      id: F.planDraft,
      title: 'Draft Plan',
      description: 'A draft plan',
      productId: F.productShared,
      type: 'refactor',
      status: 'draft',
      tags: ['tech-debt'],
      creatorId: F.alice,
    },
    {
      id: F.planCompleted,
      title: 'Completed Plan',
      description: 'A completed plan',
      productId: F.productShared,
      type: 'bugfix',
      status: 'completed',
      tags: [],
      creatorId: F.alice,
    },
  ])

  // 7b. Plan↔asset and plan↔assignee join rows (source of truth; arrays kept in step 7
  //     to mirror the one-release rollback window)
  await d.insert(codePlanAssets).values([
    { codePlanId: F.planActive, assetId: F.assetApi },
  ])
  await d.insert(codePlanAssignees).values([
    { codePlanId: F.planActive, userId: F.bob },
  ])

  // 8. Tasks
  await d.insert(tasks).values([
    {
      id: F.task1,
      codePlanId: F.planActive,
      title: 'Task 1',
      description: 'Not started task',
      status: 'not_started',
      priority: 'high',
      tags: [],
      assigneeId: F.bob,
    },
    {
      id: F.task2,
      codePlanId: F.planActive,
      title: 'Task 2',
      description: 'In progress task',
      status: 'in_progress',
      priority: 'medium',
      tags: [],
    },
    {
      id: F.task3,
      codePlanId: F.planActive,
      title: 'Task 3',
      description: 'Done task, recent',
      status: 'done',
      priority: 'low',
      tags: [],
      updatedAt: now,
    },
    {
      id: F.task4,
      codePlanId: F.planCompleted,
      title: 'Task 4',
      description: 'Done task, old',
      status: 'done',
      priority: 'medium',
      tags: [],
      updatedAt: oldDate,
    },
  ])
}
