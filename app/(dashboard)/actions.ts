'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizationMembers, emailVerificationTokens, workItems, syncLog } from '@/lib/db/schema'
import { eq, and, gt } from 'drizzle-orm'
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
  addPlanAsset,
  removePlanAsset,
  updatePlanAsset,
  createWorkItem,
  updateWorkItem,
  updateWorkItemStatus,
  deleteWorkItem,
  linkWorkItemToPlan,
  unlinkWorkItemFromPlan,
  createAssetDependency,
  deleteAssetDependency,
  createIntegration,
  deleteIntegration,
  linkPlanToExternalScope,
  unlinkPlanFromExternalScope,
} from '@/lib/db/mutations'
import type { UserRole, WorkItemType, WorkItemStatus, WorkItemSeverity } from '@/lib/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function parseTags(raw: string): string[] {
  return raw
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean)
}

async function requireUser() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')
  return authUser
}

async function getUserProfile(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId) })
}

/**
 * Append an event to sync_log — the activity stream. Never throws: activity
 * logging must not fail the mutation it accompanies.
 */
async function logActivity(entry: {
  entityType: 'work_item' | 'task' | 'code_plan' | 'asset' | 'product'
  entityId: string
  event: string
  actorId: string
  payload?: Record<string, unknown>
}) {
  try {
    const profile = await getUserProfile(entry.actorId)
    if (!profile?.organizationId) return
    await db.insert(syncLog).values({
      organizationId: profile.organizationId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      event: entry.event,
      actorId: entry.actorId,
      payload: entry.payload ?? {},
    })
  } catch (err) {
    console.error('[activity] log failed:', err)
  }
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProductAction(formData: FormData) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)

  const name = formData.get('name') as string
  const slugRaw = (formData.get('slug') as string) || slugify(name)
  const description = formData.get('description') as string
  const tags = parseTags(formData.get('tags') as string)

  const product = await createProduct(
    {
      name,
      slug: slugRaw,
      description,
      tags,
      organizationId: profile?.organizationId ?? undefined,
    },
    authUser.id,
  )

  await logActivity({
    entityType: 'product',
    entityId: product.id,
    event: 'created',
    actorId: authUser.id,
    payload: { name: product.name },
  })
  redirect(`/products/${product.slug}`)
}

export async function updateProductAction(id: string, formData: FormData) {
  const authUser = await requireUser()

  const name = formData.get('name') as string
  const description = formData.get('description') as string
  const tags = parseTags(formData.get('tags') as string)
  const slug = formData.get('slug') as string

  await updateProduct(id, { name, description, tags }, authUser.id)

  revalidatePath('/products')
  redirect(`/products/${slug}`)
}

export async function deleteProductAction(id: string, slug: string) {
  const authUser = await requireUser()
  await deleteProduct(id, authUser.id)
  revalidatePath('/products')
  redirect('/products')
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export async function createAssetAction(productId: string, productSlug: string, formData: FormData) {
  const authUser = await requireUser()

  const name = formData.get('name') as string
  const type = formData.get('type') as 'app' | 'service' | 'library' | 'datastore' | 'platform'
  const description = formData.get('description') as string
  const tags = parseTags(formData.get('tags') as string)
  const repositoryUrl = (formData.get('repositoryUrl') as string) || undefined
  const repoPath = (formData.get('repoPath') as string) || undefined
  const documentationUrl = (formData.get('documentationUrl') as string) || undefined

  const asset = await createAsset({
    productId,
    name,
    type,
    description,
    tags,
    repositoryUrl,
    repoPath,
    documentationUrl,
  })
  await logActivity({
    entityType: 'asset',
    entityId: asset.id,
    event: 'created',
    actorId: authUser.id,
    payload: { name: asset.name },
  })

  revalidatePath(`/products/${productSlug}`)
}

export async function updateAssetAction(id: string, productSlug: string, formData: FormData) {
  await requireUser()

  const name = formData.get('name') as string
  const type = formData.get('type') as 'app' | 'service' | 'library' | 'datastore' | 'platform'
  const description = formData.get('description') as string
  const tags = parseTags(formData.get('tags') as string)
  const health = formData.get('health') as 'healthy' | 'warning' | 'critical'
  const techDebtRaw = formData.get('techDebtScore') as string
  const repositoryUrl = (formData.get('repositoryUrl') as string) || undefined
  const repoPath = (formData.get('repoPath') as string) || undefined
  const documentationUrl = (formData.get('documentationUrl') as string) || undefined

  await updateAsset(id, {
    name,
    type,
    description,
    tags,
    health,
    techDebtScore: techDebtRaw ? parseInt(techDebtRaw, 10) : undefined,
    repositoryUrl,
    repoPath,
    documentationUrl,
  })

  revalidatePath(`/products/${productSlug}`)
}

export async function deleteAssetAction(id: string, productSlug: string) {
  await requireUser()
  await deleteAsset(id)
  revalidatePath(`/products/${productSlug}`)
}

// ---------------------------------------------------------------------------
// Code Plans
// ---------------------------------------------------------------------------

export async function createCodePlanAction(formData: FormData) {
  const authUser = await requireUser()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const productId = formData.get('productId') as string
  const type = formData.get('type') as 'refactor' | 'feature' | 'improvement' | 'bugfix'
  const tags = parseTags(formData.get('tags') as string)
  const deadline = (formData.get('deadline') as string) || undefined
  const specUrl = (formData.get('specUrl') as string) || undefined

  const plan = await createCodePlan(
    {
      title,
      description,
      productId,
      type,
      tags,
      targetAssetIds: [],
      assigneeIds: [],
      deadline,
      specUrl,
    },
    authUser.id,
  )

  await logActivity({
    entityType: 'code_plan',
    entityId: plan.id,
    event: 'created',
    actorId: authUser.id,
    payload: { title: plan.title },
  })
  redirect(`/plans/${plan.id}`)
}

export async function updateCodePlanAction(id: string, formData: FormData) {
  await requireUser()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const type = formData.get('type') as 'refactor' | 'feature' | 'improvement' | 'bugfix'
  const tags = parseTags(formData.get('tags') as string)
  const deadline = (formData.get('deadline') as string) || undefined
  const specUrl = (formData.get('specUrl') as string) || undefined

  await updateCodePlan(id, { title, description, type, tags, deadline, specUrl })

  revalidatePath(`/plans/${id}`)
}

export async function activatePlanAction(id: string) {
  const authUser = await requireUser()
  const plan = await updateCodePlan(id, { status: 'active' })
  if (plan) {
    await logActivity({
      entityType: 'code_plan',
      entityId: id,
      event: 'activated',
      actorId: authUser.id,
      payload: { title: plan.title },
    })
  }
  revalidatePath(`/plans/${id}`)
}

export async function completePlanAction(id: string) {
  const authUser = await requireUser()
  const plan = await updateCodePlan(id, { status: 'completed' })
  if (plan) {
    await logActivity({
      entityType: 'code_plan',
      entityId: id,
      event: 'completed',
      actorId: authUser.id,
      payload: { title: plan.title },
    })
    // Write-back: comment on mirrored tracker issues linked to this plan.
    const { notifyPlanCompleted } = await import('@/lib/integrations/writeback')
    await notifyPlanCompleted(id)
  }
  revalidatePath(`/plans/${id}`)
}

export async function deleteCodePlanAction(id: string) {
  const authUser = await requireUser()
  await deleteCodePlan(id, authUser.id)
  revalidatePath('/plans')
  redirect('/plans')
}

// ---------------------------------------------------------------------------
// Plan assets (per-asset branch/PR tracking)
// ---------------------------------------------------------------------------

export async function addPlanAssetAction(codePlanId: string, assetId: string) {
  await requireUser()
  await addPlanAsset(codePlanId, assetId)
  revalidatePath(`/plans/${codePlanId}`)
}

export async function removePlanAssetAction(codePlanId: string, assetId: string) {
  await requireUser()
  await removePlanAsset(codePlanId, assetId)
  revalidatePath(`/plans/${codePlanId}`)
}

export async function updatePlanAssetAction(codePlanId: string, assetId: string, formData: FormData) {
  await requireUser()
  await updatePlanAsset(codePlanId, assetId, {
    branch: (formData.get('branch') as string) || null,
    prUrl: (formData.get('prUrl') as string) || null,
    prStatus: (formData.get('prStatus') as 'none' | 'draft' | 'open' | 'merged' | 'closed') || 'none',
    notes: (formData.get('notes') as string) || null,
  })
  revalidatePath(`/plans/${codePlanId}`)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(codePlanId: string, formData: FormData) {
  const authUser = await requireUser()

  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || ''
  const priority = (formData.get('priority') as 'low' | 'medium' | 'high' | 'critical') || 'medium'
  const tags = parseTags(formData.get('tags') as string)
  const estimatedEffortRaw = formData.get('estimatedEffort') as string
  const assigneeId = (formData.get('assigneeId') as string) || undefined
  const assetId = (formData.get('assetId') as string) || undefined

  const task = await createTask({
    codePlanId,
    title,
    description,
    priority,
    tags,
    estimatedEffort: estimatedEffortRaw ? parseFloat(estimatedEffortRaw) : undefined,
    assigneeId: assigneeId || undefined,
    assetId: assetId || undefined,
  })
  await logActivity({
    entityType: 'task',
    entityId: task.id,
    event: 'created',
    actorId: authUser.id,
    payload: { title: task.title },
  })

  revalidatePath(`/plans/${codePlanId}`)
  revalidatePath('/tasks')
}

export async function updateTaskAction(id: string, formData: FormData) {
  await requireUser()

  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || ''
  const status = formData.get('status') as 'not_started' | 'in_progress' | 'done'
  const priority = (formData.get('priority') as 'low' | 'medium' | 'high' | 'critical') || 'medium'
  const tags = parseTags(formData.get('tags') as string)
  const estimatedEffortRaw = formData.get('estimatedEffort') as string
  const actualEffortRaw = formData.get('actualEffort') as string
  const assigneeId = formData.get('assigneeId') as string

  await updateTask(id, {
    title,
    description,
    status,
    priority,
    tags,
    estimatedEffort: estimatedEffortRaw ? parseFloat(estimatedEffortRaw) : undefined,
    actualEffort: actualEffortRaw ? parseFloat(actualEffortRaw) : undefined,
    assigneeId: assigneeId === '' ? null : assigneeId,
  })

  revalidatePath('/tasks')
  revalidatePath('/plans')
}

export async function updateTaskStatusAction(id: string, status: 'not_started' | 'in_progress' | 'done') {
  const authUser = await requireUser()
  const task = await updateTaskStatus(id, status)
  if (task && status === 'done') {
    await logActivity({
      entityType: 'task',
      entityId: id,
      event: 'completed',
      actorId: authUser.id,
      payload: { title: task.title },
    })
  }
  revalidatePath('/tasks')
  revalidatePath('/plans')
}

export async function deleteTaskAction(id: string, planId: string) {
  await requireUser()
  await deleteTask(id)
  revalidatePath(`/plans/${planId}`)
  revalidatePath('/tasks')
}

// ---------------------------------------------------------------------------
// Team
// ---------------------------------------------------------------------------

export async function inviteMemberAction(formData: FormData) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)
  if (!profile?.organizationId) return { error: 'You are not part of an organization.' }

  const email = formData.get('email') as string
  const role = (formData.get('role') as UserRole) || 'editor'
  const name = (formData.get('name') as string) || email.split('@')[0]

  const tempPassword = Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2)
  const newUserId = await authAdapter.adminCreateUser(email, tempPassword, name)

  await db
    .update(users)
    .set({ organizationId: profile.organizationId, role })
    .where(eq(users.id, newUserId))

  await db.insert(organizationMembers).values({
    userId: newUserId,
    organizationId: profile.organizationId,
    role,
    joinedAt: new Date(),
  })

  revalidatePath('/team')
  return { tempPassword }
}

export async function changeMemberRoleAction(memberUserId: string, role: UserRole) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)
  if (!profile?.organizationId) return

  await db
    .update(organizationMembers)
    .set({ role })
    .where(
      and(
        eq(organizationMembers.userId, memberUserId),
        eq(organizationMembers.organizationId, profile.organizationId),
      ),
    )

  await db.update(users).set({ role }).where(eq(users.id, memberUserId))

  revalidatePath('/team')
}

export async function removeMemberAction(memberUserId: string) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)
  if (!profile?.organizationId) return

  await db
    .delete(organizationMembers)
    .where(
      and(
        eq(organizationMembers.userId, memberUserId),
        eq(organizationMembers.organizationId, profile.organizationId),
      ),
    )

  await db
    .update(users)
    .set({ organizationId: null, role: 'viewer' })
    .where(eq(users.id, memberUserId))

  revalidatePath('/team')
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function updateProfileAction(formData: FormData) {
  const authUser = await requireUser()

  const name = (formData.get('name') as string)?.trim()
  if (!name) return { error: 'Name is required.' }

  await db.update(users).set({ name }).where(eq(users.id, authUser.id))

  revalidatePath('/settings')
  return { success: true }
}

export async function requestEmailChangeAction(formData: FormData) {
  const authUser = await requireUser()

  const newEmail = (formData.get('newEmail') as string)?.trim().toLowerCase()
  if (!newEmail) return { error: 'Email is required.' }

  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(newEmail)) return { error: 'Please enter a valid email address.' }

  const profile = await getUserProfile(authUser.id)
  if (newEmail === profile?.email) return { error: 'That is already your current email address.' }

  const taken = await db.query.users.findFirst({ where: eq(users.email, newEmail) })
  if (taken) return { error: 'That email address is already in use.' }

  // Delete any existing pending token for this user (one in-flight change at a time)
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, authUser.id))

  const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

  await db.insert(emailVerificationTokens).values({
    userId: authUser.id,
    newEmail,
    token,
    expiresAt,
  })

  const { sendEmailVerificationEmail } = await import('@/lib/email')
  await sendEmailVerificationEmail(profile?.email ?? '', profile?.name ?? 'there', token, newEmail)

  return { pending: true, newEmail }
}

export async function cancelEmailChangeAction() {
  const authUser = await requireUser()
  await db
    .delete(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, authUser.id))
  revalidatePath('/settings')
  return { success: true }
}

export async function changePasswordAction(formData: FormData) {
  const authUser = await requireUser()

  const currentPassword = formData.get('currentPassword') as string
  const newPassword = formData.get('newPassword') as string
  const confirmPassword = formData.get('confirmPassword') as string

  if (newPassword !== confirmPassword) return { error: 'Passwords do not match.' }
  if (newPassword.length < 6) return { error: 'Password must be at least 6 characters.' }

  const profile = await getUserProfile(authUser.id)
  if (!profile?.passwordHash) return { error: 'Password change is not available for this account.' }

  const bcrypt = await import('bcryptjs')
  const valid = await bcrypt.compare(currentPassword, profile.passwordHash)
  if (!valid) return { error: 'Current password is incorrect.' }

  const hash = await bcrypt.hash(newPassword, 10)
  await db.update(users).set({ passwordHash: hash }).where(eq(users.id, authUser.id))

  return { success: true }
}

// ---------------------------------------------------------------------------
// Work Items
// ---------------------------------------------------------------------------

export async function createWorkItemAction(formData: FormData) {
  const authUser = await requireUser()

  const item = await createWorkItem(
    {
      productId: formData.get('productId') as string,
      assetId: (formData.get('assetId') as string) || undefined,
      area: (formData.get('area') as string) || undefined,
      type: (formData.get('type') as WorkItemType) || 'feature',
      title: formData.get('title') as string,
      description: (formData.get('description') as string) ?? '',
      severity: (formData.get('severity') as WorkItemSeverity) || 'medium',
      specUrl: (formData.get('specUrl') as string) || undefined,
      tags: parseTags((formData.get('tags') as string) ?? ''),
    },
    authUser.id,
  )

  await logActivity({
    entityType: 'work_item',
    entityId: item.id,
    event: 'created',
    actorId: authUser.id,
    payload: { title: item.title, type: item.type },
  })
  revalidatePath('/work-items')
  return { id: item.id }
}

export async function updateWorkItemAction(id: string, formData: FormData) {
  const authUser = await requireUser()

  const item = await updateWorkItem(id, {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) ?? '',
    type: (formData.get('type') as WorkItemType) || undefined,
    status: (formData.get('status') as WorkItemStatus) || undefined,
    severity: (formData.get('severity') as WorkItemSeverity) || undefined,
    assetId: (formData.get('assetId') as string) || null,
    area: (formData.get('area') as string) || null,
    specUrl: (formData.get('specUrl') as string) || undefined,
    tags: parseTags((formData.get('tags') as string) ?? ''),
  })
  if (!item) return { error: 'Work item not found.' }

  await logActivity({
    entityType: 'work_item',
    entityId: id,
    event: 'updated',
    actorId: authUser.id,
    payload: { title: item.title },
  })
  revalidatePath('/work-items')
  return { id }
}

export async function updateWorkItemStatusAction(id: string, status: WorkItemStatus) {
  const authUser = await requireUser()
  const item = await updateWorkItemStatus(id, status)
  if (item) {
    await logActivity({
      entityType: 'work_item',
      entityId: id,
      event: 'status_changed',
      actorId: authUser.id,
      payload: { title: item.title, status },
    })
  }
  revalidatePath('/work-items')
}

export async function deleteWorkItemAction(id: string) {
  const authUser = await requireUser()
  const item = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  const deleted = await deleteWorkItem(id)
  if (deleted) {
    await logActivity({
      entityType: 'work_item',
      entityId: id,
      event: 'deleted',
      actorId: authUser.id,
      payload: { title: item?.title },
    })
  }
  revalidatePath('/work-items')
}

export async function linkWorkItemToPlanAction(workItemId: string, codePlanId: string) {
  const authUser = await requireUser()
  await linkWorkItemToPlan(workItemId, codePlanId)
  await logActivity({
    entityType: 'work_item',
    entityId: workItemId,
    event: 'linked_to_plan',
    actorId: authUser.id,
    payload: { codePlanId },
  })
  revalidatePath('/work-items')
  revalidatePath(`/plans/${codePlanId}`)
}

export async function unlinkWorkItemFromPlanAction(workItemId: string, codePlanId: string) {
  const authUser = await requireUser()
  await unlinkWorkItemFromPlan(workItemId, codePlanId)
  await logActivity({
    entityType: 'work_item',
    entityId: workItemId,
    event: 'unlinked_from_plan',
    actorId: authUser.id,
    payload: { codePlanId },
  })
  revalidatePath('/work-items')
  revalidatePath(`/plans/${codePlanId}`)
}

// ---------------------------------------------------------------------------
// Asset dependencies
// ---------------------------------------------------------------------------

export async function addAssetDependencyAction(productSlug: string, formData: FormData) {
  await requireUser()
  await createAssetDependency({
    sourceAssetId: formData.get('sourceAssetId') as string,
    targetAssetId: formData.get('targetAssetId') as string,
    dependencyType:
      (formData.get('dependencyType') as 'depends_on' | 'integrates_with' | 'aggregates') ||
      'depends_on',
    description: (formData.get('description') as string) || undefined,
  })
  revalidatePath(`/products/${productSlug}`)
}

export async function removeAssetDependencyAction(id: string, productSlug: string) {
  await requireUser()
  await deleteAssetDependency(id)
  revalidatePath(`/products/${productSlug}`)
}

// ---------------------------------------------------------------------------
// Integrations
// ---------------------------------------------------------------------------

export async function createIntegrationAction(formData: FormData) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)
  if (!profile?.organizationId) return { error: 'You are not part of an organization.' }

  const provider = formData.get('provider') as string
  const name = formData.get('name') as string
  const repo = (formData.get('repo') as string) || undefined
  const baseUrl = (formData.get('baseUrl') as string) || undefined
  const authRef = (formData.get('authRef') as string) || undefined
  const productId = (formData.get('productId') as string) || undefined

  if (!productId) return { error: 'Select a target product for mirrored items.' }

  await createIntegration({
    organizationId: profile.organizationId,
    provider,
    name,
    authRef,
    config: { repo, baseUrl, productId },
  })

  revalidatePath('/integrations')
  return {}
}

export async function deleteIntegrationAction(id: string) {
  await requireUser()
  await deleteIntegration(id)
  revalidatePath('/integrations')
}

export async function syncIntegrationAction(id: string) {
  await requireUser()
  const { syncConnection } = await import('@/lib/integrations/sync')
  const result = await syncConnection(id)
  revalidatePath('/integrations')
  revalidatePath('/work-items')
  return result
}

// ---------------------------------------------------------------------------
// Plan ↔ external scope (milestone) linking
// ---------------------------------------------------------------------------

export async function listPlanScopesAction(connectionId: string) {
  await requireUser()
  const { integrations } = await import('@/lib/db/schema')
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, connectionId),
  })
  if (!integration) return { error: 'Connection not found.' }

  const { getConnector } = await import('@/lib/integrations/registry')
  const connector = getConnector(integration.provider)
  if (!connector?.listScopes) return { error: 'This provider does not support scopes.' }

  const token = integration.authRef ? process.env[integration.authRef] : undefined
  if (!token) return { error: `Auth token not found — set ${integration.authRef ?? '(unset)'}.` }

  try {
    const config = (integration.config ?? {}) as import('@/lib/integrations/types').IntegrationConfig
    const scopes = await connector.listScopes({ token }, config)
    return { scopes }
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err) }
  }
}

export async function linkPlanScopeAction(
  planId: string,
  connectionId: string,
  scopeId: string,
  scopeTitle: string,
  scopeUrl?: string,
) {
  const authUser = await requireUser()
  const { integrations } = await import('@/lib/db/schema')
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, connectionId),
  })
  if (!integration) return { error: 'Connection not found.' }

  await linkPlanToExternalScope(planId, {
    provider: integration.provider,
    connectionId,
    externalId: scopeId,
    externalKey: scopeTitle,
    externalUrl: scopeUrl,
  })
  await logActivity({
    entityType: 'code_plan',
    entityId: planId,
    event: 'linked_external_scope',
    actorId: authUser.id,
    payload: { scopeTitle },
  })

  // Pull the scope's tasks immediately for instant feedback.
  const { syncConnection } = await import('@/lib/integrations/sync')
  const result = await syncConnection(connectionId)

  revalidatePath(`/plans/${planId}`)
  revalidatePath('/tasks')
  return result
}

export async function unlinkPlanScopeAction(planId: string) {
  const authUser = await requireUser()
  await unlinkPlanFromExternalScope(planId)
  await logActivity({
    entityType: 'code_plan',
    entityId: planId,
    event: 'unlinked_external_scope',
    actorId: authUser.id,
  })
  revalidatePath(`/plans/${planId}`)
  revalidatePath('/tasks')
}

// ---------------------------------------------------------------------------
// API keys (MCP access)
// ---------------------------------------------------------------------------

export async function createApiKeyAction(formData: FormData) {
  const authUser = await requireUser()
  const { createApiKey } = await import('@/lib/mcp/auth')
  const name = (formData.get('name') as string) || 'Unnamed key'
  const scope = formData.get('scope') === 'write' ? 'write' : 'read'
  const key = await createApiKey(authUser.id, name, scope)
  revalidatePath('/settings')
  return key // plaintext shown once in the UI, never again
}

export async function revokeApiKeyAction(id: string) {
  const authUser = await requireUser()
  const { revokeApiKey } = await import('@/lib/mcp/auth')
  await revokeApiKey(id, authUser.id)
  revalidatePath('/settings')
}

// Narrow row-level edits (inline list editing)
export async function updateTaskPriorityAction(id: string, priority: 'low' | 'medium' | 'high' | 'critical') {
  await requireUser()
  await updateTask(id, { priority })
  revalidatePath('/tasks')
  revalidatePath('/plans')
}

export async function updateTaskAssigneeAction(id: string, assigneeId: string | null) {
  await requireUser()
  await updateTask(id, { assigneeId })
  revalidatePath('/tasks')
}
