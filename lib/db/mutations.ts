import { db } from './index'
import {
  products,
  assets,
  assetDependencies,
  integrations,
  codePlans,
  codePlanAssets,
  codePlanAssignees,
  workItems,
  workItemCodePlans,
  tasks,
} from './schema'
import { eq, and, ne } from 'drizzle-orm'
import type { WorkItemType, WorkItemStatus, WorkItemSeverity } from '@/lib/types'

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

type CreateProductData = {
  name: string
  slug: string
  description: string
  tags: string[]
  organizationId?: string
}

export async function createProduct(data: CreateProductData, userId: string) {
  const [product] = await db
    .insert(products)
    .values({
      ...data,
      creatorId: userId,
    })
    .returning()
  return product
}

type UpdateProductData = Partial<Pick<CreateProductData, 'name' | 'description' | 'tags'>>

export async function updateProduct(id: string, data: UpdateProductData, userId: string) {
  const [product] = await db
    .update(products)
    .set(data)
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning()
  return product ?? null
}

export async function deleteProduct(id: string, userId: string) {
  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning({ id: products.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

type CreateAssetData = {
  productId: string
  name: string
  type: 'app' | 'service' | 'library' | 'datastore' | 'platform'
  description: string
  tags: string[]
  repositoryUrl?: string
  repoPath?: string
  documentationUrl?: string
}

export async function createAsset(data: CreateAssetData) {
  // Idempotent by (product, name) so agent re-runs can't duplicate assets.
  const existing = await db.query.assets.findFirst({
    where: and(eq(assets.productId, data.productId), eq(assets.name, data.name)),
  })
  if (existing) return existing
  const [asset] = await db.insert(assets).values(data).returning()
  return asset
}

type UpdateAssetData = Partial<Omit<CreateAssetData, 'productId'> & {
  health: 'healthy' | 'warning' | 'critical'
  status: 'active' | 'deprecated' | 'planned'
  techDebtScore: number
}>

export async function updateAsset(id: string, data: UpdateAssetData) {
  const [asset] = await db
    .update(assets)
    .set({ ...data, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  return asset ?? null
}

export async function deleteAsset(id: string) {
  const [deleted] = await db
    .delete(assets)
    .where(eq(assets.id, id))
    .returning({ id: assets.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Code Plans
// ---------------------------------------------------------------------------

type CreateCodePlanData = {
  title: string
  description: string
  productId: string
  type: 'refactor' | 'feature' | 'improvement' | 'bugfix'
  tags: string[]
  targetAssetIds: string[]
  startDate?: string
  endDate?: string
  deadline?: string
  specUrl?: string
  assigneeIds: string[]
}

// Join tables are the source of truth for plan↔asset and plan↔assignee links
// (the deprecated array columns were dropped in v0.3.0).

async function syncPlanAssets(planId: string, assetIds: string[]) {
  const existing = await db
    .select({ assetId: codePlanAssets.assetId })
    .from(codePlanAssets)
    .where(eq(codePlanAssets.codePlanId, planId))
  const keep = new Set(assetIds)
  const current = new Set(existing.map((r) => r.assetId))

  for (const r of existing) {
    if (!keep.has(r.assetId)) {
      await db
        .delete(codePlanAssets)
        .where(and(eq(codePlanAssets.codePlanId, planId), eq(codePlanAssets.assetId, r.assetId)))
    }
  }
  const toAdd = assetIds.filter((id) => !current.has(id))
  if (toAdd.length > 0) {
    await db.insert(codePlanAssets).values(toAdd.map((assetId) => ({ codePlanId: planId, assetId })))
  }
}

async function syncPlanAssignees(planId: string, userIds: string[]) {
  await db.delete(codePlanAssignees).where(eq(codePlanAssignees.codePlanId, planId))
  if (userIds.length > 0) {
    await db.insert(codePlanAssignees).values(userIds.map((userId) => ({ codePlanId: planId, userId })))
  }
}

export async function createCodePlan(data: CreateCodePlanData, userId: string) {
  const { targetAssetIds, assigneeIds, ...columns } = data
  const [plan] = await db
    .insert(codePlans)
    .values({
      ...columns,
      creatorId: userId,
      status: 'draft',
    })
    .returning()
  await syncPlanAssets(plan.id, targetAssetIds)
  await syncPlanAssignees(plan.id, assigneeIds)
  return plan
}

type UpdateCodePlanData = Partial<
  Omit<CreateCodePlanData, 'productId'> & {
    status: 'draft' | 'active' | 'completed' | 'cancelled'
  }
>

export async function updateCodePlan(id: string, data: UpdateCodePlanData) {
  const { targetAssetIds, assigneeIds, ...columns } = data
  const [plan] = await db
    .update(codePlans)
    .set({ ...columns, updatedAt: new Date() })
    .where(eq(codePlans.id, id))
    .returning()
  if (!plan) return null
  if (targetAssetIds !== undefined) await syncPlanAssets(id, targetAssetIds)
  if (assigneeIds !== undefined) await syncPlanAssignees(id, assigneeIds)
  return plan
}

export async function deleteCodePlan(id: string, userId: string) {
  const [deleted] = await db
    .delete(codePlans)
    .where(and(eq(codePlans.id, id), eq(codePlans.creatorId, userId)))
    .returning({ id: codePlans.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

type CreateTaskData = {
  codePlanId: string
  assetId?: string
  title: string
  description: string
  priority: 'low' | 'medium' | 'high' | 'critical'
  tags: string[]
  assigneeId?: string
  estimatedEffort?: number
}

export async function createTask(data: CreateTaskData) {
  // Idempotent by (plan, title) so agent re-runs can't duplicate tasks.
  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.codePlanId, data.codePlanId), eq(tasks.title, data.title)),
  })
  if (existing) return existing
  const [task] = await db.insert(tasks).values(data).returning()
  return task
}

type UpdateTaskData = Partial<Omit<CreateTaskData, 'codePlanId' | 'assigneeId'> & {
  status: 'not_started' | 'in_progress' | 'done'
  actualEffort: number
  assigneeId: string | null
}>

export async function updateTask(id: string, data: UpdateTaskData) {
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!existing) return null

  // Mirrored tasks: the external tracker owns title/description/status/tags.
  // Assignee, effort, priority, and asset scope remain locally editable.
  const patch: UpdateTaskData =
    existing.source !== 'native'
      ? {
          assetId: data.assetId,
          assigneeId: data.assigneeId,
          priority: data.priority,
          estimatedEffort: data.estimatedEffort,
          actualEffort: data.actualEffort,
        }
      : data

  const [task] = await db
    .update(tasks)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  return task ?? null
}

export async function updateTaskStatus(id: string, status: 'not_started' | 'in_progress' | 'done') {
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!existing) return null
  // Status is mirrored — close/reopen the issue in the external tracker instead.
  if (existing.source !== 'native') return null

  const [task] = await db
    .update(tasks)
    .set({ status, updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  return task ?? null
}

export async function deleteTask(id: string) {
  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Plan ↔ external scope linking (tier 2/3 task sync)
// ---------------------------------------------------------------------------

type LinkPlanScopeData = {
  provider: string
  connectionId: string
  externalId: string
  externalKey?: string
  externalUrl?: string
}

export async function linkPlanToExternalScope(planId: string, data: LinkPlanScopeData) {
  const [plan] = await db
    .update(codePlans)
    .set({
      source: data.provider as typeof codePlans.$inferSelect.source,
      connectionId: data.connectionId,
      externalId: data.externalId,
      externalKey: data.externalKey ?? null,
      externalUrl: data.externalUrl ?? null,
      updatedAt: new Date(),
    })
    .where(eq(codePlans.id, planId))
    .returning()
  return plan ?? null
}

/**
 * Detach a plan from its external scope. Already-mirrored tasks are converted
 * to native so they stay editable and are no longer touched by sync.
 */
export async function unlinkPlanFromExternalScope(planId: string) {
  await db
    .update(tasks)
    .set({ source: 'native', connectionId: null, externalId: null, updatedAt: new Date() })
    .where(and(eq(tasks.codePlanId, planId), ne(tasks.source, 'native')))
  const [plan] = await db
    .update(codePlans)
    .set({
      source: 'native',
      connectionId: null,
      externalId: null,
      externalKey: null,
      externalUrl: null,
      updatedAt: new Date(),
    })
    .where(eq(codePlans.id, planId))
    .returning()
  return plan ?? null
}

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

type CreateWorkItemData = {
  productId: string
  assetId?: string
  area?: string
  type: WorkItemType
  title: string
  description: string
  severity: WorkItemSeverity
  specUrl?: string
  tags: string[]
}

export async function createWorkItem(data: CreateWorkItemData, userId: string) {
  const [item] = await db
    .insert(workItems)
    .values({ ...data, reporterId: userId })
    .returning()
  return item
}

type UpdateWorkItemData = Partial<
  Omit<CreateWorkItemData, 'productId' | 'assetId' | 'area'> & {
    status: WorkItemStatus
    assetId: string | null
    area: string | null
  }
>

export async function updateWorkItem(id: string, data: UpdateWorkItemData) {
  const existing = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  if (!existing) return null

  // Mirrored items: the external tracker owns title/description/status/type/tags.
  // Only the native annotation fields may be edited locally.
  const patch: UpdateWorkItemData =
    existing.source !== 'native'
      ? { assetId: data.assetId, area: data.area, severity: data.severity, specUrl: data.specUrl }
      : data

  const [item] = await db
    .update(workItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning()
  return item ?? null
}

export async function updateWorkItemStatus(id: string, status: WorkItemStatus) {
  const existing = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  if (!existing) return null
  // Status is a mirrored field — change it in the external tracker instead.
  if (existing.source !== 'native') return null

  const [item] = await db
    .update(workItems)
    .set({ status, updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning()
  return item ?? null
}

export async function deleteWorkItem(id: string) {
  const [deleted] = await db
    .delete(workItems)
    .where(eq(workItems.id, id))
    .returning({ id: workItems.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Plan assets (per-asset branch/PR tracking)
// ---------------------------------------------------------------------------
// Note: the deprecated code_plans.target_asset_ids array is not maintained by
// these mutations — the join table is the sole source of truth going forward.

export async function addPlanAsset(codePlanId: string, assetId: string) {
  const existing = await db.query.codePlanAssets.findFirst({
    where: and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)),
  })
  if (existing) return existing
  const [row] = await db.insert(codePlanAssets).values({ codePlanId, assetId }).returning()
  return row
}

export async function removePlanAsset(codePlanId: string, assetId: string) {
  const [deleted] = await db
    .delete(codePlanAssets)
    .where(and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)))
    .returning({ id: codePlanAssets.id })
  return deleted ?? null
}

type UpdatePlanAssetData = Partial<{
  branch: string | null
  prUrl: string | null
  prStatus: 'none' | 'draft' | 'open' | 'merged' | 'closed'
  notes: string | null
}>

export async function updatePlanAsset(codePlanId: string, assetId: string, data: UpdatePlanAssetData) {
  const [row] = await db
    .update(codePlanAssets)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)))
    .returning()
  return row ?? null
}

export async function linkWorkItemToPlan(workItemId: string, codePlanId: string) {
  const existing = await db.query.workItemCodePlans.findFirst({
    where: and(
      eq(workItemCodePlans.workItemId, workItemId),
      eq(workItemCodePlans.codePlanId, codePlanId),
    ),
  })
  if (existing) return existing
  const [link] = await db
    .insert(workItemCodePlans)
    .values({ workItemId, codePlanId })
    .returning()
  return link
}

export async function unlinkWorkItemFromPlan(workItemId: string, codePlanId: string) {
  const [deleted] = await db
    .delete(workItemCodePlans)
    .where(
      and(
        eq(workItemCodePlans.workItemId, workItemId),
        eq(workItemCodePlans.codePlanId, codePlanId),
      ),
    )
    .returning({ id: workItemCodePlans.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Asset dependencies
// ---------------------------------------------------------------------------

type CreateAssetDependencyData = {
  sourceAssetId: string
  targetAssetId: string
  dependencyType: 'depends_on' | 'integrates_with' | 'aggregates'
  description?: string
}

export async function createAssetDependency(data: CreateAssetDependencyData) {
  if (data.sourceAssetId === data.targetAssetId) return null
  const existing = await db.query.assetDependencies.findFirst({
    where: and(
      eq(assetDependencies.sourceAssetId, data.sourceAssetId),
      eq(assetDependencies.targetAssetId, data.targetAssetId),
      eq(assetDependencies.dependencyType, data.dependencyType),
    ),
  })
  if (existing) return existing
  const [row] = await db.insert(assetDependencies).values(data).returning()
  return row
}

export async function deleteAssetDependency(id: string) {
  const [deleted] = await db
    .delete(assetDependencies)
    .where(eq(assetDependencies.id, id))
    .returning({ id: assetDependencies.id })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

type CreateIntegrationData = {
  organizationId: string
  provider: string
  name: string
  authRef?: string
  token?: string
  config: Record<string, unknown>
}

export async function createIntegration(data: CreateIntegrationData) {
  const { token, ...columns } = data
  let tokenEncrypted: string | undefined
  if (token) {
    const { encryptToken } = await import('@/lib/integrations/secrets')
    tokenEncrypted = encryptToken(token)
  }
  const [row] = await db.insert(integrations).values({ ...columns, tokenEncrypted }).returning()
  return row
}

export async function deleteIntegration(id: string) {
  const [deleted] = await db
    .delete(integrations)
    .where(eq(integrations.id, id))
    .returning({ id: integrations.id })
  return deleted ?? null
}
