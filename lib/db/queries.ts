import { db } from './index'
import {
  products,
  assets,
  assetDependencies,
  codePlans,
  codePlanAssets,
  codePlanAssignees,
  workItems,
  workItemCodePlans,
  tasks,
  users,
  organizations,
  organizationMembers,
  syncLog,
  integrations,
} from './schema'
import { eq, and, sql, desc, or, inArray, gte, isNotNull } from 'drizzle-orm'
import type {
  Product,
  Asset,
  CodePlan,
  CodePlanStatus,
  PlanAsset,
  Task,
  WorkItem,
  WorkItemType,
  WorkItemStatus,
  WorkItemSeverity,
  ItemSource,
  Organization,
  TeamMember,
  DashboardStats,
  ActivityItem,
} from '@/lib/types'

// ---------------------------------------------------------------------------
// Access control
// ---------------------------------------------------------------------------

/**
 * Drizzle condition selecting the products a user may see.
 * Single source of truth for product visibility — every query goes through this.
 * Membership lives in organization_members (joined only); users.organizationId
 * is just a "current org" pointer and is deliberately not consulted here.
 */
export async function productAccessWhere(userId: string) {
  const memberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), isNotNull(organizationMembers.joinedAt)))
  const orgIds = memberships.map((m) => m.organizationId)
  return orgIds.length > 0
    ? or(eq(products.creatorId, userId), inArray(products.organizationId, orgIds))
    : eq(products.creatorId, userId)
}

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export async function getDashboardStats(userId: string, productId?: string): Promise<DashboardStats> {
  const productFilter = await productAccessWhere(userId)

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
  const accessFilter = await productAccessWhere(userId)
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
  const productFilter = and(eq(products.slug, slug), await productAccessWhere(userId))

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

  // Severity-weighted score from open tech-debt work items, capped at 100.
  // Used as the asset's debt score unless a manual override is set.
  const debtRows = await db
    .select({ assetId: workItems.assetId, severity: workItems.severity })
    .from(workItems)
    .where(
      and(
        eq(workItems.productId, product.id),
        eq(workItems.type, 'tech_debt'),
        inArray(workItems.status, ['open', 'planned', 'in_progress']),
      ),
    )
  const DEBT_WEIGHT: Record<string, number> = { low: 3, medium: 8, high: 15, critical: 25 }
  const derivedByAsset = new Map<string, { score: number; count: number }>()
  for (const r of debtRows) {
    if (!r.assetId) continue
    const cur = derivedByAsset.get(r.assetId) ?? { score: 0, count: 0 }
    cur.score = Math.min(100, cur.score + (DEBT_WEIGHT[r.severity] ?? 8))
    cur.count += 1
    derivedByAsset.set(r.assetId, cur)
  }

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
      derivedTechDebtScore: derivedByAsset.get(a.id)?.score,
      openDebtCount: derivedByAsset.get(a.id)?.count ?? 0,
      repositoryUrl: a.repositoryUrl ?? undefined,
      repoPath: a.repoPath ?? undefined,
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
  const productFilter = await productAccessWhere(userId)
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
      startDate: codePlans.startDate,
      endDate: codePlans.endDate,
      deadline: codePlans.deadline,
      creatorId: codePlans.creatorId,
      ownerId: codePlans.ownerId,
      specUrl: codePlans.specUrl,
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

  const planIds = rows.map((r) => r.id)
  const [assetLinks, assigneeLinks] = planIds.length
    ? await Promise.all([
        db
          .select({ codePlanId: codePlanAssets.codePlanId, assetId: codePlanAssets.assetId })
          .from(codePlanAssets)
          .where(inArray(codePlanAssets.codePlanId, planIds)),
        db
          .select({ codePlanId: codePlanAssignees.codePlanId, userId: codePlanAssignees.userId })
          .from(codePlanAssignees)
          .where(inArray(codePlanAssignees.codePlanId, planIds)),
      ])
    : [[], []]

  const assetsByPlan = new Map<string, string[]>()
  for (const l of assetLinks) {
    assetsByPlan.set(l.codePlanId, [...(assetsByPlan.get(l.codePlanId) ?? []), l.assetId])
  }
  const assigneesByPlan = new Map<string, string[]>()
  for (const l of assigneeLinks) {
    assigneesByPlan.set(l.codePlanId, [...(assigneesByPlan.get(l.codePlanId) ?? []), l.userId])
  }

  return rows.map((r) => ({
    ...r,
    ownerId: r.ownerId ?? undefined,
    specUrl: r.specUrl ?? undefined,
    targetAssetIds: assetsByPlan.get(r.id) ?? [],
    assigneeIds: assigneesByPlan.get(r.id) ?? [],
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
  ownerName: string | null
  tasks: Task[]
  assignees: { id: string; name: string }[]
  targetAssets: { id: string; name: string }[]
  planAssets: PlanAsset[]
}

export async function getCodePlan(id: string, userId: string): Promise<CodePlanDetail | null> {
  const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, id) })
  if (!plan) return null

  // Org-scope guard: the plan's product must be visible to this user.
  const product = await db.query.products.findFirst({
    where: and(eq(products.id, plan.productId), await productAccessWhere(userId)),
  })
  if (!product) return null

  const [planTasks, planAssetRows, resolvedAssignees] = await Promise.all([
    db.query.tasks.findMany({
      where: eq(tasks.codePlanId, id),
      orderBy: desc(tasks.createdAt),
    }),
    db
      .select({
        id: codePlanAssets.id,
        assetId: codePlanAssets.assetId,
        assetName: assets.name,
        branch: codePlanAssets.branch,
        prUrl: codePlanAssets.prUrl,
        prStatus: codePlanAssets.prStatus,
        notes: codePlanAssets.notes,
      })
      .from(codePlanAssets)
      .innerJoin(assets, eq(codePlanAssets.assetId, assets.id))
      .where(eq(codePlanAssets.codePlanId, id)),
    db
      .select({ id: users.id, name: users.name })
      .from(codePlanAssignees)
      .innerJoin(users, eq(codePlanAssignees.userId, users.id))
      .where(eq(codePlanAssignees.codePlanId, id)),
  ])

  const resolvedAssets = planAssetRows.map((r) => ({ id: r.assetId, name: r.assetName }))

  const taskCount = planTasks.length
  const completedTaskCount = planTasks.filter((t) => t.status === 'done').length

  return {
    id: plan.id,
    title: plan.title,
    description: plan.description,
    productId: plan.productId,
    productName: product.name,
    productSlug: product.slug,
    type: plan.type,
    status: plan.status,
    ownerId: plan.ownerId ?? undefined,
    ownerName: plan.ownerId
      ? ((await db.query.users.findFirst({ where: eq(users.id, plan.ownerId) }))?.name ?? null)
      : null,
    specUrl: plan.specUrl ?? undefined,
    source: plan.source as ItemSource,
    connectionId: plan.connectionId ?? undefined,
    externalKey: plan.externalKey ?? undefined,
    externalUrl: plan.externalUrl ?? undefined,
    tags: plan.tags,
    targetAssetIds: resolvedAssets.map((a) => a.id),
    startDate: plan.startDate ?? undefined,
    endDate: plan.endDate ?? undefined,
    deadline: plan.deadline ?? undefined,
    creatorId: plan.creatorId,
    assigneeIds: resolvedAssignees.map((u) => u.id),
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
      source: t.source as ItemSource,
      externalKey: t.externalKey ?? undefined,
      externalUrl: t.externalUrl ?? undefined,
      priority: t.priority,
      tags: t.tags,
      assigneeId: t.assigneeId ?? undefined,
      percentComplete: t.percentComplete ?? undefined,
      startDate: t.startDate ?? undefined,
      endDate: t.endDate ?? undefined,
      estimatedEffort: t.estimatedEffort ?? undefined,
      actualEffort: t.actualEffort ?? undefined,
      createdAt: t.createdAt.toISOString(),
      updatedAt: t.updatedAt.toISOString(),
    })),
    assignees: resolvedAssignees,
    targetAssets: resolvedAssets,
    planAssets: planAssetRows.map((r) => ({
      id: r.id,
      assetId: r.assetId,
      assetName: r.assetName,
      branch: r.branch ?? undefined,
      prUrl: r.prUrl ?? undefined,
      prStatus: r.prStatus,
      notes: r.notes ?? undefined,
    })),
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
  const productFilter = await productAccessWhere(userId)
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
      percentComplete: tasks.percentComplete,
      startDate: tasks.startDate,
      endDate: tasks.endDate,
      estimatedEffort: tasks.estimatedEffort,
      actualEffort: tasks.actualEffort,
      source: tasks.source,
      externalKey: tasks.externalKey,
      externalUrl: tasks.externalUrl,
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
    percentComplete: r.percentComplete ?? undefined,
    startDate: r.startDate ?? undefined,
    endDate: r.endDate ?? undefined,
    estimatedEffort: r.estimatedEffort ?? undefined,
    actualEffort: r.actualEffort ?? undefined,
    source: r.source as ItemSource,
    externalKey: r.externalKey ?? undefined,
    externalUrl: r.externalUrl ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    planTitle: r.planTitle,
    assetName: r.assetName,
    assigneeName: r.assigneeName,
  }))
}

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

export type WorkItemFilters = {
  productId?: string
  assetId?: string
  type?: WorkItemType
  status?: WorkItemStatus
  planId?: string
}

export type WorkItemWithContext = WorkItem & {
  productName: string
  productSlug: string
  assetName: string | null
  ownerName: string | null
  linkedPlans: { id: string; title: string; status: CodePlanStatus }[]
}

type WorkItemRow = {
  id: string
  productId: string
  assetId: string | null
  area: string | null
  parentId: string | null
  type: WorkItemType
  title: string
  description: string
  status: WorkItemStatus
  severity: WorkItemSeverity
  tags: string[]
  reporterId: string | null
  ownerId: string | null
  ownerName: string | null
  specUrl: string | null
  source: string // ItemSource — plain text column in pg mode
  externalKey: string | null
  externalUrl: string | null
  createdAt: Date
  updatedAt: Date
  productName: string
  productSlug: string
  assetName: string | null
}

function mapWorkItemRow(
  r: WorkItemRow,
  linkedPlans: { id: string; title: string; status: CodePlanStatus }[],
): WorkItemWithContext {
  return {
    id: r.id,
    productId: r.productId,
    assetId: r.assetId ?? undefined,
    area: r.area ?? undefined,
    parentId: r.parentId ?? undefined,
    type: r.type,
    title: r.title,
    description: r.description,
    status: r.status,
    severity: r.severity,
    tags: r.tags,
    reporterId: r.reporterId ?? undefined,
    ownerId: r.ownerId ?? undefined,
    ownerName: r.ownerName,
    specUrl: r.specUrl ?? undefined,
    source: r.source as ItemSource,
    externalKey: r.externalKey ?? undefined,
    externalUrl: r.externalUrl ?? undefined,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    productName: r.productName,
    productSlug: r.productSlug,
    assetName: r.assetName,
    linkedPlans,
  }
}

async function linkedPlansByItem(itemIds: string[]) {
  const map = new Map<string, { id: string; title: string; status: CodePlanStatus }[]>()
  if (itemIds.length === 0) return map
  const rows = await db
    .select({
      workItemId: workItemCodePlans.workItemId,
      id: codePlans.id,
      title: codePlans.title,
      status: codePlans.status,
    })
    .from(workItemCodePlans)
    .innerJoin(codePlans, eq(workItemCodePlans.codePlanId, codePlans.id))
    .where(inArray(workItemCodePlans.workItemId, itemIds))
  for (const r of rows) {
    map.set(r.workItemId, [...(map.get(r.workItemId) ?? []), { id: r.id, title: r.title, status: r.status }])
  }
  return map
}

export async function getWorkItems(userId: string, filters: WorkItemFilters = {}): Promise<WorkItemWithContext[]> {
  const productFilter = await productAccessWhere(userId)
  const accessibleProducts = await db.select({ id: products.id }).from(products).where(productFilter)
  const ids = accessibleProducts.map((p) => p.id)
  if (ids.length === 0) return []

  const conditions = [inArray(workItems.productId, ids)]
  if (filters.productId) conditions.push(eq(workItems.productId, filters.productId))
  if (filters.assetId) conditions.push(eq(workItems.assetId, filters.assetId))
  if (filters.type) conditions.push(eq(workItems.type, filters.type))
  if (filters.status) conditions.push(eq(workItems.status, filters.status))
  if (filters.planId) {
    conditions.push(
      inArray(
        workItems.id,
        db
          .select({ id: workItemCodePlans.workItemId })
          .from(workItemCodePlans)
          .where(eq(workItemCodePlans.codePlanId, filters.planId)),
      ),
    )
  }

  const rows = await db
    .select({
      ...workItemColumns(),
      productName: products.name,
      productSlug: products.slug,
      assetName: assets.name,
      ownerName: users.name,
    })
    .from(workItems)
    .innerJoin(products, eq(workItems.productId, products.id))
    .leftJoin(assets, eq(workItems.assetId, assets.id))
    .leftJoin(users, eq(workItems.ownerId, users.id))
    .where(and(...conditions))
    .orderBy(desc(workItems.updatedAt))

  const plansMap = await linkedPlansByItem(rows.map((r) => r.id))
  return rows.map((r) => mapWorkItemRow(r, plansMap.get(r.id) ?? []))
}

export async function getWorkItem(id: string, userId: string): Promise<WorkItemWithContext | null> {
  const rows = await db
    .select({
      ...workItemColumns(),
      productName: products.name,
      productSlug: products.slug,
      assetName: assets.name,
      ownerName: users.name,
    })
    .from(workItems)
    .innerJoin(products, eq(workItems.productId, products.id))
    .leftJoin(assets, eq(workItems.assetId, assets.id))
    .leftJoin(users, eq(workItems.ownerId, users.id))
    .where(and(eq(workItems.id, id), await productAccessWhere(userId)))

  const row = rows[0]
  if (!row) return null
  const plansMap = await linkedPlansByItem([row.id])
  return mapWorkItemRow(row, plansMap.get(row.id) ?? [])
}

function workItemColumns() {
  return {
    id: workItems.id,
    productId: workItems.productId,
    assetId: workItems.assetId,
    area: workItems.area,
    parentId: workItems.parentId,
    type: workItems.type,
    title: workItems.title,
    description: workItems.description,
    status: workItems.status,
    severity: workItems.severity,
    tags: workItems.tags,
    reporterId: workItems.reporterId,
    ownerId: workItems.ownerId,
    specUrl: workItems.specUrl,
    source: workItems.source,
    externalKey: workItems.externalKey,
    externalUrl: workItems.externalUrl,
    createdAt: workItems.createdAt,
    updatedAt: workItems.updatedAt,
  }
}

/** Flat list of assets across accessible products — for dropdowns. */
export async function getAssetOptions(
  userId: string,
): Promise<{ id: string; name: string; productId: string }[]> {
  const productFilter = await productAccessWhere(userId)
  return db
    .select({ id: assets.id, name: assets.name, productId: assets.productId })
    .from(assets)
    .innerJoin(products, eq(assets.productId, products.id))
    .where(productFilter)
    .orderBy(assets.name)
}

// ---------------------------------------------------------------------------
// Asset dependencies & impact analysis
// ---------------------------------------------------------------------------

export type DependencyEdge = {
  id: string
  sourceAssetId: string
  sourceAssetName: string
  targetAssetId: string
  targetAssetName: string
  dependencyType: 'depends_on' | 'integrates_with' | 'aggregates'
  description: string | null
}

/** All dependency edges between assets of one product. */
export async function getProductDependencyEdges(productId: string): Promise<DependencyEdge[]> {
  const rows = await db
    .select({
      id: assetDependencies.id,
      sourceAssetId: assetDependencies.sourceAssetId,
      sourceAssetName: assets.name,
      targetAssetId: assetDependencies.targetAssetId,
      targetAssetName: sql<string>`(select name from assets a2 where a2.id = ${assetDependencies.targetAssetId})`,
      dependencyType: assetDependencies.dependencyType,
      description: assetDependencies.description,
    })
    .from(assetDependencies)
    .innerJoin(assets, eq(assetDependencies.sourceAssetId, assets.id))
    .where(eq(assets.productId, productId))
  return rows
}

export type ImpactedAsset = {
  id: string
  name: string
  type: string
  health: string
  viaAssetId: string
  viaAssetName: string
  dependencyType: 'depends_on' | 'integrates_with' | 'aggregates'
}

/**
 * Impact analysis for a plan: assets that depend on (or integrate with) the
 * plan's target assets, excluding the targets themselves. These are the
 * blast radius of the change.
 */
export async function getImpactedAssets(planId: string): Promise<ImpactedAsset[]> {
  const targets = await db
    .select({ assetId: codePlanAssets.assetId })
    .from(codePlanAssets)
    .where(eq(codePlanAssets.codePlanId, planId))
  const targetIds = targets.map((t) => t.assetId)
  if (targetIds.length === 0) return []

  const rows = await db
    .select({
      id: assets.id,
      name: assets.name,
      type: assets.type,
      health: assets.health,
      viaAssetId: assetDependencies.targetAssetId,
      viaAssetName: sql<string>`(select name from assets a2 where a2.id = ${assetDependencies.targetAssetId})`,
      dependencyType: assetDependencies.dependencyType,
    })
    .from(assetDependencies)
    .innerJoin(assets, eq(assetDependencies.sourceAssetId, assets.id))
    .where(inArray(assetDependencies.targetAssetId, targetIds))

  // Targets themselves are being changed deliberately — not "impact".
  const targetSet = new Set(targetIds)
  return rows.filter((r) => !targetSet.has(r.id))
}

// ---------------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------------

export type AnalyticsInsight = {
  kind: 'debt' | 'velocity' | 'deadline'
  title: string
  description: string
}

export type AnalyticsData = {
  velocityByWeek: { week: string; completed: number; created: number }[]
  tasksByType: { name: string; value: number }[]
  effortByMonth: { month: string; estimated: number; actual: number }[]
  techDebtByProduct: { name: string; score: number }[]
  avgCycleTimeDays: number | null
  estimationAccuracy: number | null
  insights: AnalyticsInsight[]
}

const PLAN_TYPE_LABELS: Record<string, string> = {
  feature: 'Feature',
  refactor: 'Refactor',
  bugfix: 'Bug Fix',
  improvement: 'Improvement',
}

export async function getAnalytics(userId: string, productId?: string): Promise<AnalyticsData> {
  const productFilter = await productAccessWhere(userId)
  const accessible = await db
    .select({ id: products.id, name: products.name })
    .from(products)
    .where(productFilter)
  let scoped = accessible
  if (productId) scoped = scoped.filter((p) => p.id === productId)
  const ids = scoped.map((p) => p.id)

  const empty: AnalyticsData = {
    velocityByWeek: [],
    tasksByType: [],
    effortByMonth: [],
    techDebtByProduct: [],
    avgCycleTimeDays: null,
    estimationAccuracy: null,
    insights: [],
  }
  if (ids.length === 0) return empty

  const [taskRows, assetRows, debtRows, activePlans] = await Promise.all([
    db
      .select({
        status: tasks.status,
        estimatedEffort: tasks.estimatedEffort,
        actualEffort: tasks.actualEffort,
        createdAt: tasks.createdAt,
        updatedAt: tasks.updatedAt,
        planType: codePlans.type,
      })
      .from(tasks)
      .innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
      .where(inArray(codePlans.productId, ids)),
    db
      .select({
        id: assets.id,
        name: assets.name,
        productId: assets.productId,
        techDebtScore: assets.techDebtScore,
      })
      .from(assets)
      .where(inArray(assets.productId, ids)),
    db
      .select({ assetId: workItems.assetId, severity: workItems.severity })
      .from(workItems)
      .where(
        and(
          inArray(workItems.productId, ids),
          eq(workItems.type, 'tech_debt'),
          inArray(workItems.status, ['open', 'planned', 'in_progress']),
        ),
      ),
    db
      .select({
        id: codePlans.id,
        title: codePlans.title,
        deadline: codePlans.deadline,
      })
      .from(codePlans)
      .where(and(inArray(codePlans.productId, ids), eq(codePlans.status, 'active'))),
  ])

  // --- Velocity: last 8 weeks, completed vs created ---
  const WEEK_MS = 7 * 24 * 60 * 60 * 1000
  const now = Date.now()
  const velocityByWeek = Array.from({ length: 8 }, (_, i) => {
    const start = now - (8 - i) * WEEK_MS
    const end = start + WEEK_MS
    const completed = taskRows.filter(
      (t) => t.status === 'done' && t.updatedAt.getTime() >= start && t.updatedAt.getTime() < end,
    ).length
    const created = taskRows.filter(
      (t) => t.createdAt.getTime() >= start && t.createdAt.getTime() < end,
    ).length
    return { week: `W${i + 1}`, completed, created }
  })

  // --- Tasks by plan type (percentages) ---
  const typeCounts = new Map<string, number>()
  for (const t of taskRows) {
    typeCounts.set(t.planType, (typeCounts.get(t.planType) ?? 0) + 1)
  }
  const totalTyped = taskRows.length
  const tasksByType = [...typeCounts.entries()]
    .map(([type, count]) => ({
      name: PLAN_TYPE_LABELS[type] ?? type,
      value: totalTyped > 0 ? Math.round((count / totalTyped) * 100) : 0,
    }))
    .sort((a, b) => b.value - a.value)

  // --- Effort estimation accuracy by month (done tasks with both values) ---
  const MONTHS = 6
  const monthKeys: string[] = []
  const monthLabel = new Intl.DateTimeFormat('en-US', { month: 'short' })
  const byMonth = new Map<string, { estimated: number; actual: number }>()
  for (let i = MONTHS - 1; i >= 0; i--) {
    const d = new Date()
    d.setDate(1)
    d.setMonth(d.getMonth() - i)
    const key = `${d.getFullYear()}-${d.getMonth()}`
    monthKeys.push(key)
    byMonth.set(key, { estimated: 0, actual: 0 })
  }
  const measured = taskRows.filter(
    (t) => t.status === 'done' && t.estimatedEffort != null && t.actualEffort != null,
  )
  for (const t of measured) {
    const key = `${t.updatedAt.getFullYear()}-${t.updatedAt.getMonth()}`
    const bucket = byMonth.get(key)
    if (!bucket) continue
    bucket.estimated += t.estimatedEffort!
    bucket.actual += t.actualEffort!
  }
  const effortByMonth = monthKeys.map((key) => {
    const [year, month] = key.split('-').map(Number)
    return {
      month: monthLabel.format(new Date(year, month, 1)),
      ...byMonth.get(key)!,
    }
  })

  // --- Estimation accuracy: % of measured tasks within 20% of estimate ---
  const withEstimate = measured.filter((t) => t.estimatedEffort! > 0)
  const withinVariance = withEstimate.filter(
    (t) => Math.abs(t.actualEffort! - t.estimatedEffort!) / t.estimatedEffort! <= 0.2,
  )
  const estimationAccuracy =
    withEstimate.length > 0 ? Math.round((withinVariance.length / withEstimate.length) * 100) : null

  // --- Cycle time: created → done, days ---
  const doneTasks = taskRows.filter((t) => t.status === 'done')
  const avgCycleTimeDays =
    doneTasks.length > 0
      ? Math.round(
          (doneTasks.reduce((sum, t) => sum + (t.updatedAt.getTime() - t.createdAt.getTime()), 0) /
            doneTasks.length /
            (24 * 60 * 60 * 1000)) *
            10,
        ) / 10
      : null

  // --- Tech debt by product (effective score = manual ?? derived) ---
  const DEBT_WEIGHT: Record<string, number> = { low: 3, medium: 8, high: 15, critical: 25 }
  const derivedByAsset = new Map<string, number>()
  for (const r of debtRows) {
    if (!r.assetId) continue
    derivedByAsset.set(
      r.assetId,
      Math.min(100, (derivedByAsset.get(r.assetId) ?? 0) + (DEBT_WEIGHT[r.severity] ?? 8)),
    )
  }
  const techDebtByProduct = scoped
    .map((p) => {
      const productAssets = assetRows.filter((a) => a.productId === p.id)
      const scores = productAssets
        .map((a) => a.techDebtScore ?? derivedByAsset.get(a.id))
        .filter((s): s is number => s != null)
      return {
        name: p.name,
        score: scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
      }
    })
    .sort((a, b) => b.score - a.score)

  // --- Insights (computed, not canned) ---
  const insights: AnalyticsInsight[] = []
  const worstAsset = assetRows
    .map((a) => ({ ...a, effective: a.techDebtScore ?? derivedByAsset.get(a.id) ?? 0 }))
    .sort((a, b) => b.effective - a.effective)[0]
  if (worstAsset && worstAsset.effective >= 40) {
    insights.push({
      kind: 'debt',
      title: `${worstAsset.name} needs attention`,
      description: `Highest tech debt score (${worstAsset.effective}). Consider scheduling a refactor plan.`,
    })
  }
  const recent = velocityByWeek.slice(4).reduce((s, w) => s + w.completed, 0)
  const prior = velocityByWeek.slice(0, 4).reduce((s, w) => s + w.completed, 0)
  if (prior > 0 && recent !== prior) {
    const pct = Math.round(((recent - prior) / prior) * 100)
    insights.push({
      kind: 'velocity',
      title: pct > 0 ? 'Velocity trending up' : 'Velocity trending down',
      description: `${Math.abs(pct)}% ${pct > 0 ? 'more' : 'fewer'} tasks completed in the last 4 weeks vs the prior 4.`,
    })
  }
  const today = new Date().toISOString().slice(0, 10)
  const overdue = activePlans.filter((p) => p.deadline && p.deadline < today)
  if (overdue.length > 0) {
    insights.push({
      kind: 'deadline',
      title: `${overdue.length} active plan${overdue.length > 1 ? 's' : ''} past deadline`,
      description: overdue
        .slice(0, 2)
        .map((p) => `"${p.title}"`)
        .join(', ') + ' — consider re-scoping or updating the deadline.',
    })
  }

  return {
    velocityByWeek,
    tasksByType,
    effortByMonth,
    techDebtByProduct,
    avgCycleTimeDays,
    estimationAccuracy,
    insights,
  }
}

// ---------------------------------------------------------------------------
// Activity feed
// ---------------------------------------------------------------------------

/** Maps a sync_log row onto the feed's presentation type + verb. */
function activityPresentation(entityType: string, event: string, payload: Record<string, unknown>): { type: ActivityItem['type']; title: string } | null {
  if (entityType === 'code_plan') {
    if (event === 'created') return { type: 'plan_created', title: 'created a code plan' }
    if (event === 'activated') return { type: 'plan_activated', title: 'activated a code plan' }
    if (event === 'completed') return { type: 'plan_completed', title: 'completed a code plan' }
    if (event === 'deleted') return { type: 'plan_updated', title: 'deleted a code plan' }
    return { type: 'plan_updated', title: 'updated a code plan' }
  }
  if (entityType === 'task') {
    if (event === 'created') return { type: 'task_created', title: 'added a task' }
    if (event === 'completed') return { type: 'task_completed', title: 'completed a task' }
    return null
  }
  if (entityType === 'asset') {
    if (event === 'created') return { type: 'asset_added', title: 'added an asset' }
    return null
  }
  if (entityType === 'product') {
    if (event === 'created') return { type: 'asset_added', title: 'created a product' }
    return null
  }
  if (entityType === 'work_item') {
    if (event === 'created') return { type: 'item_created', title: 'created a work item' }
    if (event === 'status_changed' && payload.status === 'resolved') {
      return { type: 'item_resolved', title: 'resolved a work item' }
    }
    if (event === 'linked_to_plan') return { type: 'item_linked', title: 'linked a work item to a plan' }
    if (event === 'unlinked_from_plan') return { type: 'item_linked', title: 'unlinked a work item from a plan' }
    if (event === 'deleted') return { type: 'item_updated', title: 'deleted a work item' }
    return { type: 'item_updated', title: 'updated a work item' }
  }
  return null
}

export async function getActivityFeed(userId: string, limit = 15): Promise<ActivityItem[]> {
  const memberships = await db
    .select({ organizationId: organizationMembers.organizationId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), isNotNull(organizationMembers.joinedAt)))
  const orgIds = memberships.map((m) => m.organizationId)
  if (orgIds.length === 0) return []

  const rows = await db
    .select({
      id: syncLog.id,
      entityType: syncLog.entityType,
      event: syncLog.event,
      payload: syncLog.payload,
      actorId: syncLog.actorId,
      actorName: users.name,
      createdAt: syncLog.createdAt,
    })
    .from(syncLog)
    .leftJoin(users, eq(syncLog.actorId, users.id))
    .where(inArray(syncLog.organizationId, orgIds))
    .orderBy(desc(syncLog.createdAt))
    .limit(limit * 2) // headroom: some rows don't map to a feed entry

  const items: ActivityItem[] = []
  for (const r of rows) {
    const payload = (r.payload ?? {}) as Record<string, unknown>
    const presentation = activityPresentation(r.entityType, r.event, payload)
    if (!presentation) continue
    items.push({
      id: r.id,
      type: presentation.type,
      title: presentation.title,
      description: String(payload.title ?? payload.name ?? ''),
      userId: r.actorId ?? '',
      userName: r.actorName ?? 'Sync',
      timestamp: r.createdAt.toISOString(),
    })
    if (items.length >= limit) break
  }
  return items
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

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export type IntegrationSummary = {
  id: string
  provider: string
  name: string
  authRef: string | null
  config: Record<string, unknown>
  status: string
  credential: 'stored' | 'env_set' | 'env_missing' | 'none'
  lastSyncAt: string | null
  lastError: string | null
  mirroredCount: number
}

export async function getIntegrations(orgId: string): Promise<IntegrationSummary[]> {
  const rows = await db
    .select({
      id: integrations.id,
      provider: integrations.provider,
      name: integrations.name,
      authRef: integrations.authRef,
      tokenEncrypted: integrations.tokenEncrypted,
      config: integrations.config,
      status: integrations.status,
      lastSyncAt: integrations.lastSyncAt,
      lastError: integrations.lastError,
      mirroredCount: sql<number>`(
        select CAST(count(*) AS INTEGER) from work_items where work_items.connection_id = integrations.id
      )`,
    })
    .from(integrations)
    .where(eq(integrations.organizationId, orgId))
    .orderBy(integrations.name)

  return rows.map(({ tokenEncrypted, ...r }) => ({
    ...r,
    config: (r.config ?? {}) as Record<string, unknown>,
    credential: tokenEncrypted
      ? ('stored' as const)
      : r.authRef
        ? process.env[r.authRef]
          ? ('env_set' as const)
          : ('env_missing' as const)
        : ('none' as const),
    lastSyncAt: r.lastSyncAt?.toISOString() ?? null,
  }))
}
