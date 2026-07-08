import { db } from '@/lib/db'
import { integrations, workItems, syncLog } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import type { WorkItemStatus, WorkItemType } from '@/lib/types'
import type { Connector, ExternalItem, IntegrationConfig, SyncResult } from './types'
import { getConnector } from './registry'

const DEFAULT_TYPE_LABEL_MAP: Record<string, WorkItemType> = {
  bug: 'bug',
  enhancement: 'enhancement',
  ux: 'ux',
  design: 'ux',
  'tech-debt': 'tech_debt',
  'tech debt': 'tech_debt',
  debt: 'tech_debt',
  feature: 'feature',
}

function inferType(labels: string[], typeLabelMap: Record<string, WorkItemType>): WorkItemType {
  for (const label of labels) {
    const mapped = typeLabelMap[label.toLowerCase()]
    if (mapped) return mapped
  }
  return 'feature'
}

function mapStatus(
  state: string,
  statusMap: Record<string, WorkItemStatus>,
): WorkItemStatus {
  return statusMap[state] ?? 'open'
}

type IntegrationRow = typeof integrations.$inferSelect

/**
 * Core sync pass: pull items from the connector and upsert mirrored work
 * items. Mirrored fields (title, description, status, tags, external*) are
 * overwritten from the provider — the external system is the system of
 * record for them. Native annotation fields (assetId, area, severity,
 * plan links) are never touched. Idempotent via (connectionId, externalId).
 */
export async function runSync(integration: IntegrationRow, connector: Connector): Promise<SyncResult> {
  const config = (integration.config ?? {}) as IntegrationConfig
  if (!config.productId) {
    return { created: 0, updated: 0, unchanged: 0, error: 'Connection has no target product configured' }
  }

  const token = integration.authRef ? process.env[integration.authRef] : undefined
  if (!token) {
    return {
      created: 0,
      updated: 0,
      unchanged: 0,
      error: `Auth token not found — set the ${integration.authRef ?? '(unset)'} environment variable`,
    }
  }

  const statusMap = { ...connector.defaultStatusMap, ...(config.statusMap ?? {}) }
  const typeLabelMap = { ...DEFAULT_TYPE_LABEL_MAP, ...(config.typeLabelMap ?? {}) }

  const since = integration.lastSyncAt ?? undefined
  const externalItems = await connector.listItems({ token }, config, since)

  let created = 0
  let updated = 0
  let unchanged = 0

  for (const item of externalItems) {
    const existing = await db.query.workItems.findFirst({
      where: and(
        eq(workItems.connectionId, integration.id),
        eq(workItems.externalId, item.externalId),
      ),
    })

    const mirrored = {
      title: item.title,
      description: item.description,
      status: mapStatus(item.state, statusMap),
      tags: item.labels,
      externalKey: item.externalKey ?? null,
      externalUrl: item.externalUrl,
      externalData: {
        state: item.state,
        assigneeName: item.assigneeName ?? null,
        providerUpdatedAt: item.updatedAt,
      },
      syncedAt: new Date(),
    }

    if (existing) {
      const providerUpdatedAt = (existing.externalData as Record<string, unknown>)?.providerUpdatedAt
      if (providerUpdatedAt === item.updatedAt) {
        unchanged += 1
        continue
      }
      // Only mirrored fields — never assetId/area/severity/parent (native annotations).
      await db
        .update(workItems)
        .set({ ...mirrored, updatedAt: new Date() })
        .where(eq(workItems.id, existing.id))
      updated += 1
      await logSyncEvent(integration, existing.id, 'updated', item)
    } else {
      const [row] = await db
        .insert(workItems)
        .values({
          productId: config.productId,
          type: inferType(item.labels, typeLabelMap),
          source: integration.provider,
          connectionId: integration.id,
          externalId: item.externalId,
          ...mirrored,
        })
        .returning()
      created += 1
      await logSyncEvent(integration, row.id, 'created', item)
    }
  }

  return { created, updated, unchanged }
}

async function logSyncEvent(integration: IntegrationRow, workItemId: string, event: string, item: ExternalItem) {
  try {
    await db.insert(syncLog).values({
      organizationId: integration.organizationId,
      connectionId: integration.id,
      entityType: 'work_item',
      entityId: workItemId,
      event,
      actorId: null, // the connection is the actor
      payload: { title: item.title, externalKey: item.externalKey },
    })
  } catch (err) {
    console.error('[sync] log failed:', err)
  }
}

/** Load a connection, run its connector, and record the outcome on the row. */
export async function syncConnection(connectionId: string): Promise<SyncResult> {
  const integration = await db.query.integrations.findFirst({
    where: eq(integrations.id, connectionId),
  })
  if (!integration) return { created: 0, updated: 0, unchanged: 0, error: 'Connection not found' }

  const connector = getConnector(integration.provider)
  if (!connector) {
    return { created: 0, updated: 0, unchanged: 0, error: `No connector for provider "${integration.provider}"` }
  }

  try {
    const result = await runSync(integration, connector)
    await db
      .update(integrations)
      .set({
        lastSyncAt: result.error ? integration.lastSyncAt : new Date(),
        lastError: result.error ?? null,
        status: result.error ? 'error' : 'active',
        updatedAt: new Date(),
      })
      .where(eq(integrations.id, connectionId))
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(integrations)
      .set({ lastError: message, status: 'error', updatedAt: new Date() })
      .where(eq(integrations.id, connectionId))
    return { created: 0, updated: 0, unchanged: 0, error: message }
  }
}
