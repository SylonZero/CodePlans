import { eq, inArray } from 'drizzle-orm'
import { db } from './index'
import { assetOwners, codePlanAssets, codePlans, orgSettings, productSettings, products, specLinks, specs } from './schema'
import { ForbiddenError, isOrgAdmin } from './authz'
import { logAudit } from './audit'
import { isApprovedNow } from './review-state'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import type { ArtifactActor } from './attribution'
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

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/** Levels this install can use: open and guided, plus any an extension enables. */
export function availableWorkflowLevels(): WorkflowLevel[] {
  return getEnterpriseHooks().workflowLevels()
}

function assertAvailable(level: WorkflowLevel) {
  if (!availableWorkflowLevels().includes(level)) throw new Error(`The ${level} workflow is not available on this install`)
}

/** Org owners/admins set the org default. */
export async function setOrgWorkflowDefault(organizationId: string, level: WorkflowLevel, actor: ArtifactActor) {
  if (!isWorkflowLevel(level)) throw new Error('Unknown workflow level')
  assertAvailable(level)
  if (!(await isOrgAdmin(organizationId, actor.id))) throw new ForbiddenError('Only an org owner or admin can change the default review workflow.')
  await db.insert(orgSettings).values({ organizationId, workflowDefault: level, updatedById: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: orgSettings.organizationId, set: { workflowDefault: level, updatedById: actor.id, updatedAt: new Date() } })
  return { organizationId, workflowDefault: level }
}

/** Org owners/admins and the product's engineering managers set a product's level; null inherits the org default. */
export async function setProductWorkflowLevel(productId: string, level: WorkflowLevel | null, actor: ArtifactActor) {
  if (level !== null) {
    if (!isWorkflowLevel(level)) throw new Error('Unknown workflow level')
    assertAvailable(level)
  }
  const { canManageResponsibilities } = await import('./responsibilities')
  if (!(await canManageResponsibilities(actor.id, productId))) {
    throw new ForbiddenError('Only an org owner/admin or this product\'s engineering manager can change its review workflow.')
  }
  await db.insert(productSettings).values({ productId, workflowLevel: level, updatedById: actor.id, updatedAt: new Date() })
    .onConflictDoUpdate({ target: productSettings.productId, set: { workflowLevel: level, updatedById: actor.id, updatedAt: new Date() } })
  await logAudit({ entityType: 'product', entityId: productId, event: 'workflow_changed', actor, productId, payload: { workflowLevel: level } })
  return getWorkflowLevel(productId)
}

// ---------------------------------------------------------------------------
// Activation checks
// ---------------------------------------------------------------------------

export type ActivationCheck = {
  allowed: boolean
  /** Why an extension blocked the transition. */
  reasons: string[]
  /** Shown before proceeding in a guided workflow when nothing approved the current content. */
  warning: string | null
  level: WorkflowLevel
  approved: boolean
}

async function codeOwnersFor(subjectType: 'spec' | 'code_plan', subjectId: string) {
  let assetIds: string[] = []
  if (subjectType === 'code_plan') {
    assetIds = (await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(eq(codePlanAssets.codePlanId, subjectId))).map((r) => r.id)
  } else {
    const links = await db.select().from(specLinks).where(eq(specLinks.specId, subjectId))
    assetIds = links.filter((l) => l.targetType === 'asset').map((l) => l.targetId)
    const planIds = links.filter((l) => l.targetType === 'code_plan').map((l) => l.targetId)
    if (planIds.length) assetIds.push(...(await db.select({ id: codePlanAssets.assetId }).from(codePlanAssets).where(inArray(codePlanAssets.codePlanId, planIds))).map((r) => r.id))
  }
  if (!assetIds.length) return []
  return [...new Set((await db.select({ userId: assetOwners.userId }).from(assetOwners).where(inArray(assetOwners.assetId, assetIds))).map((r) => r.userId))]
}

/**
 * Every activation path asks this first: a spec becoming active, a plan being
 * activated, a task being started. The community edition never blocks — in a
 * guided workflow it returns a warning for the UI to confirm — and passes the
 * transition to the reviewGate extension hook, which may.
 */
export async function checkActivation(input: {
  subjectType: 'spec' | 'code_plan'
  subjectId: string
  transition: 'activate' | 'start_task'
  taskId?: string
  actor: ArtifactActor
}): Promise<ActivationCheck> {
  const subject = input.subjectType === 'spec'
    ? await db.query.specs.findFirst({ where: eq(specs.id, input.subjectId) }).then((s) => s && { productId: s.productId, authorId: s.createdById, noun: 'spec' })
    : await db.query.codePlans.findFirst({ where: eq(codePlans.id, input.subjectId) }).then((p) => p && { productId: p.productId, authorId: p.creatorId, noun: 'plan' })
  if (!subject) return { allowed: true, reasons: [], warning: null, level: 'open', approved: false }
  const [{ level }, approved, codeOwnerIds] = await Promise.all([
    getWorkflowLevel(subject.productId),
    isApprovedNow(input.subjectType, input.subjectId),
    codeOwnersFor(input.subjectType, input.subjectId),
  ])
  const gate = await getEnterpriseHooks().reviewGate({
    productId: subject.productId, subjectType: input.subjectType, subjectId: input.subjectId, transition: input.transition, taskId: input.taskId,
    actorId: input.actor.id, actorKind: input.actor.kind ?? 'user', workflowLevel: level, approved, codeOwnerIds, authorId: subject.authorId,
  })
  const warning = level !== 'open' && !approved && input.transition === 'activate'
    ? `This ${subject.noun} has no approval covering its current version. The product uses a ${level} review workflow.`
    : null
  return { allowed: gate.allowed, reasons: gate.reasons, warning, level, approved }
}

/** Throws with the extension's reasons when a transition is blocked. */
export async function assertActivationAllowed(input: Parameters<typeof checkActivation>[0]) {
  const check = await checkActivation(input)
  if (!check.allowed) throw new ForbiddenError(check.reasons.length ? check.reasons.join(' ') : 'This change is blocked by the review workflow.')
  return check
}
