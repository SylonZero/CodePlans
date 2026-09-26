import { eq } from 'drizzle-orm'
import { db } from './index'
import { orgSettings, productSettings, products } from './schema'
import type { WorkflowLevel } from './schema.sqlite'

/**
 * Review workflow levels. The community edition ships two:
 *  - open (default): anyone can request a review; nothing waits on one.
 *  - guided: reviewers are added from responsibilities automatically and
 *    activating unapproved work shows a warning, but is allowed.
 * 'gated' is stored and reported so an extension (the reviewGate hook) can
 * enforce it; without one it behaves like guided.
 */
export const WORKFLOW_LEVELS = ['open', 'guided', 'gated'] as const satisfies readonly WorkflowLevel[]
export const COMMUNITY_WORKFLOW_LEVELS = ['open', 'guided'] as const

export function isWorkflowLevel(value: unknown): value is WorkflowLevel {
  return typeof value === 'string' && (WORKFLOW_LEVELS as readonly string[]).includes(value)
}

export async function getOrgWorkflowDefault(organizationId: string | null): Promise<WorkflowLevel> {
  if (!organizationId) return 'open'
  const row = await db.query.orgSettings.findFirst({ where: eq(orgSettings.organizationId, organizationId) })
  return (row?.workflowDefault as WorkflowLevel | undefined) ?? 'open'
}

/** The product's own level, or its org's default when the product doesn't set one. */
export async function getWorkflowLevel(productId: string): Promise<{ level: WorkflowLevel; inherited: boolean }> {
  const [product, own] = await Promise.all([
    db.query.products.findFirst({ where: eq(products.id, productId) }),
    db.query.productSettings.findFirst({ where: eq(productSettings.productId, productId) }),
  ])
  if (own?.workflowLevel) return { level: own.workflowLevel as WorkflowLevel, inherited: false }
  return { level: await getOrgWorkflowDefault(product?.organizationId ?? null), inherited: true }
}
