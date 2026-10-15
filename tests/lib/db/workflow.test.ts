import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { eq } from 'drizzle-orm'
import { users, organizationMembers, productSettings, codePlans } from '@/lib/db/schema'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'
import { getWorkflowLevel, setOrgWorkflowDefault, setProductWorkflowLevel, checkActivation, availableWorkflowLevels } from '@/lib/db/workflow'
import { addProductMember } from '@/lib/db/responsibilities'
import { setAssetOwners, updateTaskStatus, updateCodePlan, updateTask, moveTaskToPlan, createCodePlan } from '@/lib/db/mutations'
import { createSpec, updateSpec } from '@/lib/db/specs'
import { requestReview, decideReview } from '@/lib/db/reviews'

const ERIN = 'user-erin-wf'

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: ERIN, email: 'erin-wf@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'm-erin-wf', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
})
afterEach(async () => { resetEnterpriseHooks(); await clearTables() })

describe('workflow levels', () => {
  it('defaults to open, inherits the org default and lets a product override it', async () => {
    expect(await getWorkflowLevel(F.productShared)).toEqual({ level: 'open', inherited: true })
    await setOrgWorkflowDefault(F.org, 'guided', { id: F.alice })
    expect(await getWorkflowLevel(F.productShared)).toEqual({ level: 'guided', inherited: true })
    await setProductWorkflowLevel(F.productShared, 'open', { id: F.alice })
    expect(await getWorkflowLevel(F.productShared)).toEqual({ level: 'open', inherited: false })
    await setProductWorkflowLevel(F.productShared, null, { id: F.alice })
    expect(await getWorkflowLevel(F.productShared)).toEqual({ level: 'guided', inherited: true })
  })

  it('restricts who can change levels', async () => {
    await expect(setOrgWorkflowDefault(F.org, 'guided', { id: F.bob })).rejects.toThrow('owner or admin')
    await expect(setProductWorkflowLevel(F.productShared, 'guided', { id: F.bob })).rejects.toThrow('engineering manager')
    await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'eng_manager' }, { id: F.alice })
    await expect(setProductWorkflowLevel(F.productShared, 'guided', { id: F.bob })).resolves.toMatchObject({ level: 'guided' })
  })

  it('offers all three levels, unless an extension narrows them', async () => {
    expect(availableWorkflowLevels()).toEqual(['open', 'guided', 'gated'])
    await expect(setProductWorkflowLevel(F.productShared, 'gated', { id: F.alice })).resolves.toMatchObject({ level: 'gated' })
    registerEnterpriseHooks({ workflowLevels: () => ['open', 'guided'] })
    await expect(setProductWorkflowLevel(F.productShared, 'gated', { id: F.alice })).rejects.toThrow('not available')
  })
})

describe('activation checks', () => {
  it('warns in a guided workflow until an approval covers the current version, and never blocks by itself', async () => {
    expect((await checkActivation({ subjectType: 'code_plan', subjectId: F.planDraft, transition: 'activate', actor: { id: F.alice } })).warning).toBeNull()
    await setProductWorkflowLevel(F.productShared, 'guided', { id: F.alice })
    const check = await checkActivation({ subjectType: 'code_plan', subjectId: F.planActive, transition: 'activate', actor: { id: F.alice } })
    expect(check).toMatchObject({ allowed: true, level: 'guided', approved: false })
    expect(check.warning).toContain('no approval')
    const review = await requestReview({ subjectType: 'code_plan', subjectId: F.planActive }, { id: F.bob })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    expect((await checkActivation({ subjectType: 'code_plan', subjectId: F.planActive, transition: 'activate', actor: { id: F.alice } })).warning).toBeNull()
  })

  it('lets an extension block agents from starting tasks on unapproved plans', async () => {
    const seen: unknown[] = []
    registerEnterpriseHooks({
      reviewGate: (ctx) => {
        seen.push(ctx)
        return ctx.transition === 'start_task' && ctx.actorKind === 'agent' && !ctx.approved
          ? { allowed: false, reasons: ['Plan needs approval before agents start work.'] }
          : { allowed: true, reasons: [] }
      },
    })
    await expect(updateTaskStatus(F.task1, 'in_progress', { id: F.bob, kind: 'agent' })).rejects.toThrow('Plan needs approval')
    await expect(updateTaskStatus(F.task1, 'in_progress', { id: F.bob })).resolves.toMatchObject({ status: 'in_progress' })
    expect(seen[0]).toMatchObject({ subjectType: 'code_plan', subjectId: F.planActive, transition: 'start_task', taskId: F.task1, codeOwnerIds: [ERIN], authorId: F.alice })
  })

  it('runs the gate on plan and spec activation', async () => {
    registerEnterpriseHooks({ reviewGate: (ctx) => ctx.transition === 'activate' ? { allowed: false, reasons: ['Needs approval.'] } : { allowed: true, reasons: [] } })
    await expect(updateCodePlan(F.planDraft, { status: 'active' }, { id: F.alice })).rejects.toThrow('Needs approval.')
    const spec = await createSpec({ productId: F.productShared, title: 'S', body: 'b', specType: 'api' }, F.alice)
    await expect(updateSpec(spec.id, { status: 'active' }, F.alice)).rejects.toThrow('Needs approval.')
    await expect(updateSpec(spec.id, { body: 'edit only' }, F.alice)).resolves.toMatchObject({ version: 2 })
  })
})

describe('gated workflow', () => {
  const approve = async (subjectType: 'spec' | 'code_plan', subjectId: string) => {
    const review = await requestReview({ subjectType, subjectId, reviewers: [{ userId: ERIN, required: true }] }, { id: F.alice })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
  }
  beforeEach(async () => { await setProductWorkflowLevel(F.productShared, 'gated', { id: F.alice }) })

  it('blocks plan activation until an approval covers the current revision', async () => {
    const check = await checkActivation({ subjectType: 'code_plan', subjectId: F.planDraft, transition: 'activate', actor: { id: F.alice } })
    expect(check).toMatchObject({ allowed: false, level: 'gated', approved: false, warning: null })
    expect(check.reasons[0]).toMatch(/gated review workflow.*before it can be activated/)
    await expect(updateCodePlan(F.planDraft, { status: 'active' }, { id: F.alice })).rejects.toThrow('gated review workflow')
    await approve('code_plan', F.planDraft)
    // A scope edit in the same change starts a revision nobody approved.
    await expect(updateCodePlan(F.planDraft, { status: 'active', description: 'Wider scope' }, { id: F.alice })).rejects.toThrow('gated review workflow')
    await expect(updateCodePlan(F.planDraft, { status: 'active' }, { id: F.alice })).resolves.toMatchObject({ status: 'active' })
  })

  it('blocks starting or finishing tasks on a plan no approval covers, for people and agents', async () => {
    await expect(updateTaskStatus(F.task1, 'in_progress', { id: F.bob })).rejects.toThrow('before its tasks can start')
    await expect(updateTaskStatus(F.task1, 'done', { id: F.bob, kind: 'agent' })).rejects.toThrow('before its tasks can start')
    await expect(updateTask(F.task1, { status: 'done' }, { id: F.bob })).rejects.toThrow('before its tasks can start')
    // Work already under way isn't blocked from finishing.
    await expect(updateTaskStatus(F.task2, 'done', { id: F.bob })).resolves.toMatchObject({ status: 'done' })

    await approve('code_plan', F.planActive)
    await expect(updateTaskStatus(F.task1, 'in_progress', { id: F.bob })).resolves.toMatchObject({ status: 'in_progress' })
  })

  it('blocks new task starts again once the plan is edited after approval', async () => {
    await approve('code_plan', F.planActive)
    await updateCodePlan(F.planActive, { description: 'Changed scope' }, { id: F.alice })
    await expect(updateTaskStatus(F.task1, 'in_progress', { id: F.bob })).rejects.toThrow('before its tasks can start')
  })

  it('treats moving started work onto an unapproved plan as starting it there', async () => {
    await approve('code_plan', F.planActive)
    const other = await createCodePlan({ productId: F.productShared, title: 'Next iteration', description: 'd', type: 'feature', tags: [], targetAssetIds: [] }, F.alice)
    await (db as any).update(codePlans).set({ status: 'active' }).where(eq(codePlans.id, other.id))
    await expect(moveTaskToPlan(F.task2, other.id, { id: F.bob })).rejects.toThrow('before its tasks can start')
    await expect(moveTaskToPlan(F.task1, other.id, { id: F.bob })).resolves.toMatchObject({ codePlanId: other.id })
  })

  it('blocks spec activation until approved, including an edit made in the same change', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'S', body: 'b', specType: 'api' }, F.alice)
    await expect(updateSpec(spec.id, { status: 'active' }, F.alice)).rejects.toThrow('gated review workflow')
    await approve('spec', spec.id)
    await expect(updateSpec(spec.id, { status: 'active', body: 'edited' }, F.alice)).rejects.toThrow('gated review workflow')
    await expect(updateSpec(spec.id, { status: 'active' }, F.alice)).resolves.toMatchObject({ status: 'active' })
  })

  it('adds an extension\'s reasons to its own', async () => {
    registerEnterpriseHooks({ reviewGate: () => ({ allowed: false, reasons: ['Release freeze.'] }) })
    const check = await checkActivation({ subjectType: 'code_plan', subjectId: F.planDraft, transition: 'activate', actor: { id: F.alice } })
    expect(check.allowed).toBe(false)
    expect(check.reasons).toHaveLength(2)
    expect(check.reasons[1]).toBe('Release freeze.')
  })

  it('lets the only member of a product review and approve their own work', async () => {
    await (db as any).insert(productSettings).values({ productId: F.productCarol, workflowLevel: 'gated', updatedById: F.carol, updatedAt: new Date() })
    const plan = await createCodePlan({ productId: F.productCarol, title: 'Solo plan', description: 'd', type: 'feature', tags: [], targetAssetIds: [] }, F.carol)
    await expect(updateCodePlan(plan.id, { status: 'active' }, { id: F.carol })).rejects.toThrow('gated review workflow')
    const review = await requestReview({ subjectType: 'code_plan', subjectId: plan.id }, { id: F.carol })
    await decideReview(review.id, 'approved', undefined, { id: F.carol })
    await expect(updateCodePlan(plan.id, { status: 'active' }, { id: F.carol })).resolves.toMatchObject({ status: 'active' })
  })

  it('still refuses self-review when someone else can see the product', async () => {
    await expect(requestReview({ subjectType: 'code_plan', subjectId: F.planDraft, reviewers: [] }, { id: F.alice })).rejects.toThrow('other than yourself')
  })
})
