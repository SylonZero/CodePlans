'use server'

import { redirect } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizationMembers, emailVerificationTokens } from '@/lib/db/schema'
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
} from '@/lib/db/mutations'
import type { UserRole } from '@/lib/types'

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
  const documentationUrl = (formData.get('documentationUrl') as string) || undefined

  await createAsset({
    productId,
    name,
    type,
    description,
    tags,
    repositoryUrl,
    documentationUrl,
  })

  revalidatePath(`/products/${productSlug}`)
  redirect(`/products/${productSlug}`)
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
  const documentationUrl = (formData.get('documentationUrl') as string) || undefined

  await updateAsset(id, {
    name,
    type,
    description,
    tags,
    health,
    techDebtScore: techDebtRaw ? parseInt(techDebtRaw, 10) : undefined,
    repositoryUrl,
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
    },
    authUser.id,
  )

  redirect(`/plans/${plan.id}`)
}

export async function updateCodePlanAction(id: string, formData: FormData) {
  await requireUser()

  const title = formData.get('title') as string
  const description = formData.get('description') as string
  const type = formData.get('type') as 'refactor' | 'feature' | 'improvement' | 'bugfix'
  const tags = parseTags(formData.get('tags') as string)
  const deadline = (formData.get('deadline') as string) || undefined

  await updateCodePlan(id, { title, description, type, tags, deadline })

  revalidatePath(`/plans/${id}`)
}

export async function activatePlanAction(id: string) {
  await requireUser()
  await updateCodePlan(id, { status: 'active' })
  revalidatePath(`/plans/${id}`)
}

export async function completePlanAction(id: string) {
  await requireUser()
  await updateCodePlan(id, { status: 'completed' })
  revalidatePath(`/plans/${id}`)
}

export async function deleteCodePlanAction(id: string) {
  const authUser = await requireUser()
  await deleteCodePlan(id, authUser.id)
  revalidatePath('/plans')
  redirect('/plans')
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
  await requireUser()
  await updateTaskStatus(id, status)
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
