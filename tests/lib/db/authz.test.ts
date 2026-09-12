import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import {
  isOrgOwner,
  canDeleteProduct,
  canDeleteCodePlan,
  canDeleteRelease,
  canDeleteWorkItem,
  canDeleteTask,
} from '@/lib/db/authz'
import { createCodePlan, createRelease, createWorkItem } from '@/lib/db/mutations'

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
})

afterEach(async () => {
  await clearTables()
})

describe('isOrgOwner', () => {
  it('returns true for the organization\'s durable owner', async () => {
    // F.org.ownerId is F.alice per seedFixtures.
    expect(await isOrgOwner(F.org, F.alice)).toBe(true)
  })

  it('returns false for a non-owner member, even one with role="owner" on their membership row', async () => {
    // Bob is an editor member of F.org — not organizations.ownerId. This is
    // exactly the case this function exists to get right: role is mutable
    // and must never substitute for the durable ownerId check.
    expect(await isOrgOwner(F.org, F.bob)).toBe(false)
  })

  it('returns false for a user with no relationship to the organization', async () => {
    expect(await isOrgOwner(F.org, F.carol)).toBe(false)
  })

  it('returns false for a nonexistent organization id', async () => {
    expect(await isOrgOwner('org-does-not-exist', F.alice)).toBe(false)
  })
})

describe('canDeleteProduct', () => {
  it('allows the org owner to delete a product they did not create', async () => {
    // F.productShared was created by alice, who is also the org owner —
    // not a useful override test on its own, but bob (editor, not creator)
    // must be blocked from it.
    expect(await canDeleteProduct(F.bob, F.productShared)).toBe(false)
  })

  it('allows the creator to delete their own product', async () => {
    expect(await canDeleteProduct(F.alice, F.productShared)).toBe(true)
  })

  it('blocks an editor who neither created nor owns the org', async () => {
    expect(await canDeleteProduct(F.bob, F.productShared)).toBe(false)
  })

  it('for an org-less (personal) product, only the creator may delete — no owner override exists', async () => {
    // F.productCarol has organizationId: null, creatorId: F.carol.
    expect(await canDeleteProduct(F.carol, F.productCarol)).toBe(true)
    expect(await canDeleteProduct(F.alice, F.productCarol)).toBe(false)
  })

  it('returns false for a nonexistent product', async () => {
    expect(await canDeleteProduct(F.alice, 'product-does-not-exist')).toBe(false)
  })
})

describe('canDeleteCodePlan', () => {
  it('allows the creator to delete their own plan', async () => {
    // F.planDraft was created by alice per seedFixtures.
    expect(await canDeleteCodePlan(F.alice, F.planDraft)).toBe(true)
  })

  it('blocks a non-creator editor', async () => {
    expect(await canDeleteCodePlan(F.bob, F.planDraft)).toBe(false)
  })

  it('allows the org owner to delete a plan created by someone else', async () => {
    const bobsPlan = await createCodePlan(
      { title: 'Bobs plan', description: '', productId: F.productShared, type: 'feature', tags: [], targetAssetIds: [] },
      F.bob,
    )
    expect(await canDeleteCodePlan(F.bob, bobsPlan.id)).toBe(true) // creator
    expect(await canDeleteCodePlan(F.alice, bobsPlan.id)).toBe(true) // owner override
    expect(await canDeleteCodePlan(F.carol, bobsPlan.id)).toBe(false) // unrelated, not even a member
  })
})

describe('canDeleteRelease', () => {
  it('allows the creator, blocks an unrelated editor, allows the owner override', async () => {
    const release = await createRelease({ productId: F.productShared, name: 'v1' }, F.bob)
    expect(await canDeleteRelease(F.bob, release.id)).toBe(true)
    expect(await canDeleteRelease(F.alice, release.id)).toBe(true)
    expect(await canDeleteRelease(F.carol, release.id)).toBe(false)
  })
})

describe('canDeleteWorkItem', () => {
  it('allows the reporter, blocks an unrelated editor, allows the owner override', async () => {
    const item = await createWorkItem(
      { productId: F.productShared, type: 'bug', title: 'Bug', description: '', severity: 'high', tags: [] },
      F.bob,
    )
    expect(await canDeleteWorkItem(F.bob, item.id)).toBe(true) // reporter
    expect(await canDeleteWorkItem(F.alice, item.id)).toBe(true) // owner override
    expect(await canDeleteWorkItem(F.carol, item.id)).toBe(false)
  })
})

describe('canDeleteTask', () => {
  it('allows the assignee even when they did not create it', async () => {
    // F.task1 is assigned to bob; seedFixtures sets no createdById on any task.
    expect(await canDeleteTask(F.bob, F.task1)).toBe(true)
  })

  it('blocks an editor who is neither the assignee nor the creator', async () => {
    // F.task2 has no assignee and no createdById.
    expect(await canDeleteTask(F.bob, F.task2)).toBe(false)
  })

  it('allows the org owner to delete any task in the org, assigned or not', async () => {
    expect(await canDeleteTask(F.alice, F.task2)).toBe(true)
  })

  it('blocks a user unrelated to the org entirely', async () => {
    expect(await canDeleteTask(F.carol, F.task1)).toBe(false)
  })
})
