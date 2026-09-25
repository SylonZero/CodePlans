import { db } from './index'
import {
  organizations, organizationMembers, products, codePlans, releases, workItems, tasks, assets, assetOwners,
  assetDependencies, assetDesignLog, assetCapabilities, specs,
} from './schema'
import { eq, and, isNotNull } from 'drizzle-orm'

/**
 * Shared authorization library. Both the web UI (app/(dashboard)/actions.ts)
 * and the MCP tools (app/api/mcp/[transport]/route.ts) must call these
 * functions rather than reimplementing checks — a policy change here takes
 * effect for every caller at once. See spec "Delete Authorization Rules".
 */

/**
 * The organization's durable owner. `organizations.ownerId` is set once at
 * creation and never reassigned anywhere in this codebase — never substitute
 * the mutable `role` column here, since role assignment is exactly what this
 * check protects (a compromised role can't be trusted to validate itself).
 */
export async function isOrgOwner(organizationId: string, userId: string): Promise<boolean> {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) })
  return org?.ownerId === userId
}

// ---------------------------------------------------------------------------
// Delete authorization — unified rule (spec "Delete Authorization Rules")
//
// owner/admin (per organizationMembers.role, scoped to the entity's org):
//   always allowed. editor/viewer: allowed only if they created the entity
//   or are its assigned/owning user. No organization (personal/solo
//   products): only the creator may delete — there's no owner/admin concept.
// ---------------------------------------------------------------------------

async function getProductOrgId(productId: string): Promise<string | null> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  return product?.organizationId ?? null
}

async function hasOrgOverride(organizationId: string | null, userId: string): Promise<boolean> {
  if (!organizationId) return false
  const member = await db.query.organizationMembers.findFirst({
    where: and(eq(organizationMembers.organizationId, organizationId), eq(organizationMembers.userId, userId)),
  })
  return member?.role === 'owner' || member?.role === 'admin'
}

/**
 * Governs both archiveProduct and restoreProduct (Phase 4) — archiving is the
 * delete-equivalent action for products, the highest blast radius in the
 * schema, so it follows the same unified rule as everything else.
 */
export async function canDeleteProduct(userId: string, productId: string): Promise<boolean> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product) return false
  if (await hasOrgOverride(product.organizationId, userId)) return true
  return product.creatorId === userId
}

export async function canDeleteCodePlan(userId: string, codePlanId: string): Promise<boolean> {
  const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, codePlanId) })
  if (!plan) return false
  if (await hasOrgOverride(await getProductOrgId(plan.productId), userId)) return true
  return plan.creatorId === userId
}

export async function canDeleteRelease(userId: string, releaseId: string): Promise<boolean> {
  const release = await db.query.releases.findFirst({ where: eq(releases.id, releaseId) })
  if (!release) return false
  if (await hasOrgOverride(await getProductOrgId(release.productId), userId)) return true
  return release.creatorId === userId
}

export async function canDeleteWorkItem(userId: string, workItemId: string): Promise<boolean> {
  const item = await db.query.workItems.findFirst({ where: eq(workItems.id, workItemId) })
  if (!item) return false
  if (await hasOrgOverride(await getProductOrgId(item.productId), userId)) return true
  return item.createdById === userId || item.reporterId === userId || item.ownerId === userId
}

export async function canDeleteTask(userId: string, taskId: string): Promise<boolean> {
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, taskId) })
  if (!task) return false
  const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, task.codePlanId) })
  if (plan && (await hasOrgOverride(await getProductOrgId(plan.productId), userId))) return true
  return task.createdById === userId || task.assigneeId === userId
}

/**
 * Governs both archiveAsset and restoreAsset (Phase 3) — archiving is the
 * delete-equivalent action for assets, so it follows the same rule. "Owns
 * it" means listed in assetOwners (declared code-owner routing/visibility),
 * the closest asset analog to a task's assigneeId.
 */
export async function canDeleteAsset(userId: string, assetId: string): Promise<boolean> {
  const asset = await db.query.assets.findFirst({ where: eq(assets.id, assetId) })
  if (!asset) return false
  if (await hasOrgOverride(await getProductOrgId(asset.productId), userId)) return true
  if (asset.createdById === userId) return true
  const owner = await db.query.assetOwners.findFirst({
    where: and(eq(assetOwners.assetId, assetId), eq(assetOwners.userId, userId)),
  })
  return !!owner
}

// ---------------------------------------------------------------------------
// Write authorization
//
// Visibility (productAccessWhere) answers "can you see it?". These answer
// "can you change it?". The org role on organization_members decides:
// owner/admin/editor may write, viewer may only read. Solo products (no org)
// are writable only by their creator. Every mutating entry point — server
// actions, the MCP tools, and the spec API — must go through assertCanWrite.
// ---------------------------------------------------------------------------

export type ProductRole = 'none' | 'viewer' | 'editor' | 'admin'

export class ForbiddenError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ForbiddenError'
  }
}

export const VIEW_ONLY_MESSAGE = 'You have view-only access. Ask an org owner or admin for editor access to make changes.'
export const NOT_ACCESSIBLE_MESSAGE = 'Not found or not accessible'

async function joinedMembership(organizationId: string, userId: string) {
  return db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId),
      isNotNull(organizationMembers.joinedAt),
    ),
  })
}

/** The caller's effective role on a product. Archived products are read-only unless includeArchived. */
export async function getProductRole(
  userId: string,
  productId: string,
  opts: { includeArchived?: boolean } = {},
): Promise<ProductRole> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product) return 'none'
  if (product.archivedAt && !opts.includeArchived) return 'none'
  if (product.organizationId) {
    const member = await joinedMembership(product.organizationId, userId)
    if (member) {
      if (member.role === 'owner' || member.role === 'admin') return 'admin'
      return member.role === 'editor' ? 'editor' : 'viewer'
    }
    return product.creatorId === userId ? 'editor' : 'none'
  }
  return product.creatorId === userId ? 'admin' : 'none'
}

export async function canWriteProduct(userId: string, productId: string): Promise<boolean> {
  const role = await getProductRole(userId, productId)
  return role === 'editor' || role === 'admin'
}

export type WriteTarget =
  | { productId: string }
  | { assetId: string }
  | { codePlanId: string }
  | { taskId: string }
  | { workItemId: string }
  | { releaseId: string }
  | { specId: string }
  | { designNoteId: string }
  | { capabilityId: string }
  | { assetDependencyId: string }

/** Resolve any write target to the product that governs it. */
export async function productIdFor(target: WriteTarget): Promise<string | null> {
  if ('productId' in target) return target.productId
  if ('assetId' in target) {
    return (await db.query.assets.findFirst({ where: eq(assets.id, target.assetId) }))?.productId ?? null
  }
  if ('codePlanId' in target) {
    return (await db.query.codePlans.findFirst({ where: eq(codePlans.id, target.codePlanId) }))?.productId ?? null
  }
  if ('taskId' in target) {
    const task = await db.query.tasks.findFirst({ where: eq(tasks.id, target.taskId) })
    return task ? productIdFor({ codePlanId: task.codePlanId }) : null
  }
  if ('workItemId' in target) {
    return (await db.query.workItems.findFirst({ where: eq(workItems.id, target.workItemId) }))?.productId ?? null
  }
  if ('releaseId' in target) {
    return (await db.query.releases.findFirst({ where: eq(releases.id, target.releaseId) }))?.productId ?? null
  }
  if ('specId' in target) {
    return (await db.query.specs.findFirst({ where: eq(specs.id, target.specId) }))?.productId ?? null
  }
  if ('designNoteId' in target) {
    const note = await db.query.assetDesignLog.findFirst({ where: eq(assetDesignLog.id, target.designNoteId) })
    return note ? productIdFor({ assetId: note.assetId }) : null
  }
  if ('capabilityId' in target) {
    const cap = await db.query.assetCapabilities.findFirst({ where: eq(assetCapabilities.id, target.capabilityId) })
    return cap ? productIdFor({ assetId: cap.assetId }) : null
  }
  const dep = await db.query.assetDependencies.findFirst({ where: eq(assetDependencies.id, target.assetDependencyId) })
  return dep ? productIdFor({ assetId: dep.sourceAssetId }) : null
}

/**
 * Throws unless the user may change every target. Invisible targets report
 * "not found" (no existence leak); visible-but-read-only ones report view-only.
 */
export async function assertCanWrite(userId: string, ...targets: WriteTarget[]): Promise<void> {
  for (const target of targets) {
    const productId = await productIdFor(target)
    const role = productId ? await getProductRole(userId, productId) : 'none'
    if (role === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
    if (role === 'viewer') throw new ForbiddenError(VIEW_ONLY_MESSAGE)
  }
}

/** Owner/admin of the organization — manages members, integrations and org settings. */
export async function isOrgAdmin(organizationId: string, userId: string): Promise<boolean> {
  const member = await joinedMembership(organizationId, userId)
  return member?.role === 'owner' || member?.role === 'admin'
}

/** Creating a product: solo products are always allowed; org products need editor or above. */
export async function canCreateProductIn(userId: string, organizationId: string | null | undefined): Promise<boolean> {
  if (!organizationId) return true
  const member = await joinedMembership(organizationId, userId)
  return !!member && member.role !== 'viewer'
}
