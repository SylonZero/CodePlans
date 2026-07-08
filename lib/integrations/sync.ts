import { db } from '@/lib/db'
import { integrations, workItems, codePlans, codePlanAssets, tasks, syncLog } from '@/lib/db/schema'
import { eq, and, isNotNull, like } from 'drizzle-orm'
import type { WorkItemStatus, WorkItemType, TaskStatus } from '@/lib/types'
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

function emptyResult(error?: string): SyncResult {
  return { created: 0, updated: 0, unchanged: 0, tasksCreated: 0, tasksUpdated: 0, prsUpdated: 0, error }
}

// GitHub "open" gives no in-progress signal, so mirrored tasks are binary.
const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  open: 'not_started',
  closed: 'done',
}

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
    return emptyResult('Connection has no target product configured')
  }

  const token = integration.authRef ? process.env[integration.authRef] : undefined
  if (!token) {
    return emptyResult(
      `Auth token not found — set the ${integration.authRef ?? '(unset)'} environment variable`,
    )
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

  const taskStats = await syncPlanTasks(integration, connector, { token }, config)
  const prsUpdated = await syncPrStatuses(integration, connector, { token }, config)

  return { created, updated, unchanged, ...taskStats, prsUpdated }
}

/**
 * Tier 2/3 of the task model: plans linked to an external scope (GitHub
 * milestone) mirror the scope's issues as tasks. Native tasks in the same
 * plan are untouched — mixed mode.
 */
async function syncPlanTasks(
  integration: IntegrationRow,
  connector: Connector,
  auth: { token: string },
  config: IntegrationConfig,
): Promise<{ tasksCreated: number; tasksUpdated: number }> {
  let tasksCreated = 0
  let tasksUpdated = 0
  if (!connector.listScopeItems) return { tasksCreated, tasksUpdated }

  const linkedPlans = await db
    .select({ id: codePlans.id, externalId: codePlans.externalId })
    .from(codePlans)
    .where(and(eq(codePlans.connectionId, integration.id), isNotNull(codePlans.externalId)))

  for (const plan of linkedPlans) {
    const items = await connector.listScopeItems(auth, config, plan.externalId!)
    for (const item of items) {
      const existing = await db.query.tasks.findFirst({
        where: and(eq(tasks.connectionId, integration.id), eq(tasks.externalId, item.externalId)),
      })

      const mirrored = {
        title: item.title,
        description: item.description,
        status: TASK_STATUS_MAP[item.state] ?? 'not_started',
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
        if (providerUpdatedAt === item.updatedAt) continue
        // Mirrored fields only — assignee/effort/asset/priority stay native.
        await db
          .update(tasks)
          .set({ ...mirrored, updatedAt: new Date() })
          .where(eq(tasks.id, existing.id))
        tasksUpdated += 1
      } else {
        await db.insert(tasks).values({
          codePlanId: plan.id,
          source: integration.provider,
          connectionId: integration.id,
          externalId: item.externalId,
          ...mirrored,
        })
        tasksCreated += 1
      }
    }
  }
  return { tasksCreated, tasksUpdated }
}

/**
 * PR auto-linking: plan-asset rows whose prUrl points at this connection's
 * repo get their prStatus refreshed from the provider.
 */
async function syncPrStatuses(
  integration: IntegrationRow,
  connector: Connector,
  auth: { token: string },
  config: IntegrationConfig,
): Promise<number> {
  if (!connector.fetchPullRequest || !config.repo) return 0

  const prefix = `https://github.com/${config.repo}/pull/`
  const rows = await db
    .select({
      id: codePlanAssets.id,
      codePlanId: codePlanAssets.codePlanId,
      prUrl: codePlanAssets.prUrl,
      prStatus: codePlanAssets.prStatus,
    })
    .from(codePlanAssets)
    .where(like(codePlanAssets.prUrl, `${prefix}%`))

  let updated = 0
  const statusCache = new Map<string, string | null>()
  for (const row of rows) {
    const prNumber = row.prUrl!.slice(prefix.length).split(/[/?#]/)[0]
    if (!/^\d+$/.test(prNumber)) continue

    if (!statusCache.has(prNumber)) {
      statusCache.set(prNumber, await connector.fetchPullRequest(auth, config, prNumber))
    }
    const status = statusCache.get(prNumber)
    if (!status || status === row.prStatus) continue

    await db
      .update(codePlanAssets)
      .set({ prStatus: status as 'draft' | 'open' | 'merged' | 'closed', updatedAt: new Date() })
      .where(eq(codePlanAssets.id, row.id))
    updated += 1
    try {
      await db.insert(syncLog).values({
        organizationId: integration.organizationId,
        connectionId: integration.id,
        entityType: 'code_plan',
        entityId: row.codePlanId,
        event: 'pr_status_changed',
        actorId: null,
        payload: { prUrl: row.prUrl, prStatus: status },
      })
    } catch (err) {
      console.error('[sync] log failed:', err)
    }
  }
  return updated
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
  if (!integration) return emptyResult('Connection not found')

  const connector = getConnector(integration.provider)
  if (!connector) {
    return emptyResult(`No connector for provider "${integration.provider}"`)
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
    return emptyResult(message)
  }
}
