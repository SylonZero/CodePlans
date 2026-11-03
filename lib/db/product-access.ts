import { db } from './index'
import {
  products,
  productAccessGrants,
  organizationMembers,
} from './schema'
import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm'
import { createdBy, type ArtifactActor } from './attribution'

export type ProductAccessGrantRow = {
  id: string
  userId: string
  name: string
  email: string
  createdAt: string
}

export type ProductAccessSettings = {
  accessRestricted: boolean
  grants: ProductAccessGrantRow[]
}

/** Cached per-request context for building productAccessWhere. */
export type ProductAccessContext = {
  orgIds: string[]
  adminOrgIds: string[]
  grantedProductIds: string[]
}

export async function loadProductAccessContext(userId: string): Promise<ProductAccessContext> {
  const memberships = await db
    .select({
      organizationId: organizationMembers.organizationId,
      role: organizationMembers.role,
    })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.userId, userId), isNotNull(organizationMembers.joinedAt)))
  const orgIds = memberships.map((m) => m.organizationId)
  const adminOrgIds = memberships
    .filter((m) => m.role === 'owner' || m.role === 'admin')
    .map((m) => m.organizationId)
  const grantRows =
    orgIds.length === 0
      ? []
      : await db
          .select({ productId: productAccessGrants.productId })
          .from(productAccessGrants)
          .where(eq(productAccessGrants.userId, userId))
  return {
    orgIds,
    adminOrgIds,
    grantedProductIds: [...new Set(grantRows.map((r) => r.productId))],
  }
}

/**
 * Drizzle fragment: products the user may see. Pair with loadProductAccessContext
 * so list queries only hit the DB once for membership + grants.
 */
export function productVisibilitySql(
  userId: string,
  ctx: ProductAccessContext,
  opts: { includeArchived?: boolean } = {},
): SQL {
  const { orgIds, adminOrgIds, grantedProductIds } = ctx
  const orgAccess =
    orgIds.length > 0
      ? or(
          eq(products.creatorId, userId),
          and(
            inArray(products.organizationId, orgIds),
            or(
              eq(products.accessRestricted, false),
              adminOrgIds.length > 0 ? inArray(products.organizationId, adminOrgIds) : undefined,
              grantedProductIds.length > 0 ? inArray(products.id, grantedProductIds) : undefined,
            ),
          ),
        )
      : eq(products.creatorId, userId)
  const access = orgAccess ?? eq(products.creatorId, userId)
  return opts.includeArchived ? access : and(access, isNull(products.archivedAt))!
}

type ProductRow = {
  id: string
  creatorId: string
  organizationId: string | null
  accessRestricted: boolean
  archivedAt: Date | null
}

/** Row-level visibility check — used by getProductRole and detail routes. */
export async function canSeeProduct(
  userId: string,
  product: ProductRow,
  opts: { includeArchived?: boolean } = {},
): Promise<boolean> {
  if (product.archivedAt && !opts.includeArchived) return false
  if (product.creatorId === userId) return true
  if (!product.organizationId) return false
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, product.organizationId),
      eq(organizationMembers.userId, userId),
      isNotNull(organizationMembers.joinedAt),
    ),
  })
  if (!member) return false
  if (!product.accessRestricted) return true
  if (member.role === 'owner' || member.role === 'admin') return true
  const grant = await db.query.productAccessGrants.findFirst({
    where: and(eq(productAccessGrants.productId, product.id), eq(productAccessGrants.userId, userId)),
  })
  return !!grant
}

async function isOrgAdminForProduct(organizationId: string, userId: string): Promise<boolean> {
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, organizationId),
      eq(organizationMembers.userId, userId),
      isNotNull(organizationMembers.joinedAt),
    ),
  })
  return member?.role === 'owner' || member?.role === 'admin'
}

export async function canManageProductAccess(userId: string, productId: string): Promise<boolean> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product) return false
  if (product.creatorId === userId) return true
  if (product.organizationId && (await isOrgAdminForProduct(product.organizationId, userId))) return true
  return false
}

export async function getProductAccessSettings(
  productId: string,
  viewerId: string,
): Promise<ProductAccessSettings | null> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product || !(await canSeeProduct(viewerId, product, { includeArchived: true }))) return null
  const { users } = await import('./schema')
  const grants = await db
    .select({
      id: productAccessGrants.id,
      userId: productAccessGrants.userId,
      name: users.name,
      email: users.email,
      createdAt: productAccessGrants.createdAt,
    })
    .from(productAccessGrants)
    .innerJoin(users, eq(productAccessGrants.userId, users.id))
    .where(eq(productAccessGrants.productId, productId))
    .orderBy(users.name)
  return {
    accessRestricted: product.accessRestricted ?? false,
    grants: grants.map((g) => ({
      id: g.id,
      userId: g.userId,
      name: g.name,
      email: g.email,
      createdAt: g.createdAt.toISOString(),
    })),
  }
}

async function orgMemberUserIds(organizationId: string): Promise<string[]> {
  const rows = await db
    .select({ userId: organizationMembers.userId })
    .from(organizationMembers)
    .where(and(eq(organizationMembers.organizationId, organizationId), isNotNull(organizationMembers.joinedAt)))
  // organization_members has no (org, user) uniqueness, so one person can have several rows.
  return [...new Set(rows.map((r) => r.userId))]
}

/** Turn on/off per-product allowlists. Enabling seeds grants for every current org member. */
export async function setProductAccessRestricted(
  productId: string,
  accessRestricted: boolean,
  actor: ArtifactActor,
): Promise<{ accessRestricted: boolean; grants?: ProductAccessGrantRow[] } | null> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product?.organizationId) return null
  if (!(await canManageProductAccess(actor.id, productId))) return null

  if (accessRestricted) {
    const memberIds = await orgMemberUserIds(product.organizationId)
    const existing = await db
      .select({ userId: productAccessGrants.userId })
      .from(productAccessGrants)
      .where(eq(productAccessGrants.productId, productId))
    const have = new Set(existing.map((r) => r.userId))
    const toInsert = memberIds.filter((id) => !have.has(id))
    if (toInsert.length > 0) {
      await db.insert(productAccessGrants).values(
        toInsert.map((userId) => ({
          productId,
          userId,
          ...createdBy(actor),
        })),
      ).onConflictDoNothing()
    }
  }

  await db.update(products).set({ accessRestricted }).where(eq(products.id, productId))
  if (accessRestricted) {
    const settings = await getProductAccessSettings(productId, actor.id)
    return { accessRestricted, grants: settings?.grants }
  }
  return { accessRestricted }
}

export async function grantProductAccess(
  productId: string,
  userId: string,
  actor: ArtifactActor,
): Promise<{ error?: string } | { id: string }> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product?.organizationId) return { error: 'Solo products do not use product access lists.' }
  if (!(await canManageProductAccess(actor.id, productId))) return { error: 'Not allowed.' }
  const member = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.organizationId, product.organizationId),
      eq(organizationMembers.userId, userId),
      isNotNull(organizationMembers.joinedAt),
    ),
  })
  if (!member) return { error: 'That person is not a member of this workspace.' }
  const existing = await db.query.productAccessGrants.findFirst({
    where: and(eq(productAccessGrants.productId, productId), eq(productAccessGrants.userId, userId)),
  })
  if (existing) return { id: existing.id }
  const [row] = await db
    .insert(productAccessGrants)
    .values({ productId, userId, ...createdBy(actor) })
    .returning({ id: productAccessGrants.id })
  return { id: row.id }
}

export async function revokeProductAccess(grantId: string, actor: ArtifactActor): Promise<boolean> {
  const grant = await db.query.productAccessGrants.findFirst({ where: eq(productAccessGrants.id, grantId) })
  if (!grant) return false
  if (!(await canManageProductAccess(actor.id, grant.productId))) return false
  await db.delete(productAccessGrants).where(eq(productAccessGrants.id, grantId))
  return true
}

/** Drop grants for a user on every product in an org — used when removing them from the team. */
export async function clearProductAccessForUserInOrg(userId: string, organizationId: string): Promise<void> {
  const orgProducts = await db
    .select({ id: products.id })
    .from(products)
    .where(eq(products.organizationId, organizationId))
  const productIds = orgProducts.map((p) => p.id)
  if (productIds.length === 0) return
  await db
    .delete(productAccessGrants)
    .where(and(eq(productAccessGrants.userId, userId), inArray(productAccessGrants.productId, productIds)))
}
