import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers } from '@/lib/db/schema'
import { registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'
import { getWorkflowLevel, setOrgWorkflowDefault, setProductWorkflowLevel, checkActivation, availableWorkflowLevels } from '@/lib/db/workflow'
import { addProductMember } from '@/lib/db/responsibilities'
import { setAssetOwners, updateTaskStatus, updateCodePlan } from '@/lib/db/mutations'
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

  it('offers gated only when an extension enables it', async () => {
    expect(availableWorkflowLevels()).toEqual(['open', 'guided'])
    await expect(setProductWorkflowLevel(F.productShared, 'gated', { id: F.alice })).rejects.toThrow('not available')
    registerEnterpriseHooks({ workflowLevels: () => ['open', 'guided', 'gated'] })
    await expect(setProductWorkflowLevel(F.productShared, 'gated', { id: F.alice })).resolves.toMatchObject({ level: 'gated' })
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
