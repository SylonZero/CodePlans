import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, workItems, codePlanAssets, syncLog, tasks, productSettings, codePlans } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, updateSpec, linkSpec } from '@/lib/db/specs'
import { setAssetOwners, createWorkItem, updateWorkItem, createRelease, setReleaseAsset, updateCodePlan } from '@/lib/db/mutations'
import { addProductMember } from '@/lib/db/responsibilities'
import { requestReview, decideReview } from '@/lib/db/reviews'
import { addComment } from '@/lib/db/comments'
import { markDone } from '@/lib/db/notifications'
import { getMyWork, reasonLabel } from '@/lib/db/my-work'
import { getEvidenceGaps } from '@/lib/db/evidence-gaps'
import { getOwnedAssets } from '@/lib/db/queries'

const ERIN = 'user-erin-mw' // editor, code owner of the API asset

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: ERIN, email: 'erin-mw@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'm-erin-mw', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
  await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
  await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'architect', area: 'api' }, { id: F.alice })
})
afterEach(async () => { await clearTables() })

const kinds = (items: { kind: string; verb: string; title: string }[]) => items.map((i) => [i.kind, i.verb, i.title])
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

describe('lenses', () => {
  it('offers lenses from responsibilities and defaults to the strongest', async () => {
    expect(await getMyWork(F.alice)).toMatchObject({ lenses: ['developer', 'eng_manager'], defaultLens: 'eng_manager' })
    expect(await getMyWork(F.bob)).toMatchObject({ lenses: ['developer', 'architect'], defaultLens: 'architect' })
    expect(await getMyWork(ERIN)).toMatchObject({ lenses: ['developer', 'code_owner'], defaultLens: 'code_owner' })
    expect(await getMyWork(F.carol)).toMatchObject({ lenses: ['developer'], defaultLens: 'developer' })
  })

  it('labels reasons for people', () => {
    expect(reasonLabel('code_owner:API Service')).toBe('code owner · API Service')
    expect(reasonLabel('mentioned')).toBe('mentioned')
  })
})

describe('needs you', () => {
  it('lists reviews waiting on me until I decide, and changes requested to the requester', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Token API', body: 'x', specType: 'api', area: 'api' }, F.alice)
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    const erin = await getMyWork(ERIN)
    expect(erin.needsYou.find((i) => i.kind === 'review')).toMatchObject({ verb: 'Review', title: 'Token API', reason: 'code_owner', lenses: ['code_owner'] })
    await decideReview(review.id, 'changes_requested', 'Explain expiry', { id: ERIN })
    expect((await getMyWork(ERIN)).needsYou.some((i) => i.kind === 'review')).toBe(false)
    expect(kinds((await getMyWork(F.alice)).needsYou)).toContainEqual(['changes_requested', 'Address feedback', 'Token API'])
  })

  it('shows mentions as event items that can be marked done', async () => {
    await addComment({ subjectType: 'code_plan', subjectId: F.planActive, body: 'Can you look? @Erin', mentions: [ERIN] }, { id: F.bob })
    const item = (await getMyWork(ERIN)).needsYou.find((i) => i.kind === 'notification')!
    expect(item).toMatchObject({ verb: 'Reply', reason: 'mentioned', title: 'Bob mentioned you on Active Plan' })
    await markDone(ERIN, [item.notificationId!])
    expect((await getMyWork(ERIN)).needsYou.some((i) => i.kind === 'notification')).toBe(false)
  })

  it('asks code owners and engineering managers to triage unowned, unplanned work', async () => {
    const item = await createWorkItem({ productId: F.productShared, assetId: F.assetApi, type: 'bug', title: 'Leaky tokens', description: '', severity: 'high', tags: [] }, F.bob)
    expect((await getMyWork(ERIN)).needsYou.find((i) => i.kind === 'triage')).toMatchObject({ title: 'Leaky tokens', reason: 'code_owner:API Service', urgent: true })
    expect((await getMyWork(F.alice)).needsYou.find((i) => i.kind === 'triage')).toMatchObject({ reason: 'eng_manager' })
    expect((await getMyWork(F.bob)).needsYou.some((i) => i.kind === 'triage')).toBe(false)
    await updateWorkItem(item.id, { ownerId: F.bob }, { id: F.alice })
    expect((await getMyWork(ERIN)).needsYou.some((i) => i.kind === 'triage')).toBe(false)
  })

  it('flags my overdue tasks', async () => {
    await (db as any).update(tasks).set({ endDate: '2020-01-01' }).where(eq(tasks.id, F.task1))
    expect(kinds((await getMyWork(F.bob)).needsYou)).toContainEqual(['overdue_task', 'Overdue', 'Task 1'])
  })
})

describe('in flight', () => {
  it('groups my tasks by plan with the plan\'s specs and warns when a spec changed after the plan started', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Plan spec', body: 'v1', specType: 'api' }, F.alice)
    await linkSpec(spec.id, 'code_plan', F.planActive, 'references', F.alice)
    await (db as any).insert(syncLog).values({ organizationId: F.org, entityType: 'code_plan', entityId: F.planActive, event: 'activated', actorId: F.alice, createdAt: daysAgo(3) })
    await updateSpec(spec.id, { body: 'v2' }, F.alice)
    const [group] = (await getMyWork(F.bob)).inFlight.taskGroups
    expect(group).toMatchObject({ planId: F.planActive, planTitle: 'Active Plan', productName: 'Shared Product' })
    expect(group.specs).toEqual([expect.objectContaining({ title: 'Plan spec', version: 2, changedSinceStart: true, approvedNow: false })])
  })

  it('lists plans I own and specs I am authoring with reviewer progress', async () => {
    await updateCodePlan(F.planDraft, { ownerId: F.alice }, { id: F.alice })
    const spec = await createSpec({ productId: F.productShared, title: 'Draft spec', body: 'x', specType: 'api' }, F.alice)
    await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: F.bob }, { userId: ERIN }] }, { id: F.alice })
    const work = await getMyWork(F.alice)
    expect(work.inFlight.plans.map((p) => p.title)).toEqual(['Draft Plan'])
    expect(work.inFlight.specs).toEqual([expect.objectContaining({ title: 'Draft spec', status: 'in_review', review: { approved: 0, total: 2, state: 'open' } })])
  })
})

describe('evidence gaps', () => {
  it('finds completed plans without PRs, unstamped release assets, ungraduated features and unapproved active specs', async () => {
    await (db as any).insert(codePlanAssets).values({ codePlanId: F.planCompleted, assetId: F.assetDb })
    const release = await createRelease({ productId: F.productShared, name: 'R1', description: '', tags: [] }, F.alice)
    await setReleaseAsset(release.id, F.assetApi, {}, { id: F.alice })
    await (db as any).insert(workItems).values({ id: 'wi-old', productId: F.productShared, assetId: F.assetApi, title: 'Shipped feature', type: 'feature', status: 'resolved', updatedAt: daysAgo(10) })
    await (db as any).insert(productSettings).values({ productId: F.productShared, workflowLevel: 'guided' })
    const spec = await createSpec({ productId: F.productShared, title: 'Live spec', body: 'x', specType: 'api' }, F.bob)
    await updateSpec(spec.id, { status: 'active' }, F.bob)
    const gaps = await getEvidenceGaps([F.productShared])
    expect(gaps.map((g) => g.kind).sort()).toEqual(['plan_without_pr', 'release_missing_version', 'spec_unapproved', 'ungraduated_feature'])
    const erin = (await getMyWork(ERIN)).needsYou.filter((i) => i.kind === 'evidence_gap').map((i) => i.title).sort()
    expect(erin).toEqual(['R1', 'Shipped feature'])
    expect((await getMyWork(F.bob)).needsYou.filter((i) => i.kind === 'evidence_gap').map((i) => i.title)).toEqual(['Live spec'])
  })
})

describe('lens panels', () => {
  it('gives engineering managers release readiness, plans at risk and merged-but-not-shipped work', async () => {
    await (db as any).update(codePlans).set({ deadline: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10) }).where(eq(codePlans.id, F.planActive))
    await (db as any).update(codePlanAssets).set({ prStatus: 'merged' }).where(eq(codePlanAssets.codePlanId, F.planActive))
    const release = await createRelease({ productId: F.productShared, name: 'R2', description: '', tags: [] }, F.alice)
    await setReleaseAsset(release.id, F.assetApi, {}, { id: F.alice })
    const { panels } = await getMyWork(F.alice)
    expect(panels.plansAtRisk).toEqual([expect.objectContaining({ title: 'Active Plan', openTasks: 2, overdue: false })])
    expect(panels.releaseReadiness).toEqual([expect.objectContaining({ name: 'R2', unstamped: 1, openPlans: 0 })])
    expect(panels.mergedNotShipped.map((p) => p.title).sort()).toEqual(['Active Plan', 'Completed Plan'])
  })

  it('gives architects the review queue for their area', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'API spec', body: 'x', specType: 'api', area: 'api' }, F.alice)
    const other = await createSpec({ productId: F.productShared, title: 'UI spec', body: 'x', specType: 'ux', area: 'ui' }, F.alice)
    await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN }] }, { id: F.alice })
    await requestReview({ subjectType: 'spec', subjectId: other.id, reviewers: [{ userId: ERIN }] }, { id: F.alice })
    expect((await getMyWork(F.bob)).panels.reviewQueue.map((r) => r.title)).toEqual(['API spec'])
  })
})

describe('getOwnedAssets', () => {
  it('only returns owned assets in products the user can see, and respects the product scope', async () => {
    await setAssetOwners(F.assetDb, [F.carol], { id: F.alice })
    expect(await getOwnedAssets(F.carol)).toEqual([])
    expect((await getOwnedAssets(ERIN)).map((a) => a.name)).toEqual(['API Service'])
    expect(await getOwnedAssets(ERIN, { productId: F.productCarol })).toEqual([])
  })
})
