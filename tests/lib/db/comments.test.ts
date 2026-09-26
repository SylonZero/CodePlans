import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, syncLog } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, updateSpec } from '@/lib/db/specs'
import { addComment, editComment, deleteComment, resolveComment, listComments, anchorStatus, countOpenThreads } from '@/lib/db/comments'

const DAVE = 'user-dave-cmt' // viewer member

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: DAVE, email: 'dave-cmt@test.local', name: 'Dave', billingTier: 'free', role: 'viewer', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'member-dave-cmt', organizationId: F.org, userId: DAVE, role: 'viewer', joinedAt: new Date() })
})
afterEach(async () => { await clearTables() })

describe('comments', () => {
  it('threads replies under a top-level comment pinned to the subject version', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Tokens', body: 'Tokens expire after 1 hour.', specType: 'api' }, F.alice)
    const top = await addComment({ subjectType: 'spec', subjectId: spec.id, body: 'Why an hour?', kind: 'question' }, { id: F.bob })
    await addComment({ subjectType: 'spec', subjectId: spec.id, body: 'Matches the IdP default.', parentId: top.id }, { id: F.alice })
    const threads = await listComments('spec', spec.id, F.alice)
    expect(threads).toHaveLength(1)
    expect(threads[0]).toMatchObject({ body: 'Why an hour?', kind: 'question', authorName: 'Bob', subjectVersion: 1 })
    expect(threads[0].replies.map((r) => r.body)).toEqual(['Matches the IdP default.'])
  })

  it('lets viewers comment but not people outside the product', async () => {
    await addComment({ subjectType: 'code_plan', subjectId: F.planActive, body: 'Looks risky' }, { id: DAVE })
    await expect(addComment({ subjectType: 'code_plan', subjectId: F.planActive, body: 'hi' }, { id: F.carol })).rejects.toThrow('accessible')
    await expect(listComments('code_plan', F.planActive, F.carol)).rejects.toThrow('accessible')
  })

  it('rejects replies to replies and replies across subjects', async () => {
    const top = await addComment({ subjectType: 'asset', subjectId: F.assetApi, body: 'a' }, { id: F.bob })
    const reply = await addComment({ subjectType: 'asset', subjectId: F.assetApi, body: 'b', parentId: top.id }, { id: F.alice })
    await expect(addComment({ subjectType: 'asset', subjectId: F.assetApi, body: 'c', parentId: reply.id }, { id: F.bob })).rejects.toThrow('top-level')
    await expect(addComment({ subjectType: 'asset', subjectId: F.assetDb, body: 'c', parentId: top.id }, { id: F.bob })).rejects.toThrow('not found')
  })

  it('keeps only mentions of people who can see the product', async () => {
    const c = await addComment({ subjectType: 'work_item', subjectId: await workItemId(), body: '@Bob @Carol', mentions: [F.bob, F.carol, F.bob] }, { id: F.alice })
    expect(c.mentions).toEqual([F.bob])
    const [thread] = await listComments('work_item', c.subjectId, F.alice)
    expect(thread.mentions).toEqual([{ id: F.bob, name: 'Bob' }])
  })

  it('marks anchored comments outdated once the quoted text is revised away', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Retry', body: 'Retry **three** times with backoff.', specType: 'api' }, F.alice)
    await addComment({ subjectType: 'spec', subjectId: spec.id, body: 'Too many?', anchor: { quote: 'Retry three times' } }, { id: F.bob })
    expect((await listComments('spec', spec.id, F.bob))[0].anchorStatus).toBe('anchored')
    await updateSpec(spec.id, { body: 'Retry twice with backoff.' }, F.alice)
    const [thread] = await listComments('spec', spec.id, F.bob)
    expect(thread).toMatchObject({ anchorStatus: 'outdated', subjectVersion: 1 })
  })

  it('edits only by author, deletes softly, and resolves threads', async () => {
    const c = await addComment({ subjectType: 'release', subjectId: await releaseId(), body: 'typo' }, { id: F.bob })
    await expect(editComment(c.id, 'x', { id: F.alice })).rejects.toThrow('author')
    expect((await editComment(c.id, 'fixed', { id: F.bob })).editedAt).toBeTruthy()
    await expect(resolveComment(c.id, true, { id: DAVE })).rejects.toThrow('edit access')
    await resolveComment(c.id, true, { id: F.alice })
    expect(await countOpenThreads('release', [c.subjectId])).toEqual(new Map())
    await resolveComment(c.id, false, { id: F.alice })
    expect((await countOpenThreads('release', [c.subjectId])).get(c.subjectId)).toBe(1)
    await expect(deleteComment(c.id, { id: DAVE })).rejects.toThrow('author')
    await deleteComment(c.id, { id: F.alice })
    expect(await listComments('release', c.subjectId, F.alice)).toEqual([])
  })

  it('audits comments against the subject', async () => {
    const c = await addComment({ subjectType: 'code_plan', subjectId: F.planActive, body: 'ok' }, { id: F.bob, kind: 'agent' })
    const rows = await db.query.syncLog.findMany({ where: eq(syncLog.entityId, F.planActive) })
    expect(rows.find((r) => r.event === 'commented')).toMatchObject({ actorKind: 'agent', productId: F.productShared, payload: expect.objectContaining({ commentId: c.id }) })
  })
})

describe('anchorStatus', () => {
  it('ignores whitespace differences and reports null without an anchor', () => {
    expect(anchorStatus({ quote: 'a   b' }, 'x a b y')).toBe('anchored')
    expect(anchorStatus(null, 'x')).toBeNull()
    expect(anchorStatus({ quote: 'gone' }, 'x')).toBe('outdated')
  })
})

async function workItemId() {
  const { createWorkItem } = await import('@/lib/db/mutations')
  return (await createWorkItem({ productId: F.productShared, type: 'bug', title: 'W', description: '', severity: 'low', tags: [] }, F.alice)).id
}
async function releaseId() {
  const { createRelease } = await import('@/lib/db/mutations')
  return (await createRelease({ productId: F.productShared, name: 'R1', description: '', tags: [] }, F.alice)).id
}
