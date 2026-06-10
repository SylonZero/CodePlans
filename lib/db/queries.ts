import { db } from './index'
import { products, assets, codePlans, tasks, users, organizations, organizationMembers } from './schema'
import { eq, and, sql, desc, or, inArray, gte } from 'drizzle-orm'
import type {
  Product,
  Asset,
  CodePlan,
  Task,
  Organization,
  TeamMember,
  DashboardStats,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardStats(userId: string, productId?: string): Promise<DashboardStats> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  const orgId = user?.organizationId ?? null

  const productFilter = orgId
    ? or(eq(products.creatorId, userId), eq(products.organizationId, orgId))
    : eq(products.creatorId, userId)

  const [productIds] = await Promise.all([
    db.select({ id: products.id }).from(products).where(productFilter),
  ])
  let ids = productIds.map((p) => p.id)
  if (productId) ids = ids.filter((id) => id === productId)

  if (ids.length === 0) {
    return {
      totalProducts: 0,
      totalAssets: 0,
      activePlans: 0,
      completedPlans: 0,
      totalTasks: 0,
      completedTasks: 0,
      tasksThisWeek: 0,
      velocity: 0,
    }
  }

  const [
    assetCount,
    activePlanCount,
    completedPlanCount,
    totalTaskCount,
    completedTaskCount,
    weekTaskCount,
  ] = await Promise.all([
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(assets)
      .where(inArray(assets.productId, ids)),
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(codePlans)
      .where(
        and(
          inArray(codePlans.productId, ids),
          eq(codePlans.status, 'active')
        )
      ),
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(codePlans)
      .where(
        and(
          inArray(codePlans.productId, ids),
          eq(codePlans.status, 'completed')
        )
      ),
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(tasks)
      .innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
      .where(inArray(codePlans.productId, ids)),
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(tasks)
      .innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
      .where(
        and(
          inArray(codePlans.productId, ids),
          eq(tasks.status, 'done')
        )
      ),
    db
      .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
      .from(tasks)
      .innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
      .where(
        and(
          inArray(codePlans.productId, ids),
          eq(tasks.status, 'done'),
          gte(tasks.updatedAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        )
      ),
  ])

  const weekCount = weekTaskCount[0]?.count ?? 0

  return {
    totalProducts: ids.length,
    totalAssets: assetCount[0]?.count ?? 0,
    activePlans: activePlanCount[0]?.count ?? 0,
    completedPlans: completedPlanCount[0]?.count ?? 0,
    totalTasks: totalTaskCount[0]?.count ?? 0,
    completedTasks: completedTaskCount[0]?.count ?? 0,
    tasksThisWeek: weekCount,
    velocity: Math.round((weekCount / 1) * 10) / 10, // tasks per week (rolling 1 week)
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function getProducts(userId: string, productId?: string): Promise<Product[]> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  const orgId = user?.organizationId ?? null

  const accessFilter = orgId
    ? or(eq(products.creatorId, userId), eq(products.organizationId, orgId))
    : eq(products.creatorId, userId)

  const productFilter = productId ? and(accessFilter, eq(products.id, productId)) : accessFilter

  const rows = await db
    .select({
      id: products.id,
      name: products.name,
      slug: products.slug,
      description: products.description,
      tags: products.tags,
      organizationId: products.organizationId,
      creatorId: products.creatorId,
      createdAt: products.createdAt,
      assetCount: sql<number>`(
        select CAST(count(*) AS INTEGER) from assets where assets.product_id = products.id
      )`,
      activePlanCount: sql<number>`(
        select CAST(count(*) AS INTEGER) from code_plans
        where code_plans.product_id = products.id and code_plans.status = 'active'
      )`,
    })
    .from(products)
    .where(productFilter)
    .orderBy(desc(products.createdAt))

  return rows.map((r) => ({
    ...r,
    organizationId: r.organizationId ?? undefined,
    createdAt: r.createdAt.toISOString(),
    assetCount: r.assetCount,
    activePlanCount: r.activePlanCount,
  }))
}

export async function getProduct(slug: string, userId: string): Promise<(Product & { assets: Asset[] }) | null> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  const orgId = user?.organizationId ?? null

  const productFilter = orgId
    ? and(
        eq(products.slug, slug),
        or(eq(products.creatorId, userId), eq(products.organizationId, orgId))
      )
    : and(eq(products.slug, slug), eq(products.creatorId, userId))

  const product = await db.query.products.findFirst({ where: productFilter })
  if (!product) return null

  const productAssets = await db.query.assets.findMany({
    where: eq(assets.productId, product.id),
    orderBy: desc(assets.createdAt),
  })

  const [activePlanCount] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(codePlans)
    .where(and(eq(codePlans.productId, product.id), eq(codePlans.status, 'active')))

  return {
    id: product.id,
    name: product.name,
    slug: product.slug,
    description: product.description,
    tags: product.tags,
    organizationId: product.organizationId ?? undefined,
    creatorId: product.creatorId,
    assetCount: productAssets.length,
    activePlanCount: activePlanCount?.count ?? 0,
    createdAt: product.createdAt.toISOString(),
    assets: productAssets.map((a) => ({
      id: a.id,
      productId: a.productId,
      name: a.name,
      type: a.type,
      description: a.description,
      tags: a.tags,
      health: a.health,
      techDebtScore: a.techDebtScore ?? undefined,
      repositoryUrl: a.repositoryUrl ?? undefined,
      documentationUrl: a.documentationUrl ?? undefined,
      dependencies: [], // asset_dependencies resolved separately when needed
      createdAt: a.createdAt.toISOString(),
    })),
  }
}

// ---------------------------------------------------------------------------
// Code Plans
// ---------------------------------------------------------------------------

type PlanFilters = {
  productId?: string
  status?: 'draft' | 'active' | 'completed' | 'cancelled'
  type?: 'refactor' | 'feature' | 'improvement' | 'bugfix'
}

export async function getCodePlans(userId: string, filters: PlanFilters = {}): Promise<CodePlan[]> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  const orgId = user?.organizationId ?? null

  const productFilter = orgId
    ? or(eq(products.creatorId, userId), eq(products.organizationId, orgId))
    : eq(products.creatorId, userId)

  const accessibleProducts = await db.select({ id: products.id }).from(products).where(productFilter)
  const ids = accessibleProducts.map((p) => p.id)
  if (ids.length === 0) return []

  const conditions = [
    inArray(codePlans.productId, ids),
  ]
  if (filters.status) conditions.push(eq(codePlans.status, filters.status))
  if (filters.type) conditions.push(eq(codePlans.type, filters.type))
  if (filters.productId) conditions.push(eq(codePlans.productId, filters.productId))

  const rows = await db
    .select({
      id: codePlans.id,
      title: codePlans.title,
      description: codePlans.description,
      productId: codePlans.productId,
      type: codePlans.type,
      status: codePlans.status,
      tags: codePlans.tags,
      targetAssetIds: codePlans.targetAssetIds,
      startDate: codePlans.startDate,
      endDate: codePlans.endDate,
      deadline: codePlans.deadline,
      creatorId: codePlans.creatorId,
      assigneeIds: codePlans.assigneeIds,
      createdAt: codePlans.createdAt,
      updatedAt: codePlans.updatedAt,
      productName: products.name,
      taskCount: sql<number>`(
        select CAST(count(*) AS INTEGER) from tasks where tasks.code_plan_id = code_plans.id
      )`,
      completedTaskCount: sql<number>`(
        select CAST(count(*) AS INTEGER) from tasks
        where tasks.code_plan_id = code_plans.id and tasks.status = 'done'
      )`,
    })
    .from(codePlans)
    .innerJoin(products, eq(codePlans.productId, products.id))
    .where(and(...conditions))
    .orderBy(desc(codePlans.updatedAt))

  return rows.map((r) => ({
    ...r,
    startDate: r.startDate ?? undefined,
    endDate: r.endDate ?? undefined,
    deadline: r.deadline ?? undefined,
    taskCount: r.taskCount,
    completedTaskCount: r.completedTaskCount,
    progress: r.taskCount > 0 ? Math.round((r.completedTaskCount / r.taskCount) * 100) : 0,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  }))
}

export type CodePlanDetail = CodePlan & {
  productName: string
  productSlug: string
  tasks: Task[]
  assignees: { id: string; name: string }[]
  targetAssets: { id: string; name: string }[]
}

export async function getCodePlan(id: string): Promise<CodePlanDetail | null> {
  const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, id) })
  if (!plan) return null

  const product = await db.query.products.findFirst({ where: eq(products.id, plan.productId) })

  const [planTasks, resolvedAssets, resolvedAssignees] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.codePlanId, id),
      orderBy: desc(tasks.createdAt),
    }),
    plan.targetAssetIds.length > 0
      ? db.select({ id: assets.id, name: assets.name })
          .from(assets)
          .where(inArray(assets.id, plan.targetAssetIds))
      : Promise.resolve([]),
    plan.assigneeIds.length > 0
      ? db.select({ id: users.id, name: users.name })
          .from(users)
          .where(inArray(users.id, plan.assigneeIds))
      : Promise.resolve([]),
  ])

  const taskCount = planTasks.length
  const completedTaskCount = planTasks.filter((t) => t.status === 'done').length

  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    productId: plan.productId,
    productName: product?.name ?? '',
    productSlug: product?.slug ?? '',
    type: plan.type,
    status: plan.status,
    tags: plan.tags,
    targetAssetIds: plan.targetAssetIds,
    startDate: plan.startDate ?? undefined,
    endDate: plan.endDate ?? undefined,
    deadline: plan.deadline ?? undefined,
    creatorId: plan.creatorId,
    assigneeIds: plan.assigneeIds,
    taskCount,
    completedTaskCount,
    progress: taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
    tasks: planTasks.map((t) => ({
      id: t.id,
      codePlanId: t.codePlanId,
      assetId: t.assetId ?? undefined,
      title: t.title,
      description: t.description,
      status: t.status,
      priority: t.priority,
      tags: t.tags,
      assigneeId: t.assigneeId ?? undefined,
      estimatedEffort: t.estimatedEffort ?? undefined,
      actualEffort: t.actualEffort ?? undefined,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    assignees: resolvedAssignees,
    targetAssets: resolvedAssets,
  }
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type TaskFilters = {
  planId?: string
  assigneeId?: string
  productId?: string
  status?: 'not_started' | 'in_progress' | 'done'
}

export type TaskWithContext = Task & {
  planTitle: string
  assetName: string | null
  assigneeName: string | null
}

export async function getTasks(userId: string, filters: TaskFilters = {}): Promise<TaskWithContext[]> {
  const user = await db.query.users.findFirst({ where: eq(users.id, userId) })
  const orgId = user?.organizationId ?? null

  const productFilter = orgId
    ? or(eq(products.creatorId, userId), eq(products.organizationId, orgId))
    : eq(products.creatorId, userId)

  const accessibleProducts = await db.select({ id: products.id }).from(products).where(productFilter)
  const ids = accessibleProducts.map((p) => p.id)
  if (ids.length === 0) return []

  const conditions = [
    inArray(codePlans.productId, ids),
  ]
  if (filters.status) conditions.push(eq(tasks.status, filters.status))
  if (filters.planId) conditions.push(eq(tasks.codePlanId, filters.planId))
  if (filters.assigneeId) conditions.push(eq(tasks.assigneeId, filters.assigneeId))
  if (filters.productId) conditions.push(eq(codePlans.productId, filters.productId))

  const rows = await db
    .select({
      id: tasks.id,
      codePlanId: tasks.codePlanId,
      assetId: tasks.assetId,
      title: tasks.title,
      description: tasks.description,
      status: tasks.status,
      priority: tasks.priority,
      tags: tasks.tags,
      assigneeId: tasks.assigneeId,
      estimatedEffort: tasks.estimatedEffort,
      actualEffort: tasks.actualEffort,
      createdAt: tasks.createdAt,
      updatedAt: tasks.updatedAt,
      planTitle: codePlans.title,
      assetName: assets.name,
      assigneeName: users.name,
    })
    .from(tasks)
    .innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
    .leftJoin(assets, eq(tasks.assetId, assets.id))
    .leftJoin(users, eq(tasks.assigneeId, users.id))
    .where(and(...conditions))
    .orderBy(desc(tasks.updatedAt))

  return rows.map((r) => ({
    id: r.id,
    codePlanId: r.codePlanId,
    assetId: r.assetId ?? undefined,
    title: r.title,
    description: r.description,
    status: r.status,
    priority: r.priority,
    tags: r.tags,
    assigneeId: r.assigneeId ?? undefined,
    estimatedEffort: r.estimatedEffort ?? undefined,
    actualEffort: r.actualEffort ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    planTitle: r.planTitle,
    assetName: r.assetName,
    assigneeName: r.assigneeName,
  }))
}

// ---------------------------------------------------------------------------
// Organization & Team
// ---------------------------------------------------------------------------

export async function getOrganization(id: string): Promise<(Organization & { memberCount: number }) | null> {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, id) })
  if (!org) return null

  const [memberRow] = await db
    .select({ count: sql<number>`CAST(count(*) AS INTEGER)` })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, id), sql`${organizationMembers.joinedAt} is not null`))

  return {
    id: org.id,
    name: org.name,
    slug: org.slug,
    ownerId: org.ownerId,
    billingTier: org.billingTier,
    productLimit: org.productLimit,
    memberCount: memberRow?.count ?? 0,
    createdAt: org.createdAt.toISOString(),
  }
}

export async function getTeamMembers(orgId: string): Promise<TeamMember[]> {
  const rows = await db
    .select({
      id: organizationMembers.id,
      userId: organizationMembers.userId,
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
      joinedAt: organizationMembers.joinedAt,
      userName: users.name,
      userEmail: users.email,
      userAvatarUrl: users.avatarUrl,
      userBillingTier: users.billingTier,
      userFeatureFlags: users.featureFlags,
      userCreatedAt: users.createdAt,
    })
    .from(organizationMembers)
    .innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(
      eq(organizationMembers.organizationId, orgId),
      sql`${organizationMembers.joinedAt} is not null`
    ))
    .orderBy(organizationMembers.joinedAt)

  return rows.map((r) => ({
    id: r.id,
    userId: r.userId,
    organizationId: r.organizationId,
    role: r.role,
    joinedAt: r.joinedAt!.toISOString(),
    user: {
      id: r.userId,
      email: r.userEmail,
      name: r.userName,
      avatarUrl: r.userAvatarUrl ?? undefined,
      billingTier: r.userBillingTier,
      role: r.role,
      organizationId: r.organizationId,
      featureFlags: (r.userFeatureFlags as { alpha?: boolean; beta?: boolean; aiAssistance?: boolean }) ?? {},
      createdAt: r.userCreatedAt.toISOString(),
    },
  }))
}
