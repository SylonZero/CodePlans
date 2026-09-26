import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from './index'
import { assetOwners, assets, productMembers, users } from './schema'
import { ForbiddenError, NOT_ACCESSIBLE_MESSAGE, getProductRole } from './authz'
import { createdBy, type ArtifactActor } from './attribution'
import { logAudit } from './audit'
import type { ProductResponsibility } from './schema.sqlite'

/**
 * Engineering responsibilities are a second axis next to the org role: the
 * role decides what someone may do, a responsibility decides what they are
 * expected to do (review, triage, be told). Engineering managers, architects
 * and contributors are recorded per product; code owners come from
 * asset_owners; developers follow from task assignment and plan ownership.
 */
export const RESPONSIBILITIES = ['eng_manager', 'architect', 'contributor'] as const satisfies readonly ProductResponsibility[]

export const RESPONSIBILITY_LABELS: Record<ProductResponsibility | 'code_owner', string> = {
  eng_manager: 'Engineering manager',
  architect: 'Architect',
  contributor: 'Contributor',
  code_owner: 'Code owner',
}

export function isResponsibility(value: string): value is ProductResponsibility {
  return (RESPONSIBILITIES as readonly string[]).includes(value)
}

/** Org owners/admins and the product's engineering managers (who can still write) assign responsibilities. */
export async function canManageResponsibilities(userId: string, productId: string): Promise<boolean> {
  const role = await getProductRole(userId, productId)
  if (role === 'admin') return true
  if (role !== 'editor') return false
  const row = await db.query.productMembers.findFirst({
    where: and(eq(productMembers.productId, productId), eq(productMembers.userId, userId), eq(productMembers.responsibility, 'eng_manager')),
  })
  return !!row
}

export type ProductMemberRow = {
  id: string
  userId: string
  name: string
  email: string
  responsibility: ProductResponsibility
  area: string | null
}

export type CodeOwnerRow = { userId: string; name: string; email: string; assets: { id: string; name: string }[] }

/** Everyone with a declared responsibility on the product, plus code owners derived from its assets. */
export async function getProductPeople(productId: string, viewerId: string): Promise<{ members: ProductMemberRow[]; codeOwners: CodeOwnerRow[] }> {
  if ((await getProductRole(viewerId, productId, { includeArchived: true })) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  const memberRows = await db
    .select({ id: productMembers.id, userId: productMembers.userId, responsibility: productMembers.responsibility, area: productMembers.area, name: users.name, email: users.email })
    .from(productMembers)
    .innerJoin(users, eq(productMembers.userId, users.id))
    .where(eq(productMembers.productId, productId))
    .orderBy(productMembers.responsibility, users.name)
  const ownerRows = await db
    .select({ userId: assetOwners.userId, name: users.name, email: users.email, assetId: assets.id, assetName: assets.name })
    .from(assetOwners)
    .innerJoin(assets, eq(assetOwners.assetId, assets.id))
    .innerJoin(users, eq(assetOwners.userId, users.id))
    .where(and(eq(assets.productId, productId), isNull(assets.archivedAt)))
    .orderBy(users.name, assets.name)
  const owners = new Map<string, CodeOwnerRow>()
  for (const r of ownerRows) {
    const entry = owners.get(r.userId) ?? { userId: r.userId, name: r.name, email: r.email, assets: [] }
    entry.assets.push({ id: r.assetId, name: r.assetName })
    owners.set(r.userId, entry)
  }
  return {
    members: memberRows.map((r) => ({ ...r, responsibility: r.responsibility as ProductResponsibility, area: r.area || null })),
    codeOwners: [...owners.values()],
  }
}

export async function addProductMember(
  data: { productId: string; userId: string; responsibility: ProductResponsibility; area?: string | null },
  actor: ArtifactActor,
) {
  if (!isResponsibility(data.responsibility)) throw new Error('Unknown responsibility')
  if (!(await canManageResponsibilities(actor.id, data.productId))) {
    throw new ForbiddenError('Only an org owner/admin or this product\'s engineering manager can assign responsibilities.')
  }
  if ((await getProductRole(data.userId, data.productId)) === 'none') {
    throw new Error('That person does not have access to this product.')
  }
  // Areas narrow an architect's scope (matching specs.area); other responsibilities are product-wide.
  const area = data.responsibility === 'architect' ? (data.area ?? '').trim().slice(0, 200) : ''
  const [row] = await db.insert(productMembers)
    .values({ productId: data.productId, userId: data.userId, responsibility: data.responsibility, area, ...createdBy(actor) })
    .onConflictDoNothing()
    .returning()
  if (row) {
    await logAudit({ entityType: 'product', entityId: data.productId, event: 'member_added', actor, productId: data.productId,
      payload: { userId: data.userId, responsibility: data.responsibility, area: area || null } })
  }
  return row ?? (await db.query.productMembers.findFirst({
    where: and(eq(productMembers.productId, data.productId), eq(productMembers.userId, data.userId), eq(productMembers.responsibility, data.responsibility), eq(productMembers.area, area)),
  }))!
}

export async function removeProductMember(id: string, actor: ArtifactActor) {
  const row = await db.query.productMembers.findFirst({ where: eq(productMembers.id, id) })
  if (!row) return null
  if (!(await canManageResponsibilities(actor.id, row.productId))) {
    throw new ForbiddenError('Only an org owner/admin or this product\'s engineering manager can change responsibilities.')
  }
  await db.delete(productMembers).where(eq(productMembers.id, id))
  await logAudit({ entityType: 'product', entityId: row.productId, event: 'member_removed', actor, productId: row.productId,
    payload: { userId: row.userId, responsibility: row.responsibility, area: row.area || null } })
  return row
}

export type UserResponsibility =
  | { kind: ProductResponsibility; productId: string; area: string | null }
  | { kind: 'code_owner'; productId: string; assetId: string }

/** All of a user's responsibilities, optionally within some products. Drives routing and My Work lenses. */
export async function getUserResponsibilities(userId: string, productIds?: string[]): Promise<UserResponsibility[]> {
  if (productIds && productIds.length === 0) return []
  const [members, owned] = await Promise.all([
    db.select().from(productMembers).where(and(eq(productMembers.userId, userId), productIds ? inArray(productMembers.productId, productIds) : undefined)),
    db.select({ assetId: assets.id, productId: assets.productId }).from(assetOwners)
      .innerJoin(assets, eq(assetOwners.assetId, assets.id))
      .where(and(eq(assetOwners.userId, userId), isNull(assets.archivedAt), productIds ? inArray(assets.productId, productIds) : undefined)),
  ])
  return [
    ...members.map((m) => ({ kind: m.responsibility as ProductResponsibility, productId: m.productId, area: m.area || null })),
    ...owned.map((o) => ({ kind: 'code_owner' as const, productId: o.productId, assetId: o.assetId })),
  ]
}
