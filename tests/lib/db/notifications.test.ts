import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, notifications } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, updateSpec, linkSpec } from '@/lib/db/specs'
import { setAssetOwners, createCodePlan, createWorkItem, updateWorkItem, createTask, createRelease, updateRelease, setReleaseAsset } from '@/lib/db/mutations'
import { addProductMember } from '@/lib/db/responsibilities'
import { requestReview, decideReview } from '@/lib/db/reviews'
import { addComment } from '@/lib/db/comments'
import { listNotifications, countUnread, markRead, markAllRead, markDone, snooze, createNotifications } from '@/lib/db/notifications'

const ERIN = 'user-erin-n' // editor, code owner of the API asset

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: ERIN, email: 'erin-n@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'm-erin-n', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
})
afterEach(async () => { await clearTables() })

const inbox = async (userId: string) => (await listNotifications(userId)).map((n) => [n.eventType, n.reason, n.title])
const types = async (userId: string) => (await listNotifications(userId)).map((n) => n.eventType)

async function apiSpec() {
  const spec = await createSpec({ productId: F.productShared, title: 'Token API', body: 'Tokens last 1h.', specType: 'api', area: 'api' }, F.alice)
  await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
  return spec
}

describe('review notifications', () => {
  it('asks reviewers, closes their request when they decide, and tells the requester on approval', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN, required: true }], note: 'Please check expiry' }, { id: F.alice })
    expect(await inbox(ERIN)).toContainEqual(['review.requested', 'code_owner', 'Alice asked you to review Token API v1'])
    expect(await types(F.alice)).not.toContain('review.requested')
    await decideReview(review.id, 'approved', undefined, { id: ERIN })
    expect(await types(ERIN)).not.toContain('review.requested')
    expect(await inbox(F.alice)).toContainEqual(['review.approved', 'requester', 'Token API v1 was approved'])
  })

  it('tells the requester and author when changes are requested', async () => {
    const spec = await apiSpec()
    const review = await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN }] }, { id: F.bob })
    await decideReview(review.id, 'changes_requested', 'Say how refresh works', { id: ERIN })
    expect(await inbox(F.bob)).toContainEqual(['review.changes_requested', 'requester', 'Erin requested changes to Token API v1'])
    expect(await inbox(F.alice)).toContainEqual(['review.changes_requested', 'author', 'Erin requested changes to Token API v1'])
  })

  it('asks for another look after a revision, and flags approvals that stop covering the text', async () => {
    const spec = await apiSpec()
    const open = await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN, required: true }, { userId: F.bob, required: true }] }, { id: F.alice })
    await decideReview(open.id, 'approved', undefined, { id: ERIN })
    await updateSpec(spec.id, { body: 'Tokens last 2h.' }, F.alice)
    expect(await types(ERIN)).toContain('review.updated')
    expect(await types(F.bob)).not.toContain('review.updated')
    await decideReview(open.id, 'approved', undefined, { id: ERIN })
    await decideReview(open.id, 'approved', undefined, { id: F.bob })
    await updateSpec(spec.id, { body: 'Tokens last 3h.' }, F.alice)
    expect(await inbox(ERIN)).toContainEqual(['review.stale', 'approver', 'Token API changed after you approved v2'])
    expect(await types(F.bob)).toContain('review.stale')
    expect(await types(F.alice)).not.toContain('review.stale') // she made the change herself
  })
})

describe('comment notifications', () => {
  it('notifies mentions, the subject author on new threads, and thread participants on replies', async () => {
    const spec = await apiSpec()
    const top = await addComment({ subjectType: 'spec', subjectId: spec.id, body: 'Is 1h enough? @Erin', mentions: [ERIN] }, { id: F.bob })
    expect(await inbox(ERIN)).toContainEqual(['comment.mention', 'mentioned', 'Bob mentioned you on Token API'])
    expect(await inbox(F.alice)).toContainEqual(['comment.created', 'author', 'Bob commented on Token API'])
    await addComment({ subjectType: 'spec', subjectId: spec.id, parentId: top.id, body: 'Yes, matches the IdP.' }, { id: F.alice })
    expect(await inbox(F.bob)).toContainEqual(['comment.reply', 'thread', 'Alice replied on Token API'])
    expect((await listNotifications(F.bob))[0].summary).toBe('Yes, matches the IdP.')
  })
})

describe('responsibility-routed notifications', () => {
  it('tells code owners when a spec is activated, and nobody about a details change', async () => {
    const spec = await apiSpec()
    await updateSpec(spec.id, { status: 'active' }, F.alice)
    expect(await inbox(ERIN)).toContainEqual(['spec.activated', 'code_owner:API Service', 'Alice activated Token API'])
    const before = (await listNotifications(ERIN)).length
    await updateSpec(spec.id, { area: 'tokens' }, F.alice)
    expect(await listNotifications(ERIN)).toHaveLength(before)
    expect(await types(ERIN)).not.toContain('spec.revised')
  })

  it('tells code owners and engineering managers about new work on their assets', async () => {
    await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
    await createWorkItem({ productId: F.productShared, assetId: F.assetApi, type: 'bug', title: 'Token leak', description: '', severity: 'high', tags: [] }, F.bob)
    expect(await inbox(ERIN)).toContainEqual(['work_item.created', 'code_owner:API Service', 'Bob filed Token leak'])
    expect(await inbox(F.alice)).toContainEqual(['work_item.created', 'eng_manager', 'Bob filed Token leak'])
  })

  it('tells code owners of target assets and engineering managers about a new plan', async () => {
    await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
    await createCodePlan({ productId: F.productShared, title: 'Token rotation', description: '', type: 'feature', tags: [], targetAssetIds: [F.assetApi] }, F.bob)
    expect(await inbox(ERIN)).toContainEqual(['plan.created', 'code_owner:API Service', 'Bob drafted the plan Token rotation'])
    expect(await inbox(F.alice)).toContainEqual(['plan.created', 'eng_manager', 'Bob drafted the plan Token rotation'])
  })

  it('tells people when work is assigned to them', async () => {
    const item = await createWorkItem({ productId: F.productShared, type: 'bug', title: 'Owned', description: '', severity: 'low', tags: [] }, F.alice)
    await updateWorkItem(item.id, { ownerId: F.bob }, { id: F.alice })
    await updateWorkItem(item.id, { title: 'Owned (renamed)' }, { id: F.alice })
    expect((await types(F.bob)).filter((t) => t === 'work_item.assigned')).toHaveLength(1)
    await createTask({ codePlanId: F.planActive, title: 'Wire refresh', description: '', priority: 'high', tags: [], assigneeId: ERIN }, { id: F.alice })
    const [n] = await listNotifications(ERIN)
    expect(n).toMatchObject({ eventType: 'task.assigned', url: `/plans/${F.planActive}` })
  })

  it('tells code owners and product members when a release ships', async () => {
    await addProductMember({ productId: F.productShared, userId: F.bob, responsibility: 'contributor' }, { id: F.alice })
    const release = await createRelease({ productId: F.productShared, name: 'R2', description: '', tags: [] }, F.alice)
    await setReleaseAsset(release.id, F.assetApi, { version: '2.0.0' }, { id: F.alice })
    await updateRelease(release.id, { status: 'shipped' }, { id: F.alice })
    expect(await types(ERIN)).toContain('release.shipped')
    expect(await types(F.bob)).toContain('release.shipped')
  })
})

describe('notification storage', () => {
  it('counts unread, marks read, done and snoozed, only for the owner', async () => {
    await createNotifications([
      { userId: F.bob, eventType: 'x', subjectType: 'spec', subjectId: 's1', reason: 'r', title: 'one', url: '/' },
      { userId: F.bob, eventType: 'x', subjectType: 'spec', subjectId: 's2', reason: 'r', title: 'two', url: '/' },
      { userId: F.bob, eventType: 'x', subjectType: 'spec', subjectId: 's3', reason: 'r', title: 'mine', url: '/', actorId: F.bob },
    ])
    expect(await countUnread(F.bob)).toBe(2)
    const [a, b] = await listNotifications(F.bob)
    await markRead(F.alice, [a.id])
    expect(await countUnread(F.bob)).toBe(2)
    await markRead(F.bob, [a.id])
    expect(await countUnread(F.bob)).toBe(1)
    await snooze(F.bob, [b.id], new Date(Date.now() + 86_400_000))
    expect((await listNotifications(F.bob)).map((n) => n.id)).toEqual([a.id])
    await markDone(F.bob, [a.id])
    expect(await listNotifications(F.bob)).toEqual([])
    expect((await listNotifications(F.bob, { includeDone: true })).length).toBe(2)
    await markAllRead(F.bob)
    expect(await countUnread(F.bob)).toBe(0)
  })

  it('delivers once per event and person', async () => {
    const row = { userId: F.bob, eventId: 'evt-1', eventType: 'x', subjectType: 'spec', subjectId: 's', reason: 'r', title: 't', url: '/' }
    await createNotifications([row])
    await createNotifications([row])
    expect(await db.query.notifications.findMany({ where: eq(notifications.userId, F.bob) })).toHaveLength(1)
  })
})
