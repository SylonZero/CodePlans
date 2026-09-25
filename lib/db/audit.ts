import { db } from './index'
import { integrations, products, syncLog, users } from './schema'
import { eq } from 'drizzle-orm'
import { productIdFor, type WriteTarget } from './authz'
import type { ArtifactActor } from './attribution'
import type { SyncEntityType } from './schema.sqlite'

export type AuditEntry = {
  entityType: SyncEntityType
  entityId: string
  event: string
  actor?: ArtifactActor
  payload?: Record<string, unknown>
  /** Pass when the entity may no longer resolve (deletes) or is already known. */
  productId?: string | null
  /** Org-level entities (integrations) with no product. */
  organizationId?: string | null
}

function targetFor(entityType: SyncEntityType, entityId: string): WriteTarget | null {
  switch (entityType) {
    case 'product': return { productId: entityId }
    case 'asset': return { assetId: entityId }
    case 'code_plan': return { codePlanId: entityId }
    case 'task': return { taskId: entityId }
    case 'work_item': return { workItemId: entityId }
    case 'release': return { releaseId: entityId }
    case 'spec': return { specId: entityId }
    case 'asset_dependency': return { assetDependencyId: entityId }
    default: return null
  }
}

/**
 * Where an event belongs: the entity's product, and that product's org. The
 * actor's "current org" (users.organizationId) is only a fallback for solo
 * products — using it first would file events under the wrong org for people
 * who belong to several.
 */
export async function resolveAuditScope(entry: AuditEntry): Promise<{ productId: string | null; organizationId: string | null }> {
  let productId = entry.productId ?? null
  if (!productId) {
    const target = targetFor(entry.entityType, entry.entityId)
    productId = target ? await productIdFor(target) : null
  }
  let organizationId = entry.organizationId ?? null
  if (!organizationId && productId) {
    organizationId = (await db.query.products.findFirst({ where: eq(products.id, productId) }))?.organizationId ?? null
  }
  if (!organizationId && entry.entityType === 'integration') {
    organizationId = (await db.query.integrations.findFirst({ where: eq(integrations.id, entry.entityId) }))?.organizationId ?? null
  }
  if (!organizationId && entry.actor?.id) {
    organizationId = (await db.query.users.findFirst({ where: eq(users.id, entry.actor.id) }))?.organizationId ?? null
  }
  return { productId, organizationId }
}

/**
 * Append an event to sync_log — the activity stream. Lives in the shared
 * data layer (not the UI action layer) so both web server actions and MCP
 * tools get audit coverage for free, since both call the same functions.
 * Never throws: audit logging must not fail the mutation it accompanies.
 * No-ops when there's no actor or no organization can be resolved — the
 * mutation still succeeds, just unaudited (connector syncs log through
 * lib/integrations/sync.ts's own actorless path).
 */
export async function logAudit(entry: AuditEntry) {
  if (!entry.actor?.id) return
  try {
    const { productId, organizationId } = await resolveAuditScope(entry)
    if (!organizationId) return
    await db.insert(syncLog).values({
      organizationId,
      productId,
      entityType: entry.entityType,
      entityId: entry.entityId,
      event: entry.event,
      actorId: entry.actor.id,
      actorKind: entry.actor.kind ?? 'user',
      payload: entry.payload ?? {},
    })
  } catch (err) {
    console.error('[audit] log failed:', err)
  }
}
