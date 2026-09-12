import { createdBy, editedBy, type ArtifactActor } from './attribution'
import { db } from './index'
import { requireSpec, reviseSpec, specAssetAnchors, refreshSpecAssetLinks } from './specs'
import {
  products,
  assets,
  assetOwners,
  assetDependencies,
  integrations,
  codePlans,
  codePlanAssets,
  workItems,
  workItemCodePlans,
  tasks,
  releases,
  releaseAssets,
  assetDesignLog,
  assetCapabilities,
  specs,
  specLinks,
  syncLog,
  users,
} from './schema'
import { eq, and, ne, inArray, or } from 'drizzle-orm'
import type { WorkItemType, WorkItemStatus, WorkItemSeverity, ReleaseStatus } from '@/lib/types'

// ---------------------------------------------------------------------------
// Audit log
// ---------------------------------------------------------------------------

/**
 * Append an event to sync_log — the activity stream. Lives in the shared
 * mutation layer (not the UI action layer) so both web server actions and MCP
 * tools get audit coverage for free, since both call these same functions.
 * Never throws: audit logging must not fail the mutation it accompanies.
 * No-ops silently when there's no actor or the actor's organization can't be
 * resolved — the mutation still succeeds, just unaudited (e.g. a connector's
 * own sync writes log through lib/integrations/sync.ts's own actorless path).
 */
export async function logAudit(entry: {
  entityType: 'work_item' | 'task' | 'code_plan' | 'asset' | 'product' | 'release' | 'asset_dependency' | 'integration'
  entityId: string
  event: string
  actor?: ArtifactActor
  payload?: Record<string, unknown>
}) {
  if (!entry.actor?.id) return
  try {
    const profile = await db.query.users.findFirst({ where: eq(users.id, entry.actor.id) })
    if (!profile?.organizationId) return
    await db.insert(syncLog).values({
      organizationId: profile.organizationId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      event: entry.event,
      actorId: entry.actor.id,
      payload: entry.payload ?? {},
    })
  } catch (err) {
    console.error('[audit] log failed:', err)
  }
}

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
      ...createdBy({ id: userId }),
      creatorId: userId,
    })
    .returning()
  await logAudit({ entityType: 'product', entityId: product.id, event: 'created', actor: { id: userId }, payload: { name: product.name } })
  return product
}

type UpdateProductData = Partial<Pick<CreateProductData, 'name' | 'description' | 'tags'>>

export async function updateProduct(id: string, data: UpdateProductData, userId: string) {
  const [product] = await db
    .update(products)
    .set({ ...data, ...editedBy({ id: userId }), updatedAt: new Date() })
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning()
  if (product) await logAudit({ entityType: 'product', entityId: product.id, event: 'updated', actor: { id: userId }, payload: { name: product.name } })
  return product ?? null
}

export async function deleteProduct(id: string, userId: string) {
  const [deleted] = await db
    .delete(products)
    .where(and(eq(products.id, id), eq(products.creatorId, userId)))
    .returning({ id: products.id, name: products.name })
  if (deleted) await logAudit({ entityType: 'product', entityId: deleted.id, event: 'deleted', actor: { id: userId }, payload: { name: deleted.name } })
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
  /** Free text; conventional taxonomy in layers-and-boundaries-spec §3. */
  layer?: string
}

export async function createAsset(data: CreateAssetData, actor?: ArtifactActor) {
  // Idempotent by (product, name) so agent re-runs can't duplicate assets.
  const existing = await db.query.assets.findFirst({
    where: and(eq(assets.productId, data.productId), eq(assets.name, data.name)),
  })
  if (existing) return existing
  const [asset] = await db.insert(assets).values({ ...data, ...createdBy(actor) }).returning()
  await logAudit({ entityType: 'asset', entityId: asset.id, event: 'created', actor, payload: { name: asset.name } })
  return asset
}

type UpdateAssetData = Partial<Omit<CreateAssetData, 'productId' | 'layer'> & {
  health: 'healthy' | 'warning' | 'critical'
  status: 'active' | 'deprecated' | 'planned'
  techDebtScore: number
  notes: string
  /** null clears the explicit layer (the type default takes over). */
  layer: string | null
}>

export async function updateAsset(id: string, data: UpdateAssetData, actor?: ArtifactActor) {
  const [asset] = await db
    .update(assets)
    .set({ ...data, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  if (asset) await logAudit({ entityType: 'asset', entityId: asset.id, event: 'updated', actor, payload: { name: asset.name } })
  return asset ?? null
}

/**
 * Hard delete. Not called by the normal UI/MCP path — archiveAsset is the
 * user-facing "delete" action (spec "Deletion & Cascade Design for Core
 * Entities", Phase 3). Kept for a possible future admin-only purge of
 * genuinely empty/orphaned assets.
 */
export async function deleteAsset(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(assets)
    .where(eq(assets.id, id))
    .returning({ id: assets.id, name: assets.name })
  if (deleted) {
    await db.delete(specLinks).where(and(eq(specLinks.targetType, 'asset'), eq(specLinks.targetId, id)))
    await logAudit({ entityType: 'asset', entityId: deleted.id, event: 'deleted', actor, payload: { name: deleted.name } })
  }
  return deleted ?? null
}

/**
 * Soft-delete tombstone — the asset row is kept, just hidden from default
 * views (see the isNull(assets.archivedAt) filters in lib/db/queries.ts).
 * Idempotent: archiving an already-archived asset just updates who/when.
 */
export async function archiveAsset(id: string, reason?: string, actor?: ArtifactActor) {
  const existing = await db.query.assets.findFirst({ where: eq(assets.id, id) })
  if (!existing) return null
  const [archived] = await db
    .update(assets)
    .set({
      archivedAt: new Date(),
      archivedById: actor?.id ?? null,
      archivedByKind: actor ? (actor.kind ?? 'user') : null,
      updatedAt: new Date(),
      ...(reason ? { notes: `${existing.notes ? existing.notes + '\n\n' : ''}**Archived:** ${reason}` } : {}),
    })
    .where(eq(assets.id, id))
    .returning()
  if (archived) await logAudit({ entityType: 'asset', entityId: archived.id, event: 'archived', actor, payload: { name: archived.name } })
  return archived ?? null
}

export async function restoreAsset(id: string, actor?: ArtifactActor) {
  const [restored] = await db
    .update(assets)
    .set({ archivedAt: null, archivedById: null, archivedByKind: null, updatedAt: new Date() })
    .where(eq(assets.id, id))
    .returning()
  if (restored) await logAudit({ entityType: 'asset', entityId: restored.id, event: 'restored', actor, payload: { name: restored.name } })
  return restored ?? null
}

/** Replace the full owner set for an asset. */
export async function setAssetOwners(assetId: string, userIds: string[], actor?: ArtifactActor) {
  await db.delete(assetOwners).where(eq(assetOwners.assetId, assetId))
  const unique = [...new Set(userIds)]
  if (unique.length > 0) {
    await db.insert(assetOwners).values(unique.map((userId) => ({ assetId, userId, ...createdBy(actor) })))
  }
}

/**
 * Move an asset to another product (layers-and-boundaries-spec §5).
 * Blocked while draft/active plans target the asset (a silent move would
 * falsify them — retarget or complete first). Work items follow the asset;
 * history (release stamps, completed-plan links, capabilities, design log)
 * is deliberately left untouched. Access is validated at the caller layer.
 */
export async function moveAsset(assetId: string, targetProductId: string, actor?: ArtifactActor) {
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) })
  if (!asset) return { error: 'Asset not found' as const }
  if (asset.productId === targetProductId) return { asset, moved: false as const }
  const target = await db.query.products.findFirst({ where: eq(products.id, targetProductId) })
  if (!target) return { error: 'Target product not found' as const }

  const blockingPlans = await db
    .select({ id: codePlans.id, title: codePlans.title, status: codePlans.status })
    .from(codePlanAssets)
    .innerJoin(codePlans, eq(codePlanAssets.codePlanId, codePlans.id))
    .where(and(eq(codePlanAssets.assetId, assetId), inArray(codePlans.status, ['draft', 'active'])))
  if (blockingPlans.length > 0) {
    return {
      error: 'Blocked by open plans targeting this asset — retarget or complete them, then retry' as const,
      blockingPlans,
    }
  }

  const itemIds = (await db.select({ id: workItems.id }).from(workItems).where(eq(workItems.assetId, assetId))).map((r) => r.id)
  const linkedSpecs = await db.select({ id: specLinks.id }).from(specLinks).where(or(
    and(eq(specLinks.targetType, 'asset'), eq(specLinks.targetId, assetId)),
    itemIds.length ? and(eq(specLinks.targetType, 'work_item'), inArray(specLinks.targetId, itemIds)) : undefined,
  ))
  if (linkedSpecs.length) return { error: 'Unlink specs from this asset and its work items before moving products' as const }

  const [moved] = await db
    .update(assets)
    .set({ productId: targetProductId, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(assets.id, assetId))
    .returning()
  await db.update(workItems).set({ productId: targetProductId, ...editedBy(actor), updatedAt: new Date() }).where(eq(workItems.assetId, assetId))
  await logAudit({ entityType: 'asset', entityId: assetId, event: 'moved', actor, payload: { name: asset.name, fromProductId: asset.productId, toProductId: targetProductId } })
  return { asset: moved, moved: true as const }
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
  ownerId?: string | null
}

// codePlanAssets is the source of truth for plan↔asset links (the deprecated
// array column was dropped in v0.3.0). Plan assignees aren't a stored link at
// all — see getCodePlan/getCodePlans, which derive them from task.assigneeId.

async function syncPlanAssets(planId: string, assetIds: string[], actor?: ArtifactActor) {
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
      await logAudit({ entityType: 'code_plan', entityId: planId, event: 'asset_removed', actor, payload: { assetId: r.assetId } })
    }
  }
  const toAdd = assetIds.filter((id) => !current.has(id))
  if (toAdd.length > 0) {
    await db.insert(codePlanAssets).values(toAdd.map((assetId) => ({ codePlanId: planId, assetId })))
    for (const assetId of toAdd) await logAudit({ entityType: 'code_plan', entityId: planId, event: 'asset_added', actor, payload: { assetId } })
  }
}

export async function createCodePlan(data: CreateCodePlanData, userId: string, actorKind: 'user' | 'agent' = 'user') {
  const { targetAssetIds, ...columns } = data
  const actor = { id: userId, kind: actorKind }
  const [plan] = await db
    .insert(codePlans)
    .values({
      ...columns,
      ...createdBy(actor), creatorId: userId,
      status: 'draft',
    })
    .returning()
  await syncPlanAssets(plan.id, targetAssetIds, actor)
  await logAudit({ entityType: 'code_plan', entityId: plan.id, event: 'created', actor, payload: { title: plan.title } })
  return plan
}

type UpdateCodePlanData = Partial<
  Omit<CreateCodePlanData, 'productId'> & {
    status: 'draft' | 'active' | 'completed' | 'cancelled'
  }
>

export async function updateCodePlan(id: string, data: UpdateCodePlanData, actor?: ArtifactActor) {
  const { targetAssetIds, ...columns } = data
  const [plan] = await db
    .update(codePlans)
    .set({ ...columns, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(codePlans.id, id))
    .returning()
  if (!plan) return null
  if (targetAssetIds !== undefined) {
    await syncPlanAssets(id, targetAssetIds, actor)
    await refreshSpecAssetLinks('code_plan', id)
  }
  const event =
    data.status === 'active' ? 'activated'
    : data.status === 'completed' ? 'completed'
    : data.status === 'cancelled' ? 'cancelled'
    : 'updated'
  await logAudit({ entityType: 'code_plan', entityId: plan.id, event, actor, payload: { title: plan.title } })
  return plan
}

/**
 * Authorization (creator or org owner/admin — see lib/db/authz.ts
 * canDeleteCodePlan) must be checked by the caller before calling this; it
 * used to filter by creatorId here, which blocked the owner/admin override
 * the unified delete-authorization rule now requires.
 */
export async function deleteCodePlan(id: string, actorId: string) {
  const [deleted] = await db
    .delete(codePlans)
    .where(eq(codePlans.id, id))
    .returning({ id: codePlans.id, title: codePlans.title })
  if (deleted) {
    await db.delete(specLinks).where(and(eq(specLinks.targetType, 'code_plan'), eq(specLinks.targetId, id)))
    await logAudit({ entityType: 'code_plan', entityId: deleted.id, event: 'deleted', actor: { id: actorId }, payload: { title: deleted.title } })
  }
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
  startDate?: string
  endDate?: string
  estimatedEffort?: number
}

export async function createTask(data: CreateTaskData, actor?: ArtifactActor) {
  // Idempotent by (plan, title) so agent re-runs can't duplicate tasks.
  const existing = await db.query.tasks.findFirst({
    where: and(eq(tasks.codePlanId, data.codePlanId), eq(tasks.title, data.title)),
  })
  if (existing) return existing
  const [task] = await db.insert(tasks).values({ ...data, ...createdBy(actor) }).returning()
  await logAudit({ entityType: 'task', entityId: task.id, event: 'created', actor, payload: { title: task.title } })
  return task
}

type UpdateTaskData = Partial<Omit<CreateTaskData, 'codePlanId' | 'assigneeId'> & {
  status: 'not_started' | 'in_progress' | 'done'
  actualEffort: number
  percentComplete: number
  assigneeId: string | null
}>

export async function updateTask(id: string, data: UpdateTaskData, actor?: ArtifactActor) {
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
    .set({ ...patch, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (task) await logAudit({ entityType: 'task', entityId: task.id, event: 'updated', actor, payload: { title: task.title } })
  return task ?? null
}

export async function updateTaskStatus(id: string, status: 'not_started' | 'in_progress' | 'done', actor?: ArtifactActor) {
  const existing = await db.query.tasks.findFirst({ where: eq(tasks.id, id) })
  if (!existing) return null
  // Status is mirrored — close/reopen the issue in the external tracker instead.
  if (existing.source !== 'native') return null

  const [task] = await db
    .update(tasks)
    .set({ status, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (task) {
    await logAudit({
      entityType: 'task',
      entityId: task.id,
      event: status === 'done' ? 'completed' : 'status_changed',
      actor,
      payload: { title: task.title, status },
    })
  }
  return task ?? null
}

/** Re-home a task on another plan (e.g. deferred to a later iteration). */
export async function moveTaskToPlan(id: string, codePlanId: string, actor?: ArtifactActor) {
  const [task] = await db
    .update(tasks)
    .set({ codePlanId, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(tasks.id, id))
    .returning()
  if (task) await logAudit({ entityType: 'task', entityId: task.id, event: 'moved', actor, payload: { title: task.title, codePlanId } })
  return task ?? null
}

export async function deleteTask(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(tasks)
    .where(eq(tasks.id, id))
    .returning({ id: tasks.id, title: tasks.title })
  if (deleted) await logAudit({ entityType: 'task', entityId: deleted.id, event: 'deleted', actor, payload: { title: deleted.title } })
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

export async function linkPlanToExternalScope(planId: string, data: LinkPlanScopeData, actor?: ArtifactActor) {
  const [plan] = await db
    .update(codePlans)
    .set({
      source: data.provider as typeof codePlans.$inferSelect.source,
      connectionId: data.connectionId,
      externalId: data.externalId,
      externalKey: data.externalKey ?? null,
      externalUrl: data.externalUrl ?? null,
      ...editedBy(actor), updatedAt: new Date(),
    })
    .where(eq(codePlans.id, planId))
    .returning()
  if (plan) await logAudit({ entityType: 'code_plan', entityId: plan.id, event: 'linked_external_scope', actor, payload: { scopeTitle: data.externalKey } })
  return plan ?? null
}

/**
 * Detach a plan from its external scope. Already-mirrored tasks are converted
 * to native so they stay editable and are no longer touched by sync.
 */
export async function unlinkPlanFromExternalScope(planId: string, actor?: ArtifactActor) {
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
      ...editedBy(actor), updatedAt: new Date(),
    })
    .where(eq(codePlans.id, planId))
    .returning()
  if (plan) await logAudit({ entityType: 'code_plan', entityId: plan.id, event: 'unlinked_external_scope', actor })
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
  ownerId?: string | null
  tags: string[]
}

export async function createWorkItem(data: CreateWorkItemData, userId: string, actorKind: 'user' | 'agent' = 'user') {
  const actor = { id: userId, kind: actorKind }
  const [item] = await db
    .insert(workItems)
    .values({ ...data, ...createdBy(actor), reporterId: userId })
    .returning()
  await logAudit({ entityType: 'work_item', entityId: item.id, event: 'created', actor, payload: { title: item.title, type: item.type } })
  return item
}

type UpdateWorkItemData = Partial<
  Omit<CreateWorkItemData, 'productId' | 'assetId' | 'area'> & {
    status: WorkItemStatus
    assetId: string | null
    area: string | null
  }
>

export async function updateWorkItem(id: string, data: UpdateWorkItemData, actor?: ArtifactActor) {
  const existing = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  if (!existing) return null

  // Mirrored items: the external tracker owns title/description/status/type/tags.
  // Only the native annotation fields may be edited locally.
  const patch: UpdateWorkItemData =
    existing.source !== 'native'
      ? { assetId: data.assetId, area: data.area, severity: data.severity, ownerId: data.ownerId }
      : data

  const [item] = await db
    .update(workItems)
    .set({ ...patch, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning()
  if (item && patch.assetId !== undefined) await refreshSpecAssetLinks('work_item', id)
  if (item) await logAudit({ entityType: 'work_item', entityId: item.id, event: 'updated', actor, payload: { title: item.title } })
  return item ?? null
}

export async function updateWorkItemStatus(id: string, status: WorkItemStatus, actor?: ArtifactActor) {
  const existing = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  if (!existing) return null
  // Status is a mirrored field — change it in the external tracker instead.
  if (existing.source !== 'native') return null

  const [item] = await db
    .update(workItems)
    .set({ status, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning()
  if (item) await logAudit({ entityType: 'work_item', entityId: item.id, event: 'status_changed', actor, payload: { title: item.title, status } })
  return item ?? null
}

export async function deleteWorkItem(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(workItems)
    .where(eq(workItems.id, id))
    .returning({ id: workItems.id, title: workItems.title })
  if (deleted) {
    await db.delete(specLinks).where(and(eq(specLinks.targetType, 'work_item'), eq(specLinks.targetId, id)))
    await logAudit({ entityType: 'work_item', entityId: deleted.id, event: 'deleted', actor, payload: { title: deleted.title } })
  }
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Plan assets (per-asset branch/PR tracking)
// ---------------------------------------------------------------------------
// Note: the deprecated code_plans.target_asset_ids array is not maintained by
// these mutations — the join table is the sole source of truth going forward.

export async function addPlanAsset(codePlanId: string, assetId: string, actor?: ArtifactActor) {
  const existing = await db.query.codePlanAssets.findFirst({
    where: and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)),
  })
  if (existing) return existing
  const [row] = await db.insert(codePlanAssets).values({ codePlanId, assetId }).returning()
  await refreshSpecAssetLinks('code_plan', codePlanId)
  await logAudit({ entityType: 'code_plan', entityId: codePlanId, event: 'asset_added', actor, payload: { assetId } })
  return row
}

export async function removePlanAsset(codePlanId: string, assetId: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(codePlanAssets)
    .where(and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)))
    .returning({ id: codePlanAssets.id })
  if (deleted) await logAudit({ entityType: 'code_plan', entityId: codePlanId, event: 'asset_removed', actor, payload: { assetId } })
  return deleted ?? null
}

type UpdatePlanAssetData = Partial<{
  branch: string | null
  prUrl: string | null
  prStatus: 'none' | 'draft' | 'open' | 'merged' | 'closed'
  notes: string | null
}>

export async function updatePlanAsset(codePlanId: string, assetId: string, data: UpdatePlanAssetData, actor?: ArtifactActor) {
  const [row] = await db
    .update(codePlanAssets)
    .set({ ...data, updatedAt: new Date() })
    .where(and(eq(codePlanAssets.codePlanId, codePlanId), eq(codePlanAssets.assetId, assetId)))
    .returning()
  if (row) await logAudit({ entityType: 'code_plan', entityId: codePlanId, event: 'asset_updated', actor, payload: { assetId, prStatus: data.prStatus } })
  return row ?? null
}

export async function linkWorkItemToPlan(workItemId: string, codePlanId: string, actor?: ArtifactActor) {
  const existing = await db.query.workItemCodePlans.findFirst({
    where: and(
      eq(workItemCodePlans.workItemId, workItemId),
      eq(workItemCodePlans.codePlanId, codePlanId),
    ),
  })
  if (existing) return existing
  const [link] = await db
    .insert(workItemCodePlans)
    .values({ workItemId, codePlanId, ...createdBy(actor) })
    .returning()
  await refreshSpecAssetLinks('work_item', workItemId)
  await logAudit({ entityType: 'work_item', entityId: workItemId, event: 'linked_to_plan', actor, payload: { codePlanId } })
  return link
}

export async function unlinkWorkItemFromPlan(workItemId: string, codePlanId: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(workItemCodePlans)
    .where(
      and(
        eq(workItemCodePlans.workItemId, workItemId),
        eq(workItemCodePlans.codePlanId, codePlanId),
      ),
    )
    .returning({ id: workItemCodePlans.id })
  if (deleted) await logAudit({ entityType: 'work_item', entityId: workItemId, event: 'unlinked_from_plan', actor, payload: { codePlanId } })
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

export async function createAssetDependency(data: CreateAssetDependencyData, actor?: ArtifactActor) {
  if (data.sourceAssetId === data.targetAssetId) return null
  const existing = await db.query.assetDependencies.findFirst({
    where: and(
      eq(assetDependencies.sourceAssetId, data.sourceAssetId),
      eq(assetDependencies.targetAssetId, data.targetAssetId),
      eq(assetDependencies.dependencyType, data.dependencyType),
    ),
  })
  if (existing) return existing
  const [row] = await db.insert(assetDependencies).values({ ...data, ...createdBy(actor) }).returning()
  await logAudit({ entityType: 'asset_dependency', entityId: row.id, event: 'created', actor, payload: data })
  return row
}

export async function deleteAssetDependency(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(assetDependencies)
    .where(eq(assetDependencies.id, id))
    .returning({ id: assetDependencies.id, sourceAssetId: assetDependencies.sourceAssetId, targetAssetId: assetDependencies.targetAssetId })
  if (deleted) await logAudit({ entityType: 'asset_dependency', entityId: deleted.id, event: 'deleted', actor, payload: deleted })
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

export async function createIntegration(data: CreateIntegrationData, actor?: ArtifactActor) {
  const { token, ...columns } = data
  let tokenEncrypted: string | undefined
  if (token) {
    const { encryptToken } = await import('@/lib/integrations/secrets')
    tokenEncrypted = encryptToken(token)
  }
  const [row] = await db.insert(integrations).values({ ...columns, tokenEncrypted }).returning()
  await logAudit({ entityType: 'integration', entityId: row.id, event: 'created', actor, payload: { name: row.name, provider: row.provider } })
  return row
}

type UpdateIntegrationData = {
  name?: string
  authRef?: string | null
  /** New token to encrypt and store; undefined = keep existing credential. */
  token?: string
  config?: Record<string, unknown>
}

export async function updateIntegration(id: string, data: UpdateIntegrationData, actor?: ArtifactActor) {
  const { token, ...columns } = data
  const patch: Record<string, unknown> = { ...columns }
  if (token) {
    const { encryptToken } = await import('@/lib/integrations/secrets')
    patch.tokenEncrypted = encryptToken(token)
  }
  const [row] = await db.update(integrations).set(patch).where(eq(integrations.id, id)).returning()
  if (row) await logAudit({ entityType: 'integration', entityId: row.id, event: 'updated', actor, payload: { name: row.name } })
  return row ?? null
}

export async function deleteIntegration(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(integrations)
    .where(eq(integrations.id, id))
    .returning({ id: integrations.id, name: integrations.name })
  if (deleted) await logAudit({ entityType: 'integration', entityId: deleted.id, event: 'deleted', actor, payload: { name: deleted.name } })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Releases (releases-and-asset-history-spec.md, Phase B)
// ---------------------------------------------------------------------------

type CreateReleaseData = {
  productId: string
  name: string
  description?: string
  tags?: string[]
}

export async function createRelease(data: CreateReleaseData, userId: string, actorKind: 'user' | 'agent' = 'user') {
  const actor = { id: userId, kind: actorKind }
  const [release] = await db
    .insert(releases)
    .values({ ...data, ...createdBy(actor), creatorId: userId, status: 'planned' })
    .returning()
  await logAudit({ entityType: 'release', entityId: release.id, event: 'created', actor, payload: { name: release.name } })
  return release
}

type UpdateReleaseData = Partial<{
  name: string
  description: string
  tags: string[]
  status: ReleaseStatus
}>

export async function updateRelease(id: string, data: UpdateReleaseData, actor?: ArtifactActor) {
  const patch: Record<string, unknown> = { ...data, ...editedBy(actor), updatedAt: new Date() }
  // shippedAt tracks the status transition, not a separate edit.
  if (data.status === 'shipped') patch.shippedAt = new Date()
  if (data.status && data.status !== 'shipped') patch.shippedAt = null
  const [release] = await db.update(releases).set(patch).where(eq(releases.id, id)).returning()
  if (release) {
    const event = data.status === 'shipped' ? 'shipped' : data.status ? 'status_changed' : 'updated'
    await logAudit({ entityType: 'release', entityId: release.id, event, actor, payload: { name: release.name, status: data.status } })
  }
  return release ?? null
}

export async function deleteRelease(id: string, actor?: ArtifactActor) {
  // code_plans.releaseId is ON DELETE SET NULL — plans are detached, never deleted.
  const [deleted] = await db.delete(releases).where(eq(releases.id, id)).returning({ id: releases.id, name: releases.name })
  if (deleted) await logAudit({ entityType: 'release', entityId: deleted.id, event: 'deleted', actor, payload: { name: deleted.name } })
  return deleted ?? null
}

export async function attachPlanToRelease(codePlanId: string, releaseId: string, actor?: ArtifactActor) {
  const [plan] = await db
    .update(codePlans)
    .set({ releaseId, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(codePlans.id, codePlanId))
    .returning()
  if (plan) await logAudit({ entityType: 'release', entityId: releaseId, event: 'plan_attached', actor, payload: { planId: codePlanId, planTitle: plan.title } })
  return plan ?? null
}

export async function detachPlanFromRelease(codePlanId: string, actor?: ArtifactActor) {
  const existing = await db.query.codePlans.findFirst({ where: eq(codePlans.id, codePlanId) })
  const [plan] = await db
    .update(codePlans)
    .set({ releaseId: null, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(codePlans.id, codePlanId))
    .returning()
  if (plan && existing?.releaseId) await logAudit({ entityType: 'release', entityId: existing.releaseId, event: 'plan_detached', actor, payload: { planId: codePlanId, planTitle: plan.title } })
  return plan ?? null
}

type SetReleaseAssetData = { version?: string | null; notes?: string | null }

/** Upsert the per-asset version stamp on a release. */
export async function setReleaseAsset(releaseId: string, assetId: string, data: SetReleaseAssetData = {}, actor?: ArtifactActor) {
  const existing = await db.query.releaseAssets.findFirst({
    where: and(eq(releaseAssets.releaseId, releaseId), eq(releaseAssets.assetId, assetId)),
  })
  let row
  if (existing) {
    ;[row] = await db
      .update(releaseAssets)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(releaseAssets.id, existing.id))
      .returning()
  } else {
    ;[row] = await db
      .insert(releaseAssets)
      .values({ releaseId, assetId, version: data.version ?? null, notes: data.notes ?? null })
      .returning()
  }
  if (row && data.version) await logAudit({ entityType: 'release', entityId: releaseId, event: 'asset_versioned', actor, payload: { assetId, version: data.version } })
  return row
}

export async function removeReleaseAsset(releaseId: string, assetId: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(releaseAssets)
    .where(and(eq(releaseAssets.releaseId, releaseId), eq(releaseAssets.assetId, assetId)))
    .returning({ id: releaseAssets.id })
  if (deleted) await logAudit({ entityType: 'release', entityId: releaseId, event: 'asset_removed', actor, payload: { assetId } })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Asset design log (releases-and-asset-history-spec.md, Phase C)
// ---------------------------------------------------------------------------

type CreateDesignNoteData = {
  assetId: string
  title: string
  body?: string
  releaseId?: string
  codePlanId?: string
  revisesSpecId?: string
  revisedSpecBody?: string
  expectedSpecVersion?: number
  authorKind?: 'user' | 'agent'
  authorId?: string
}

export async function createDesignNote(data: CreateDesignNoteData) {
  const { revisesSpecId, revisedSpecBody, expectedSpecVersion, ...noteData } = data
  if (!!revisesSpecId !== (revisedSpecBody !== undefined)) throw new Error('A spec revision requires revisesSpecId and revisedSpecBody')
  const actor = data.authorId ? { id: data.authorId, kind: data.authorKind } : undefined
  const result = await db.transaction(async (tx) => {
    if (revisesSpecId) {
      const spec = await requireSpec(revisesSpecId, tx)
      const links = await tx.select().from(specLinks).where(eq(specLinks.specId, spec.id))
      if (!(await specAssetAnchors(spec, links, tx)).some((a) => a.assetId === data.assetId)) {
        throw new Error('The revised spec must be linked to this asset')
      }
    }
    const [note] = await tx.insert(assetDesignLog).values({ ...noteData, ...createdBy(actor), authorKind: data.authorKind ?? 'user' }).returning()
    const revision = revisesSpecId ? await reviseSpec(tx, revisesSpecId, { body: revisedSpecBody!, expectedVersion: expectedSpecVersion }, note.id, actor) : undefined
    return { ...note, specEventId: revision?.events.find((e) => e.assetId === note.assetId)?.id }
  })
  await logAudit({ entityType: 'asset', entityId: data.assetId, event: 'design_note_added', actor, payload: { title: result.title } })
  return result
}

type UpdateDesignNoteData = Partial<Pick<CreateDesignNoteData, 'title' | 'body' | 'releaseId' | 'codePlanId'>>

export async function updateDesignNote(id: string, data: UpdateDesignNoteData, actor?: ArtifactActor) {
  const [note] = await db
    .update(assetDesignLog)
    .set({ ...data, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(assetDesignLog.id, id))
    .returning()
  if (note) await logAudit({ entityType: 'asset', entityId: note.assetId, event: 'design_note_updated', actor, payload: { title: note.title } })
  return note ?? null
}

export async function deleteDesignNote(id: string, actor?: ArtifactActor) {
  const [deleted] = await db
    .delete(assetDesignLog)
    .where(eq(assetDesignLog.id, id))
    .returning({ id: assetDesignLog.id, assetId: assetDesignLog.assetId, title: assetDesignLog.title })
  if (deleted) await logAudit({ entityType: 'asset', entityId: deleted.assetId, event: 'design_note_deleted', actor, payload: { title: deleted.title } })
  return deleted ?? null
}

// ---------------------------------------------------------------------------
// Asset capabilities (asset-record-spec.md, Phase A)
// ---------------------------------------------------------------------------

/**
 * Graduate a resolved feature/enhancement work item into its asset's record.
 * Captures the lineage chain (work item → first linked plan → that plan's
 * release) as FKs plus originSummary text that survives FK nulling. Idempotent
 * per work item (partial unique index on originWorkItemId).
 */
export async function graduateWorkItem(workItemId: string, sourceSpecId?: string, actor?: ArtifactActor) {
  const result = await db.transaction(async (tx) => {
    const item = await tx.query.workItems.findFirst({ where: eq(workItems.id, workItemId) })
    if (!item) return { error: 'Work item not found' as const }
    if (item.status !== 'resolved') return { error: 'Only resolved work items graduate' as const }
    if (item.type !== 'feature' && item.type !== 'enhancement') {
      return { error: 'Only feature and enhancement items graduate — bugs and debt stay in their registers' as const }
    }
    if (!item.assetId) return { error: 'Work item has no asset — set one before graduating' as const }

    const existing = await tx.query.assetCapabilities.findFirst({
      where: eq(assetCapabilities.originWorkItemId, workItemId),
    })
    if (existing) return { capability: existing, existed: true as const }

    const linkedSpecs = await tx.select({ spec: specs }).from(specLinks)
      .innerJoin(specs, eq(specLinks.specId, specs.id))
      .where(and(eq(specLinks.targetType, 'work_item'), eq(specLinks.targetId, workItemId), eq(specs.productId, item.productId)))
    if (!sourceSpecId && linkedSpecs.length > 1) return { error: 'Multiple specs are linked; choose sourceSpecId explicitly' as const }
    const sourceSpec = sourceSpecId ? linkedSpecs.find((r) => r.spec.id === sourceSpecId)?.spec : linkedSpecs[0]?.spec
    if (sourceSpecId && !sourceSpec) return { error: 'sourceSpecId must be linked to this work item in its product' as const }

    const link = await tx.query.workItemCodePlans.findFirst({
      where: eq(workItemCodePlans.workItemId, workItemId),
    })
    const plan = link
      ? await tx.query.codePlans.findFirst({ where: eq(codePlans.id, link.codePlanId) })
      : undefined
    const release = plan?.releaseId
      ? await tx.query.releases.findFirst({ where: eq(releases.id, plan.releaseId) })
      : undefined
    const stamp = release && item.assetId
      ? await tx.query.releaseAssets.findFirst({
          where: and(eq(releaseAssets.releaseId, release.id), eq(releaseAssets.assetId, item.assetId)),
        })
      : undefined

    const summaryParts = [`WI: ${item.title}`]
    if (plan) summaryParts.push(`Plan: ${plan.title}`)
    if (release) summaryParts.push(stamp?.version ? `${release.name} (${stamp.version})` : release.name)

    const [capability] = await tx
      .insert(assetCapabilities)
      .values({
        ...createdBy(actor),
        assetId: item.assetId,
        title: item.title,
        description: item.description,
        area: item.area ?? undefined,
        source: 'graduated',
        sourceSpecId: sourceSpec?.id,
        sourceSpecVersion: sourceSpec?.version,
        originWorkItemId: item.id,
        originCodePlanId: plan?.id,
        originReleaseId: release?.id,
        originSummary: summaryParts.join(' · '),
      })
      .onConflictDoNothing()
      .returning()
    if (!capability) {
      const existing = await tx.query.assetCapabilities.findFirst({ where: eq(assetCapabilities.originWorkItemId, workItemId) })
      if (!existing) throw new Error('Graduation conflicted; retry')
      return { capability: existing, existed: true as const }
    }
    return { capability, existed: false as const }
  })
  if (!('error' in result) && !result.existed) {
    await logAudit({ entityType: 'asset', entityId: result.capability.assetId, event: 'capability_graduated', actor, payload: { title: result.capability.title } })
  }
  return result
}

type UpdateCapabilityData = Partial<{ title: string; description: string; area: string | null }>

export async function updateCapability(id: string, data: UpdateCapabilityData, actor?: ArtifactActor) {
  const [row] = await db
    .update(assetCapabilities)
    .set({ ...data, ...editedBy(actor), updatedAt: new Date() })
    .where(eq(assetCapabilities.id, id))
    .returning()
  if (row) await logAudit({ entityType: 'asset', entityId: row.assetId, event: 'capability_updated', actor, payload: { title: row.title } })
  return row ?? null
}

/** Tombstone, not delete — "used to do X" is record too. */
export async function removeCapability(id: string, reason?: string, actor?: ArtifactActor) {
  const existing = await db.query.assetCapabilities.findFirst({ where: eq(assetCapabilities.id, id) })
  if (!existing) return null
  const [row] = await db
    .update(assetCapabilities)
    .set({
      status: 'removed',
      removedAt: new Date(),
      ...editedBy(actor), updatedAt: new Date(),
      ...(reason ? { description: `${existing.description ? existing.description + '\n\n' : ''}**Removed:** ${reason}` } : {}),
    })
    .where(eq(assetCapabilities.id, id))
    .returning()
  if (row) await logAudit({ entityType: 'asset', entityId: row.assetId, event: 'capability_removed', actor, payload: { title: row.title } })
  return row
}
