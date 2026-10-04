import { db } from '@/lib/db'
import { productIdFor } from '@/lib/db/authz'
import { editedBy } from '@/lib/db/attribution'
import { integrations, workItems, codePlans, codePlanAssets, tasks, syncLog } from '@/lib/db/schema'
import { eq, and, isNotNull, isNull, inArray } from 'drizzle-orm'
import type { WorkItemStatus, WorkItemType, TaskStatus } from '@/lib/types'
import type { Connector, ExternalItem, IntegrationConfig, SyncResult } from './types'
import { getConnector } from './registry'
import { DEFAULT_TYPE_LABEL_MAP, inferType } from './type-labels'

function mapStatus(
  state: string,
  statusMap: Record<string, WorkItemStatus>,
): WorkItemStatus {
  return statusMap[state] ?? 'open'
}

type IntegrationRow = typeof integrations.$inferSelect

/**
 * The provider-side scope an item came from ("owner/repo", a Jira project
 * key, ...), recorded on every mirrored row. GitHub and GitLab ids are issue
 * numbers, unique only within one repo, so the row has to say which repo.
 */
export function scopeLabel(config: IntegrationConfig): string | null {
  if (!config.repo) return null
  return config.baseUrl ? `${config.baseUrl.replace(/\/$/, '')}/${config.repo}` : config.repo
}

/** How often the deleted-upstream check runs per connection. */
const RECONCILE_EVERY_MS = 24 * 60 * 60 * 1000

function emptyResult(error?: string): SyncResult {
  return { created: 0, updated: 0, unchanged: 0, tasksCreated: 0, tasksUpdated: 0, prsUpdated: 0, error }
}

// Issue trackers give no in-progress signal, so mirrored tasks are binary.
// Keyed by raw provider state (GitHub: open/closed, GitLab: opened/closed).
const TASK_STATUS_MAP: Record<string, TaskStatus> = {
  open: 'not_started',
  opened: 'not_started',
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

  const { resolveConnectionToken } = await import('./secrets')
  const token = resolveConnectionToken(integration)
  if (!token) {
    return emptyResult(
      'Auth token not found — paste a token on the connection or set its env var',
    )
  }

  const statusMap = { ...connector.defaultStatusMap, ...(config.statusMap ?? {}) }
  const typeLabelMap = { ...DEFAULT_TYPE_LABEL_MAP, ...(config.typeLabelMap ?? {}) }

  const since = integration.lastSyncAt ?? undefined
  const externalItems = await connector.listItems({ token }, config, since)
  const scope = scopeLabel(config)

  let created = 0
  const imported: { id: string; title: string }[] = []
  let updated = 0
  let unchanged = 0

  for (const item of externalItems) {
    let existing = await db.query.workItems.findFirst({
      where: and(
        eq(workItems.connectionId, integration.id),
        eq(workItems.externalId, item.externalId),
      ),
    })
    // Reconnecting after a connection was deleted: its items lost their
    // connection_id (set null) but kept source and URL. Adopt them instead of
    // creating duplicates.
    let adopted = false
    if (!existing) {
      existing = await db.query.workItems.findFirst({
        where: and(
          isNull(workItems.connectionId),
          eq(workItems.source, integration.provider),
          eq(workItems.externalUrl, item.externalUrl),
          eq(workItems.productId, config.productId),
        ),
      })
      adopted = !!existing
    }

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
        scope,
      },
      externalDeleted: false,
      syncedAt: new Date(),
    }

    if (existing) {
      const providerUpdatedAt = (existing.externalData as Record<string, unknown>)?.providerUpdatedAt
      if (!adopted && providerUpdatedAt === item.updatedAt && !existing.externalDeleted) {
        unchanged += 1
        continue
      }
      // Only mirrored fields — never assetId/area/severity/parent (native annotations).
      await db
        .update(workItems)
        .set({ ...mirrored, ...(adopted ? { connectionId: integration.id, externalId: item.externalId } : {}), ...editedBy(), updatedAt: new Date() })
        .where(eq(workItems.id, existing.id))
      updated += 1
      await logSyncEvent(integration, existing.id, adopted ? 'relinked' : 'updated', item)
    } else {
      const [row] = await db
        .insert(workItems)
        .values({
          productId: config.productId,
          type: inferType(item.labels, typeLabelMap),
          source: integration.provider,
          connectionId: integration.id,
          externalId: item.externalId,
          // Tracker issues arrive as reports awaiting the team's triage decision.
          origin: 'external',
          triageState: 'untriaged',
          ...mirrored,
        })
        .returning()
      created += 1
      imported.push({ id: row.id, title: row.title })
      await logSyncEvent(integration, row.id, 'created', item)
    }
  }

  const reconciled = await reconcileDeleted(integration, connector, { token }, config)
  const taskStats = await syncPlanTasks(integration, connector, { token }, config)
  const prsUpdated = await syncPrStatuses(integration, connector, { token }, config)

  if (imported.length) {
    const { notifySyncImports } = await import('@/lib/db/notification-rules')
    await notifySyncImports(integration, config.productId, imported)
  }

  return { created, updated, unchanged, ...taskStats, prsUpdated, ...reconciled }
}

/**
 * Daily deleted-upstream check. Incremental syncs never see an item that was
 * deleted or moved out of scope (GitHub transfers, Jira moves), so once a day
 * we list every id in scope and flag mirrored work items that are missing
 * (external_deleted = true), or clear the flag on items that came back.
 * Skipped when the connector can't list completely, and when the listing is
 * empty although items exist (more likely lost access than a wiped repo).
 */
export async function reconcileDeleted(
  integration: IntegrationRow,
  connector: Connector,
  auth: { token: string },
  config: IntegrationConfig,
  now = new Date(),
): Promise<{ markedDeleted?: number; restored?: number }> {
  if (!connector.listAllIds) return {}
  const last = integration.lastReconciledAt
  if (last && now.getTime() - new Date(last).getTime() < RECONCILE_EVERY_MS) return {}

  let ids: Set<string> | null
  try {
    ids = await connector.listAllIds(auth, config)
  } catch (err) {
    console.error(`[sync] deleted-upstream check failed for ${integration.name}:`, err)
    return {}
  }
  if (!ids) {
    console.warn(`[sync] ${integration.name}: too many items to check for deletions; skipped`)
    return {}
  }

  const rows = await db
    .select({ id: workItems.id, externalId: workItems.externalId, externalDeleted: workItems.externalDeleted, title: workItems.title, externalKey: workItems.externalKey })
    .from(workItems)
    .where(and(eq(workItems.connectionId, integration.id), isNotNull(workItems.externalId)))
  if (ids.size === 0 && rows.length > 0) {
    console.warn(`[sync] ${integration.name}: provider listed no items but ${rows.length} are mirrored; not marking them deleted`)
    return {}
  }

  const gone = rows.filter((r) => !ids.has(r.externalId!) && !r.externalDeleted)
  const back = rows.filter((r) => ids.has(r.externalId!) && r.externalDeleted)
  if (gone.length) {
    await db.update(workItems).set({ externalDeleted: true, syncedAt: now, updatedAt: now }).where(inArray(workItems.id, gone.map((r) => r.id)))
  }
  if (back.length) {
    await db.update(workItems).set({ externalDeleted: false, syncedAt: now, updatedAt: now }).where(inArray(workItems.id, back.map((r) => r.id)))
  }
  for (const r of gone) await logSyncEvent(integration, r.id, 'external_deleted', { title: r.title, externalKey: r.externalKey ?? undefined })
  for (const r of back) await logSyncEvent(integration, r.id, 'external_restored', { title: r.title, externalKey: r.externalKey ?? undefined })
  await db.update(integrations).set({ lastReconciledAt: now }).where(eq(integrations.id, integration.id))
  return { markedDeleted: gone.length, restored: back.length }
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
      let existing = await db.query.tasks.findFirst({
        where: and(eq(tasks.connectionId, integration.id), eq(tasks.externalId, item.externalId)),
      })
      // Same reconnect case as work items, limited to this plan.
      let adopted = false
      if (!existing) {
        existing = await db.query.tasks.findFirst({
          where: and(
            isNull(tasks.connectionId),
            eq(tasks.codePlanId, plan.id),
            eq(tasks.source, integration.provider),
            eq(tasks.externalUrl, item.externalUrl),
          ),
        })
        adopted = !!existing
      }

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
          scope: scopeLabel(config),
        },
        syncedAt: new Date(),
      }

      if (existing) {
        const providerUpdatedAt = (existing.externalData as Record<string, unknown>)?.providerUpdatedAt
        if (!adopted && providerUpdatedAt === item.updatedAt) continue
        // Mirrored fields only — assignee/effort/asset/priority stay native.
        await db
          .update(tasks)
          .set({ ...mirrored, ...(adopted ? { connectionId: integration.id, externalId: item.externalId } : {}), updatedAt: new Date() })
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
 * repo get their prStatus refreshed from the provider. URL shapes are owned
 * by the connector (matchPrUrl), keeping this engine provider-neutral.
 */
async function syncPrStatuses(
  integration: IntegrationRow,
  connector: Connector,
  auth: { token: string },
  config: IntegrationConfig,
): Promise<number> {
  if (!connector.fetchPullRequest || !connector.matchPrUrl) return 0

  const rows = await db
    .select({
      id: codePlanAssets.id,
      codePlanId: codePlanAssets.codePlanId,
      assetId: codePlanAssets.assetId,
      prUrl: codePlanAssets.prUrl,
      prStatus: codePlanAssets.prStatus,
    })
    .from(codePlanAssets)
    .where(isNotNull(codePlanAssets.prUrl))

  let updated = 0
  const statusCache = new Map<string, string | null>()
  for (const row of rows) {
    const prNumber = connector.matchPrUrl(config, row.prUrl!)
    if (!prNumber) continue

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
        actorKind: 'connector',
        productId: await productIdFor({ codePlanId: row.codePlanId }),
        payload: { prUrl: row.prUrl, prStatus: status },
      })
    } catch (err) {
      console.error('[sync] log failed:', err)
    }
    if (status === 'merged') {
      const { notifyPrMerged } = await import('@/lib/db/notification-rules')
      await notifyPrMerged(row.codePlanId, row.assetId, row.prUrl!)
    }
  }
  return updated
}

async function logSyncEvent(integration: IntegrationRow, workItemId: string, event: string, item: Pick<ExternalItem, 'title' | 'externalKey'>) {
  try {
    await db.insert(syncLog).values({
      organizationId: integration.organizationId,
      connectionId: integration.id,
      entityType: 'work_item',
      entityId: workItemId,
      event,
      actorId: null, // the connection is the actor
      actorKind: 'connector',
      productId: await productIdFor({ workItemId }),
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
    if (result.error) await noticeFailure(integration, result.error)
    return result
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    await db
      .update(integrations)
      .set({ lastError: message, status: 'error', updatedAt: new Date() })
      .where(eq(integrations.id, connectionId))
    await noticeFailure(integration, message)
    return emptyResult(message)
  }
}

/** Tell admins when a healthy connection starts failing; repeat failures stay quiet. */
async function noticeFailure(integration: typeof integrations.$inferSelect, message: string) {
  if (integration.status === 'error') return
  const { notifyIntegrationError } = await import('@/lib/db/notification-rules')
  await notifyIntegrationError(integration, message)
}
