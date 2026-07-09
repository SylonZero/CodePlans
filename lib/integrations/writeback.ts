import { db } from '@/lib/db'
import { workItems, workItemCodePlans, codePlans, integrations, syncLog } from '@/lib/db/schema'
import { eq, and, ne, isNotNull } from 'drizzle-orm'
import type { IntegrationConfig } from './types'
import { getConnector } from './registry'

/**
 * The one write CodePlans performs against external trackers: when a plan
 * completes, comment on each mirrored work item linked to it. Never throws —
 * write-back failure must not fail the completion.
 */
export async function notifyPlanCompleted(planId: string): Promise<number> {
  let posted = 0
  try {
    const plan = await db.query.codePlans.findFirst({ where: eq(codePlans.id, planId) })
    if (!plan) return 0

    const mirrored = await db
      .select({
        workItemId: workItems.id,
        externalId: workItems.externalId,
        externalKey: workItems.externalKey,
        connectionId: workItems.connectionId,
      })
      .from(workItemCodePlans)
      .innerJoin(workItems, eq(workItemCodePlans.workItemId, workItems.id))
      .where(
        and(
          eq(workItemCodePlans.codePlanId, planId),
          ne(workItems.source, 'native'),
          isNotNull(workItems.connectionId),
          isNotNull(workItems.externalId),
        ),
      )
    if (mirrored.length === 0) return 0

    const body = `✅ Linked code plan **"${plan.title}"** was completed in CodePlans.`
    const connectionCache = new Map<string, typeof integrations.$inferSelect | null>()

    for (const item of mirrored) {
      try {
        if (!connectionCache.has(item.connectionId!)) {
          connectionCache.set(
            item.connectionId!,
            (await db.query.integrations.findFirst({
              where: eq(integrations.id, item.connectionId!),
            })) ?? null,
          )
        }
        const integration = connectionCache.get(item.connectionId!)
        if (!integration) continue

        const connector = getConnector(integration.provider)
        const { resolveConnectionToken } = await import('./secrets')
        const token = resolveConnectionToken(integration)
        if (!connector?.postComment || !token) continue

        await connector.postComment(
          { token },
          (integration.config ?? {}) as IntegrationConfig,
          item.externalId!,
          body,
        )
        posted += 1
        await db.insert(syncLog).values({
          organizationId: integration.organizationId,
          connectionId: integration.id,
          entityType: 'work_item',
          entityId: item.workItemId,
          event: 'writeback_comment',
          actorId: null,
          payload: { planId, planTitle: plan.title, externalKey: item.externalKey },
        })
      } catch (err) {
        console.error('[writeback] comment failed:', err)
      }
    }
  } catch (err) {
    console.error('[writeback] notifyPlanCompleted failed:', err)
  }
  return posted
}
