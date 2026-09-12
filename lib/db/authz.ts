import { db } from './index'
import { organizations, organizationMembers, products, codePlans, releases, workItems, tasks, assets, assetOwners } from './schema'
import { eq, and } from 'drizzle-orm'

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
