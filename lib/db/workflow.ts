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
 * Review workflow levels:
 *  - open (default): anyone can request a review; nothing waits on one.
 *  - guided: reviewers are added from responsibilities automatically and
 *    activating unapproved work shows a warning, but is allowed.
 *  - gated: as guided, but a spec or plan can't be activated, and a plan's
 *    tasks can't be started, until an approval covers its current version.
 * An extension can narrow the levels offered (workflowLevels) and add rules
 * of its own (reviewGate).
 */
export const WORKFLOW_LEVELS = ['open', 'guided', 'gated'] as const satisfies readonly WorkflowLevel[]

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

/** Levels this install offers: all three, unless an extension narrows them. */
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
  /** Why the transition is blocked: a gated workflow, or an extension. */
  reasons: string[]
  /** The gated workflow blocked it (its reason comes first); any other reasons are an extension's. */
  blockedByWorkflow: boolean
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

/** A transition refused by the review workflow; its message says why. */
export class ReviewGateError extends ForbiddenError {}

/**
 * Every activation path asks this first: a spec becoming active, a plan being
 * activated, a task being started. A gated workflow blocks the transition
 * unless an approval covers the subject's current version; a guided one
 * returns a warning for the UI to confirm. The reviewGate extension hook can
 * block it too.
 */
export async function checkActivation(input: {
  subjectType: 'spec' | 'code_plan'
  subjectId: string
  transition: 'activate' | 'start_task'
  taskId?: string
  actor: ArtifactActor
  /** The same change also edits the content, so no existing approval will cover the result. */
  changesContent?: boolean
}): Promise<ActivationCheck> {
  const subject = input.subjectType === 'spec'
    ? await db.query.specs.findFirst({ where: eq(specs.id, input.subjectId) }).then((s) => s && { productId: s.productId, authorId: s.createdById, noun: 'spec' })
    : await db.query.codePlans.findFirst({ where: eq(codePlans.id, input.subjectId) }).then((p) => p && { productId: p.productId, authorId: p.creatorId, noun: 'plan' })
  if (!subject) return { allowed: true, reasons: [], blockedByWorkflow: false, warning: null, level: 'open', approved: false }
  const [{ level }, approvedNow, codeOwnerIds] = await Promise.all([
    getWorkflowLevel(subject.productId),
    isApprovedNow(input.subjectType, input.subjectId),
    codeOwnersFor(input.subjectType, input.subjectId),
  ])
  const approved = approvedNow && !input.changesContent
  const gate = await getEnterpriseHooks().reviewGate({
    productId: subject.productId, subjectType: input.subjectType, subjectId: input.subjectId, transition: input.transition, taskId: input.taskId,
    actorId: input.actor.id, actorKind: input.actor.kind ?? 'user', workflowLevel: level, approved, codeOwnerIds, authorId: subject.authorId,
  })
  const reasons: string[] = []
  const blockedByWorkflow = level === 'gated' && !approved
  if (blockedByWorkflow) {
    reasons.push(input.transition === 'activate'
      ? `This product uses a gated review workflow, so the ${subject.noun} needs an approval covering its current version before it can be activated. Request a review from its Review panel.`
      : 'This product uses a gated review workflow, so the plan needs an approval covering its current revision before its tasks can start. Request a review from the plan\'s Review panel.')
  }
  if (!gate.allowed) reasons.push(...gate.reasons)
  const allowed = reasons.length === 0 && gate.allowed
  const warning = allowed && level !== 'open' && !approved && input.transition === 'activate'
    ? `This ${subject.noun} has no approval covering its current version. The product uses a ${level} review workflow.`
    : null
  return { allowed, reasons, blockedByWorkflow, warning, level, approved }
}

/** Throws with the extension's reasons when a transition is blocked. */
export async function assertActivationAllowed(input: Parameters<typeof checkActivation>[0]) {
  const check = await checkActivation(input)
  if (!check.allowed) throw new ReviewGateError(check.reasons.length ? check.reasons.join(' ') : 'This change is blocked by the review workflow.')
  return check
}
