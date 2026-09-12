'use server'

import { getSpec, linkSpec } from '@/lib/db/specs'
import { createdBy } from '@/lib/db/attribution'
import { getWorkItem } from '@/lib/db/queries'
import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizationMembers, organizations, emailVerificationTokens } from '@/lib/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import {
  updateIntegration,
  createProduct,
  updateProduct,
  deleteProduct,
  createAsset,
  updateAsset,
  deleteAsset,
  setAssetOwners,
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
  createRelease,
  updateRelease,
  deleteRelease,
  attachPlanToRelease,
  detachPlanFromRelease,
  setReleaseAsset,
  removeReleaseAsset,
  createDesignNote,
  deleteDesignNote,
  graduateWorkItem,
  updateCapability,
  removeCapability,
} from '@/lib/db/mutations'
import { getAssetOptions } from '@/lib/db/queries'
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

async function currentEditor() {
  return { id: (await requireUser()).id, kind: 'user' as const }
}

async function getUserProfile(userId: string) {
  return db.query.users.findFirst({ where: eq(users.id, userId) })
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
  await requireUser()

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
  }, await currentEditor())

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
  const layerRaw = formData.get('layer')

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
    // Absent field = form without the input (no change); blank = clear.
    ...(layerRaw !== null ? { layer: (layerRaw as string).trim() || null } : {}),
  }, await currentEditor())

  revalidatePath(`/products/${productSlug}`)
}

export async function deleteAssetAction(id: string, productSlug: string) {
  await requireUser()
  await deleteAsset(id, await currentEditor())
  revalidatePath(`/products/${productSlug}`)
}

export async function setAssetOwnersAction(assetId: string, productSlug: string, userIds: string[]) {
  const authUser = await requireUser()
  const accessible = await getAssetOptions(authUser.id)
  if (!accessible.some((a) => a.id === assetId)) throw new Error('Asset not found or not accessible')
  await setAssetOwners(assetId, userIds, await currentEditor())
  revalidatePath(`/products/${productSlug}`)
  revalidatePath(`/assets/${assetId}`)
  revalidatePath('/my-work')
}

/** Update just the long-form content (description / notes) from the asset detail page. */
export async function updateAssetContentAction(
  assetId: string,
  productSlug: string,
  content: { description?: string; notes?: string },
) {
  const authUser = await requireUser()
  const accessible = await getAssetOptions(authUser.id)
  if (!accessible.some((a) => a.id === assetId)) throw new Error('Asset not found or not accessible')
  await updateAsset(assetId, content, await currentEditor())
  revalidatePath(`/assets/${assetId}`)
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

  const specId = (formData.get('specId') as string) || undefined
  if (specId && (await getSpec(specId, authUser.id)).productId !== productId) throw new Error('Spec must belong to this product')
  const plan = await createCodePlan(
    {
      title,
      description,
      productId,
      type,
      tags,
      targetAssetIds: [],
      deadline,
    },
    authUser.id,
  )

  if (specId) await linkSpec(specId, 'code_plan', plan.id, 'references', authUser.id)
  redirect(`/plans/${plan.id}`)
}

export async function updateCodePlanAction(id: string, formData: FormData) {
  await requireUser()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const type = formData.get('type') as 'refactor' | 'feature' | 'improvement' | 'bugfix'
  const tags = parseTags(formData.get('tags') as string)
  const deadline = (formData.get('deadline') as string) || undefined
  const ownerRaw = formData.get('ownerId') as string | null
  const ownerId = ownerRaw === null ? undefined : ownerRaw || null

  await updateCodePlan(id, { title, description, type, tags, deadline, ownerId }, await currentEditor())

  revalidatePath(`/plans/${id}`)
}

export async function activatePlanAction(id: string) {
  await requireUser()
  await updateCodePlan(id, { status: 'active' }, await currentEditor())
  revalidatePath(`/plans/${id}`)
}

export async function completePlanAction(id: string) {
  await requireUser()
  const plan = await updateCodePlan(id, { status: 'completed' }, await currentEditor())
  if (plan) {
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
  await addPlanAsset(codePlanId, assetId, await currentEditor())
  revalidatePath(`/plans/${codePlanId}`)
}

export async function removePlanAssetAction(codePlanId: string, assetId: string) {
  await requireUser()
  await removePlanAsset(codePlanId, assetId, await currentEditor())
  revalidatePath(`/plans/${codePlanId}`)
}

export async function updatePlanAssetAction(codePlanId: string, assetId: string, formData: FormData) {
  await requireUser()
  await updatePlanAsset(codePlanId, assetId, {
    branch: (formData.get('branch') as string) || null,
    prUrl: (formData.get('prUrl') as string) || null,
    prStatus: (formData.get('prStatus') as 'none' | 'draft' | 'open' | 'merged' | 'closed') || 'none',
    notes: (formData.get('notes') as string) || null,
  }, await currentEditor())
  revalidatePath(`/plans/${codePlanId}`)
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTaskAction(codePlanId: string, formData: FormData) {
  await requireUser()

  const title = formData.get('title') as string
  const description = (formData.get('description') as string) || ''
  const priority = (formData.get('priority') as 'low' | 'medium' | 'high' | 'critical') || 'medium'
  const tags = parseTags(formData.get('tags') as string)
  const estimatedEffortRaw = formData.get('estimatedEffort') as string
  const assigneeId = (formData.get('assigneeId') as string) || undefined
  const assetId = (formData.get('assetId') as string) || undefined

  await createTask({
    codePlanId,
    title,
    description,
    priority,
    tags,
    estimatedEffort: estimatedEffortRaw ? parseFloat(estimatedEffortRaw) : undefined,
    assigneeId: assigneeId || undefined,
    assetId: assetId || undefined,
    startDate: (formData.get('startDate') as string) || undefined,
    endDate: (formData.get('endDate') as string) || undefined,
  }, await currentEditor())

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
    percentComplete: formData.get('percentComplete') ? parseInt(formData.get('percentComplete') as string, 10) : undefined,
    startDate: (formData.get('startDate') as string) || undefined,
    endDate: (formData.get('endDate') as string) || undefined,
  }, await currentEditor())

  revalidatePath('/tasks')
  revalidatePath('/plans/[id]', 'page')
  revalidatePath('/plans')
}

export async function updateTaskStatusAction(id: string, status: 'not_started' | 'in_progress' | 'done') {
  await requireUser()
  await updateTaskStatus(id, status, await currentEditor())
  revalidatePath('/tasks')
  revalidatePath('/plans/[id]', 'page')
  revalidatePath('/plans')
}

export async function deleteTaskAction(id: string, planId: string) {
  await requireUser()
  await deleteTask(id, await currentEditor())
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
    ...createdBy({ id: authUser.id }),
  })

  revalidatePath('/team')

  // Email-first: send a set-password invite link; fall back to showing the
  // temp password when email isn't configured.
  try {
    const { randomBytes } = await import('crypto')
    const token = randomBytes(32).toString('hex')
    await db.insert(emailVerificationTokens).values({
      userId: newUserId,
      newEmail: email,
      token,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    })
    const { sendInviteEmail } = await import('@/lib/email')
    const org = profile.organizationId
      ? await db.query.organizations.findFirst({ where: eq(organizations.id, profile.organizationId) })
      : null
    const sent = await sendInviteEmail(email, profile.name, org?.name ?? 'your team', token)
    if (sent) return { emailSent: true as const }
  } catch (err) {
    console.error('[invite] email failed, falling back to temp password:', err)
  }
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

  const specId = (formData.get('specId') as string) || undefined
  if (specId && (await getSpec(specId, authUser.id)).productId !== formData.get('productId')) throw new Error('Spec must belong to this product')
  const item = await createWorkItem(
    {
      productId: formData.get('productId') as string,
      assetId: (formData.get('assetId') as string) || undefined,
      area: (formData.get('area') as string) || undefined,
      type: (formData.get('type') as WorkItemType) || 'feature',
      title: formData.get('title') as string,
      description: (formData.get('description') as string) ?? '',
      severity: (formData.get('severity') as WorkItemSeverity) || 'medium',

      ownerId: (formData.get('ownerId') as string) || undefined,
      tags: parseTags((formData.get('tags') as string) ?? ''),
    },
    authUser.id,
  )

  if (specId) await linkSpec(specId, 'work_item', item.id, undefined, authUser.id)
  revalidatePath('/work-items')
  return { id: item.id }
}

export async function updateWorkItemAction(id: string, formData: FormData) {
  await requireUser()

  const item = await updateWorkItem(id, {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) ?? '',
    type: (formData.get('type') as WorkItemType) || undefined,
    status: (formData.get('status') as WorkItemStatus) || undefined,
    severity: (formData.get('severity') as WorkItemSeverity) || undefined,
    assetId: (formData.get('assetId') as string) || null,
    area: (formData.get('area') as string) || null,

    ownerId: ((formData.get('ownerId') as string | null) ?? undefined) === undefined ? undefined : (formData.get('ownerId') as string) || null,
    tags: parseTags((formData.get('tags') as string) ?? ''),
  }, await currentEditor())
  if (!item) return { error: 'Work item not found.' }

  revalidatePath('/work-items')
  return { id }
}

export async function updateWorkItemStatusAction(id: string, status: WorkItemStatus) {
  await requireUser()
  await updateWorkItemStatus(id, status, await currentEditor())
  revalidatePath('/work-items')
}

export async function deleteWorkItemAction(id: string) {
  await requireUser()
  await deleteWorkItem(id, await currentEditor())
  revalidatePath('/work-items')
}

export async function linkWorkItemToPlanAction(workItemId: string, codePlanId: string) {
  await requireUser()
  await linkWorkItemToPlan(workItemId, codePlanId, await currentEditor())
  revalidatePath('/work-items')
  revalidatePath(`/plans/${codePlanId}`)
}

export async function unlinkWorkItemFromPlanAction(workItemId: string, codePlanId: string) {
  await requireUser()
  await unlinkWorkItemFromPlan(workItemId, codePlanId, await currentEditor())
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
  }, await currentEditor())
  revalidatePath(`/products/${productSlug}`)
}

export async function removeAssetDependencyAction(id: string, productSlug: string) {
  await requireUser()
  await deleteAssetDependency(id, await currentEditor())
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
  const token = (formData.get('token') as string)?.trim() || undefined
  const productId = (formData.get('productId') as string) || undefined

  if (!productId) return { error: 'Select a target product for mirrored items.' }
  if (!token && !authRef) return { error: 'Provide a token, or an env-var name that holds one.' }

  await createIntegration({
    organizationId: profile.organizationId,
    provider,
    name,
    authRef,
    token,
    config: { repo, baseUrl, productId },
  }, await currentEditor())

  revalidatePath('/integrations')
  return {}
}

export async function updateIntegrationAction(id: string, formData: FormData) {
  const authUser = await requireUser()
  const profile = await getUserProfile(authUser.id)
  if (!profile?.organizationId) return { error: 'No workspace found.' }

  const name = formData.get('name') as string
  const repo = (formData.get('repo') as string) || undefined
  const baseUrl = (formData.get('baseUrl') as string) || undefined
  const authRef = (formData.get('authRef') as string) || undefined
  const token = (formData.get('token') as string)?.trim() || undefined
  const productId = (formData.get('productId') as string) || undefined
  if (!productId) return { error: 'Select a target product for mirrored items.' }

  await updateIntegration(id, {
    name,
    // token undefined keeps the stored credential; authRef only set when provided
    token,
    ...(authRef !== undefined ? { authRef } : {}),
    config: { repo, baseUrl, productId },
  }, await currentEditor())
  revalidatePath('/integrations')
  return { ok: true as const }
}

export async function deleteIntegrationAction(id: string) {
  await requireUser()
  await deleteIntegration(id, await currentEditor())
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

  const { resolveConnectionToken } = await import('@/lib/integrations/secrets')
  const token = resolveConnectionToken(integration)
  if (!token) return { error: 'Auth token not found — paste a token on the connection or set its env var.' }

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
  await requireUser()
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
  }, await currentEditor())

  // Pull the scope's tasks immediately for instant feedback.
  const { syncConnection } = await import('@/lib/integrations/sync')
  const result = await syncConnection(connectionId)

  revalidatePath(`/plans/${planId}`)
  revalidatePath('/tasks')
  return result
}

export async function unlinkPlanScopeAction(planId: string) {
  await requireUser()
  await unlinkPlanFromExternalScope(planId, await currentEditor())
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
  await updateTask(id, { priority }, await currentEditor())
  revalidatePath('/tasks')
  revalidatePath('/plans/[id]', 'page')
  revalidatePath('/plans')
}

export async function moveTaskToPlanAction(id: string, codePlanId: string) {
  await requireUser()
  const { moveTaskToPlan } = await import('@/lib/db/mutations')
  await moveTaskToPlan(id, codePlanId, await currentEditor())
  revalidatePath('/tasks')
  revalidatePath('/plans/[id]', 'page')
  revalidatePath('/plans')
}

export async function updateTaskAssigneeAction(id: string, assigneeId: string | null) {
  await requireUser()
  await updateTask(id, { assigneeId }, await currentEditor())
  revalidatePath('/tasks')
  revalidatePath('/plans/[id]', 'page')
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export async function createReleaseAction(formData: FormData) {
  const authUser = await requireUser()
  const release = await createRelease(
    {
      productId: formData.get('productId') as string,
      name: formData.get('name') as string,
      description: (formData.get('description') as string) || '',
      tags: parseTags(formData.get('tags') as string),
    },
    authUser.id,
  )
  revalidatePath('/releases')
  return release.id
}

export async function updateReleaseAction(id: string, formData: FormData) {
  await requireUser()
  await updateRelease(id, {
    name: formData.get('name') as string,
    description: (formData.get('description') as string) || '',
    tags: parseTags(formData.get('tags') as string),
  }, await currentEditor())
  revalidatePath(`/releases/${id}`)
  revalidatePath('/releases')
}

export async function setReleaseStatusAction(id: string, status: 'planned' | 'in_progress' | 'shipped' | 'abandoned') {
  await requireUser()
  await updateRelease(id, { status }, await currentEditor())
  revalidatePath(`/releases/${id}`)
  revalidatePath('/releases')
}

export async function deleteReleaseAction(id: string) {
  await requireUser()
  await deleteRelease(id, await currentEditor())
  revalidatePath('/releases')
  redirect('/releases')
}

export async function attachPlanToReleaseAction(codePlanId: string, releaseId: string) {
  await requireUser()
  await attachPlanToRelease(codePlanId, releaseId, await currentEditor())
  revalidatePath(`/releases/${releaseId}`)
  revalidatePath(`/plans/${codePlanId}`)
}

export async function detachPlanFromReleaseAction(codePlanId: string, releaseId: string) {
  await requireUser()
  await detachPlanFromRelease(codePlanId, await currentEditor())
  revalidatePath(`/releases/${releaseId}`)
  revalidatePath(`/plans/${codePlanId}`)
}

export async function setReleaseAssetAction(releaseId: string, assetId: string, formData: FormData) {
  await requireUser()
  const version = ((formData.get('version') as string) || '').trim()
  const notes = ((formData.get('notes') as string) || '').trim()
  await setReleaseAsset(releaseId, assetId, { version: version || null, notes: notes || null }, await currentEditor())
  revalidatePath(`/releases/${releaseId}`)
}

export async function removeReleaseAssetAction(releaseId: string, assetId: string) {
  await requireUser()
  await removeReleaseAsset(releaseId, assetId, await currentEditor())
  revalidatePath(`/releases/${releaseId}`)
}

// ---------------------------------------------------------------------------
// Asset design log
// ---------------------------------------------------------------------------

export async function addDesignNoteAction(assetId: string, formData: FormData) {
  const authUser = await requireUser()
  const releaseId = (formData.get('releaseId') as string) || undefined
  const codePlanId = (formData.get('codePlanId') as string) || undefined
  await createDesignNote({
    assetId,
    title: formData.get('title') as string,
    body: (formData.get('body') as string) || '',
    releaseId: releaseId === 'none' ? undefined : releaseId,
    codePlanId: codePlanId === 'none' ? undefined : codePlanId,
    authorKind: 'user',
    authorId: authUser.id,
  })
  revalidatePath(`/assets/${assetId}`)
}

export async function deleteDesignNoteAction(noteId: string, assetId: string) {
  await requireUser()
  await deleteDesignNote(noteId, await currentEditor())
  revalidatePath(`/assets/${assetId}`)
}

// ---------------------------------------------------------------------------
// Plan ↔ release picker (plan detail)
// ---------------------------------------------------------------------------

export async function setPlanReleaseAction(codePlanId: string, releaseId: string | null) {
  await requireUser()
  if (releaseId) {
    await attachPlanToRelease(codePlanId, releaseId, await currentEditor())
    revalidatePath(`/releases/${releaseId}`)
  } else {
    await detachPlanFromRelease(codePlanId, await currentEditor())
    revalidatePath('/releases')
  }
  revalidatePath(`/plans/${codePlanId}`)
}

// ---------------------------------------------------------------------------
// AI drafting (feature-flagged; drafts are returned for editing, never saved)
// ---------------------------------------------------------------------------

export async function draftReleaseNotesAction(releaseId: string): Promise<string> {
  const authUser = await requireUser()
  const { aiEnabled, draftReleaseNotes } = await import('@/lib/ai')
  if (!aiEnabled()) throw new Error('AI drafting is not enabled on this install.')
  const { getRelease } = await import('@/lib/db/queries')
  const release = await getRelease(releaseId, authUser.id)
  if (!release) throw new Error('Release not found or not accessible')
  return draftReleaseNotes(release)
}

export async function draftDesignNoteAction(
  assetId: string,
  codePlanId: string,
): Promise<{ title: string; body: string }> {
  const authUser = await requireUser()
  const { aiEnabled, draftDesignNote } = await import('@/lib/ai')
  if (!aiEnabled()) throw new Error('AI drafting is not enabled on this install.')
  const { getAssetDetail, getCodePlan } = await import('@/lib/db/queries')
  const [asset, plan] = await Promise.all([
    getAssetDetail(assetId, authUser.id),
    getCodePlan(codePlanId, authUser.id),
  ])
  if (!asset || !plan) throw new Error('Asset or plan not found or not accessible')
  return draftDesignNote({
    assetName: asset.name,
    assetDescription: asset.description || undefined,
    planTitle: plan.title,
    planDescription: plan.description || undefined,
    taskTitles: plan.tasks.filter((t) => t.status === 'done').map((t) => t.title),
  })
}

/** Save AI-drafted (then human-edited) release notes into the description. */
export async function saveReleaseDescriptionAction(releaseId: string, description: string) {
  await requireUser()
  await updateRelease(releaseId, { description }, await currentEditor())
  revalidatePath(`/releases/${releaseId}`)
}

// ---------------------------------------------------------------------------
// Asset record (capabilities)
// ---------------------------------------------------------------------------

export async function graduateWorkItemAction(workItemId: string, assetId: string, sourceSpecId?: string) {
  const authUser = await requireUser()
  const item = await getWorkItem(workItemId, authUser.id)
  if (!item || item.assetId !== assetId) throw new Error('Work item not found or not accessible on this asset')
  const result = await graduateWorkItem(workItemId, sourceSpecId, await currentEditor())
  if ('error' in result) throw new Error(result.error)
  revalidatePath(`/assets/${assetId}`)
  revalidatePath('/work-items')
}

export async function updateCapabilityAction(id: string, assetId: string, formData: FormData) {
  await requireUser()
  await updateCapability(id, {
    title: formData.get('title') as string,
    description: (formData.get('description') as string) || '',
    area: ((formData.get('area') as string) || '').trim() || null,
  }, await currentEditor())
  revalidatePath(`/assets/${assetId}`)
}

export async function removeCapabilityAction(id: string, assetId: string, reason: string) {
  await requireUser()
  await removeCapability(id, reason.trim() || undefined, await currentEditor())
  revalidatePath(`/assets/${assetId}`)
}
