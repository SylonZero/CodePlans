import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, productSettings, specs, codePlans, workItems, comments } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, updateSpec, linkSpec, supersedeSpec } from '@/lib/db/specs'
import { setAssetOwners, addPlanAsset, graduateWorkItem } from '@/lib/db/mutations'
import { addProductMember } from '@/lib/db/responsibilities'
import {
  suggestReviewers, requestReview, decideReview, withdrawReview, addReviewers, getReviewSummary, listOpenReviews,
} from '@/lib/db/reviews'
import { lastApprovedVersion } from '@/lib/db/review-state'

const ERIN = 'user-erin' // editor, code owner of the API asset
const DAVE = 'user-dave-rev' // viewer

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  const d = db as any
  await d.insert(users).values([
    { id: ERIN, email: 'erin@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} },
    { id: DAVE, email: 'dave-rev@test.local', name: 'Dave', billingTier: 'free', role: 'viewer', organizationId: F.org, featureFlags: {} },
  ])
  await d.insert(organizationMembers).values([
    { id: 'm-erin', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() },
    { id: 'm-dave-rev', organizationId: F.org, userId: DAVE, role: 'viewer', joinedAt: new Date() },
  ])
  await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'architect', area: 'api' }, { id: F.alice })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
})
afterEach(async () => { await clearTables() })

async function apiSpec() {
  const spec = await createSpec({ productId: F.productShared, title: 'Token API', body: 'Tokens last 1h.', specType: 'api', area: 'api' }, F.alice)
  await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
  return spec
}
const specRow = async (id: string) => (await db.query.specs.findFirst({ where: eq(specs.id, id) }))!

describe('suggested reviewers', () => {
  it('suggests the area architect and linked-asset code owners for a spec, never the requester', async () => {
    const spec = await apiSpec()
    await addProductMember({ productId: F.productShared, userId: DAVE, responsibility: 'architect', area: 'ui' }, { id: F.alice })
    const s = await suggestReviewers('spec', spec.id, F.alice)
    expect(s.map((x) => [x.name, x.reason, x.required])).toEqual([['Bob', 'architect', true], ['Erin', 'code_owner', true]])
    expect((await suggestReviewers('spec', spec.id, F.bob)).map((x) => x.name)).toEqual(['Erin'])
  })

  it('suggests target code owners (required) and engineering managers (optional) for a plan', async () => {
    await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
    const s = await suggestReviewers('code_plan', F.planActive, F.bob)
    expect(s.map((x) => [x.name, x.reason, x.required])).toEqual([['Erin', 'code_owner', true], ['Alice', 'eng_manager', false]])
  })
})

describe('requesting a review', () => {
  it('uses suggestions in an open workflow, moves a draft spec into review without a new version', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    expect(review).toMatchObject({ subjectVersion: 1, state: 'open' })
    expect(await specRow(spec.id)).toMatchObject({ status: 'in_review', version: 1 })
    const summary = await getReviewSummary('spec', spec.id, F.bob)
    expect(summary.current?.participants.map((p) => p.name)).toEqual(['Bob', 'Erin'])
    expect(summary.viewer).toMatchObject({ isReviewer: true, decision: 'pending', canRequest: false })
    await expect(requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })).rejects.toThrow('already has an open review')
  })

  it('takes only the chosen reviewers in an open workflow and refuses viewers and self-review', async () => {
    const spec = await apiSpec()
    await expect(requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: DAVE })).rejects.toThrow('view-only')
    await expect(requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: F.alice }] }, { id: F.alice })).rejects.toThrow('at least one reviewer')
    await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: DAVE }] }, { id: F.alice })
    const s = await getReviewSummary('spec', spec.id, F.alice)
    expect(s.current?.participants).toEqual([expect.objectContaining({ name: 'Dave', reason: 'requested', required: false })])
  })

  it('always adds suggested reviewers as required in a guided workflow', async () => {
    await (db as any).insert(productSettings).values({ productId: F.productShared, workflowLevel: 'guided' })
    const spec = await apiSpec()
    await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: DAVE }, { userId: ERIN, required: false }] }, { id: F.alice })
    const s = await getReviewSummary('spec', spec.id, F.alice)
    expect(s.workflowLevel).toBe('guided')
    expect(s.current?.participants.map((p) => [p.name, p.required])).toEqual([['Bob', true], ['Erin', true], ['Dave', false]])
  })
})

describe('decisions pinned to a version', () => {
  it('approves when every required reviewer approves the current version', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    expect((await decideReview(review.id, 'approved', undefined, { id: F.bob })).state).toBe('open')
    expect((await decideReview(review.id, 'approved', 'LGTM', { id: ERIN })).state).toBe('approved')
    expect(await lastApprovedVersion('spec', spec.id)).toBe(1)
    const notes = await db.query.comments.findMany({ where: eq(comments.reviewId, review.id) })
    expect(notes.map((n) => n.body)).toEqual(['LGTM'])
  })

  it('blocks on requested changes, which need a note, and re-opens when the spec is revised', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    await expect(decideReview(review.id, 'changes_requested', '', { id: F.bob })).rejects.toThrow('what needs to change')
    expect((await decideReview(review.id, 'changes_requested', 'Say how refresh works', { id: F.bob })).state).toBe('changes_requested')
    await updateSpec(spec.id, { body: 'Tokens last 1h and refresh on use.' }, F.alice)
    const s = await getReviewSummary('spec', spec.id, F.alice)
    expect(s.current?.state).toBe('open')
    expect(s.current?.participants.every((p) => p.outdated)).toBe(true)
    await decideReview(review.id, 'approved', undefined, { id: F.bob })
    expect((await decideReview(review.id, 'approved', undefined, { id: ERIN })).state).toBe('approved')
    expect(await lastApprovedVersion('spec', spec.id)).toBe(2)
  })

  it('only lets human reviewers on the review decide', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await expect(decideReview(review.id, 'approved', undefined, { id: F.alice })).rejects.toThrow('Only reviewers')
    await expect(decideReview(review.id, 'approved', undefined, { id: F.bob, kind: 'agent' })).rejects.toThrow('Agents')
    await expect(decideReview(review.id, 'approved', undefined, { id: F.carol })).rejects.toThrow('accessible')
  })

  it('marks an approval stale when content changes, but not for a status-only change', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await decideReview(review.id, 'approved', undefined, { id: F.bob })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    await updateSpec(spec.id, { status: 'active' }, F.alice)
    let s = await getReviewSummary('spec', spec.id, F.alice)
    expect(s).toMatchObject({ currentVersion: 2, lastApprovedVersion: 1, approvedNow: true })
    expect(s.history[0].state).toBe('approved')
    await updateSpec(spec.id, { body: 'Tokens last 2h.' }, F.alice)
    s = await getReviewSummary('spec', spec.id, F.alice)
    expect(s).toMatchObject({ currentVersion: 3, lastApprovedVersion: 1, approvedNow: false })
    expect(s.history[0].state).toBe('stale')
    expect(s.viewer.canRequest).toBe(true)
  })
})

describe('plan reviews and revisions', () => {
  it('bumps the plan revision when scope changes and stales its approval', async () => {
    const review = await requestReview({ subjectType: 'code_plan', subjectId: F.planActive }, { id: F.bob })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    expect(await lastApprovedVersion('code_plan', F.planActive)).toBe(1)
    await addPlanAsset(F.planActive, F.assetDb, { id: F.bob })
    expect((await db.query.codePlans.findFirst({ where: eq(codePlans.id, F.planActive) }))!.revision).toBe(2)
    expect((await getReviewSummary('code_plan', F.planActive, F.bob)).history[0].state).toBe('stale')
    const spec = await apiSpec()
    await linkSpec(spec.id, 'code_plan', F.planActive, 'references', F.alice)
    await linkSpec(spec.id, 'code_plan', F.planActive, 'references', F.alice)
    expect((await db.query.codePlans.findFirst({ where: eq(codePlans.id, F.planActive) }))!.revision).toBe(3)
  })
})

describe('closing reviews', () => {
  it('withdraws a review and returns the spec to draft', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await expect(withdrawReview(review.id, { id: DAVE })).rejects.toThrow('view-only')
    await withdrawReview(review.id, { id: F.alice })
    expect((await specRow(spec.id)).status).toBe('draft')
    await expect(decideReview(review.id, 'approved', undefined, { id: F.bob })).rejects.toThrow('closed')
  })

  it('withdraws an open review when the spec is superseded', async () => {
    const spec = await apiSpec()
    await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await supersedeSpec(spec.id, 'new approach', undefined, F.alice)
    expect((await getReviewSummary('spec', spec.id, F.alice)).history[0].state).toBe('withdrawn')
  })

  it('adds reviewers to an open review and lists what awaits each person', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: F.bob, required: true }] }, { id: F.alice })
    await addReviewers(review.id, [{ userId: DAVE }], { id: F.alice })
    expect((await listOpenReviews(DAVE, { awaitingUserId: DAVE })).map((r) => r.subjectTitle)).toEqual(['Token API'])
    await decideReview(review.id, 'commented', 'Reads fine', { id: DAVE })
    expect(await listOpenReviews(DAVE, { awaitingUserId: DAVE })).toEqual([])
    expect(await listOpenReviews(F.carol)).toEqual([])
  })
})

describe('graduation pins the approved version', () => {
  it('pins the approved version when the current content has not been approved', async () => {
    const spec = await apiSpec()
    await (db as any).insert(workItems).values({ id: 'wi-grad', productId: F.productShared, assetId: F.assetApi, title: 'Token refresh', type: 'feature', status: 'resolved' })
    await linkSpec(spec.id, 'work_item', 'wi-grad', undefined, F.alice)
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id }, { id: F.alice })
    await decideReview(review.id, 'approved', undefined, { id: F.bob })
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    await updateSpec(spec.id, { body: 'Next iteration, not yet agreed.' }, F.alice)
    const result = await graduateWorkItem('wi-grad', undefined, { id: F.alice })
    expect((result as any).capability.sourceSpecVersion).toBe(1)
  })

  it('accepts an explicit version within range', async () => {
    const spec = await apiSpec()
    await (db as any).insert(workItems).values({ id: 'wi-grad2', productId: F.productShared, assetId: F.assetApi, title: 'X', type: 'feature', status: 'resolved' })
    await linkSpec(spec.id, 'work_item', 'wi-grad2', undefined, F.alice)
    await updateSpec(spec.id, { body: 'v2' }, F.alice)
    expect(await graduateWorkItem('wi-grad2', undefined, { id: F.alice }, { sourceSpecVersion: 9 })).toHaveProperty('error')
    const ok = await graduateWorkItem('wi-grad2', undefined, { id: F.alice }, { sourceSpecVersion: 1 })
    expect((ok as any).capability.sourceSpecVersion).toBe(1)
  })
})
