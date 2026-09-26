import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, organizationMembers, assets } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createSpec, linkSpec, updateSpec } from '@/lib/db/specs'
import { setAssetOwners, createWorkItem, createCodePlan } from '@/lib/db/mutations'
import { addProductMember } from '@/lib/db/responsibilities'
import { requestReview } from '@/lib/db/reviews'
import { addComment } from '@/lib/db/comments'
import { listNotifications } from '@/lib/db/notifications'
import { setMuted, isMuted, listMutes } from '@/lib/db/notification-settings'

const ERIN = 'user-erin-m' // editor, code owner of the API and DB assets

beforeAll(async () => { await runMigrations() })
beforeEach(async () => {
  await seedFixtures()
  await (db as any).insert(users).values({ id: ERIN, email: 'erin-m@test.local', name: 'Erin', billingTier: 'free', role: 'editor', organizationId: F.org, featureFlags: {} })
  await (db as any).insert(organizationMembers).values({ id: 'm-erin-m', organizationId: F.org, userId: ERIN, role: 'editor', joinedAt: new Date() })
  await setAssetOwners(F.assetApi, [ERIN], { id: F.alice })
  await setAssetOwners(F.assetDb, [ERIN], { id: F.alice })
  await addProductMember({ productId: F.productShared, userId: F.alice, responsibility: 'eng_manager' }, { id: F.alice })
})
afterEach(async () => { await clearTables() })

const types = async (userId: string) => (await listNotifications(userId)).map((n) => n.eventType)
const bug = (title: string, assetId: string = F.assetApi) =>
  createWorkItem({ productId: F.productShared, assetId, type: 'bug', title, description: '', severity: 'high', tags: [] }, F.bob)

describe('muting an asset', () => {
  it('silences notices about it, but not about other assets or for other people', async () => {
    await setMuted(ERIN, 'asset', F.assetApi, true)
    expect(await isMuted(ERIN, 'asset', F.assetApi)).toBe(true)
    await bug('API leak')
    expect(await types(ERIN)).toEqual([])
    expect(await types(F.alice)).toEqual(['work_item.created'])
    await bug('DB leak', F.assetDb)
    expect((await listNotifications(ERIN)).map((n) => n.title)).toEqual(['Bob filed DB leak'])
  })

  it('silences a notice only when every asset that put you on it is muted', async () => {
    await setMuted(ERIN, 'asset', F.assetApi, true)
    await createCodePlan({ productId: F.productShared, title: 'Both', description: '', type: 'feature', tags: [], targetAssetIds: [F.assetApi, F.assetDb] }, F.bob)
    // Told once as owner of both, and once for the DB asset being added; the API one is muted.
    expect((await listNotifications(ERIN)).map((n) => n.reason).sort()).toEqual(['code_owner:API Service', 'code_owner:Database'])
    expect((await types(ERIN)).sort()).toEqual(['plan.created', 'plan.targets_asset'])
    await setMuted(ERIN, 'asset', F.assetDb, true)
    await createCodePlan({ productId: F.productShared, title: 'Both again', description: '', type: 'feature', tags: [], targetAssetIds: [F.assetApi, F.assetDb] }, F.bob)
    expect(await listNotifications(ERIN)).toHaveLength(2)
  })

  it('still lets required events through', async () => {
    await setMuted(ERIN, 'asset', F.assetApi, true)
    const spec = await createSpec({ productId: F.productShared, title: 'Token API', body: 'x', specType: 'api' }, F.alice)
    await linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice)
    await requestReview({ subjectType: 'spec', subjectId: spec.id, reviewers: [{ userId: ERIN }] }, { id: F.alice })
    expect(await types(ERIN)).toEqual(['review.requested'])
    await updateSpec(spec.id, { body: 'y' }, F.alice) // spec.revised to code owners: muted
    expect(await types(ERIN)).toEqual(['review.requested'])
  })
})

describe('muting a product', () => {
  it('silences everything about it except required events', async () => {
    await setMuted(ERIN, 'product', F.productShared, true)
    await bug('Leak')
    await addComment({ subjectType: 'code_plan', subjectId: F.planActive, body: 'Hey @Erin', mentions: [ERIN] }, { id: F.bob })
    expect(await types(ERIN)).toEqual(['comment.mention'])
    await setMuted(ERIN, 'product', F.productShared, false)
    await bug('Another leak')
    expect(await types(ERIN)).toContain('work_item.created')
  })
})

describe('managing mutes', () => {
  it('lists mutes by name, drops ones whose subject is gone, and only allows what you can see', async () => {
    await setMuted(ERIN, 'asset', F.assetDb, true)
    await setMuted(ERIN, 'product', F.productShared, true)
    expect((await listMutes(ERIN)).map((m) => [m.subjectType, m.name, m.context])).toEqual([
      ['asset', 'Database', 'Shared Product'], ['product', 'Shared Product', null],
    ])
    await (db as any).delete(assets).where(eq(assets.id, F.assetDb))
    expect((await listMutes(ERIN)).map((m) => m.name)).toEqual(['Shared Product'])
    await expect(setMuted(F.carol, 'product', F.productShared, true)).rejects.toThrow(/not accessible/)
    await expect(setMuted(ERIN, 'asset', 'nope', true)).rejects.toThrow(/not accessible/)
  })
})
