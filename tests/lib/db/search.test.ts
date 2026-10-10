import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { eq } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db/index'
import { search, parseQuery, snippetFor } from '@/lib/db/search'
import { assets, codePlans, products, releases, specs, tasks, workItems } from '@/lib/db/schema.sqlite'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const d = db as any

beforeAll(async () => {
  await runMigrations()
})

beforeEach(async () => {
  await seedFixtures()
  await d.insert(specs).values({
    id: 'spec-auth', productId: F.productShared, title: 'Authentication flow', specType: 'feature',
    body: '# Sign-in\n\nUsers sign in with **email and password**. Sessions last 30 days and refresh on use.',
  })
  await d.insert(releases).values({ id: 'release-q4', productId: F.productShared, name: 'Q4 Launch', description: 'Billing and search', creatorId: F.alice })
  await d.insert(workItems).values([
    { id: 'wi-bug', productId: F.productShared, type: 'bug', title: 'Login button misaligned', description: 'On mobile Safari', externalKey: 'JIRA-142' },
    { id: 'wi-carol', productId: F.productCarol, type: 'bug', title: 'Login fails for Carol', description: '' },
  ])
})

afterEach(async () => {
  await d.delete(specs)
  await d.delete(releases)
  await clearTables()
})

const titles = (r: { results: { title: string }[] }) => r.results.map((x) => x.title)

describe('parseQuery', () => {
  it('splits words, keeps quoted phrases, lowercases and dedupes', () => {
    expect(parseQuery('  Login  "email and password" login ')).toEqual(['login', 'email and password'])
  })
})

describe('snippetFor', () => {
  it('excerpts around the first match with markdown stripped', () => {
    expect(snippetFor('# Title\n\nSome **bold** text about refresh tokens.', ['refresh'])).toBe('Title Some bold text about refresh tokens.')
    expect(snippetFor(`${'x '.repeat(100)}needle${' y'.repeat(200)}`, ['needle'])).toMatch(/^….*needle.*…$/)
    expect(snippetFor('nothing here', ['absent'])).toBeNull()
    expect(snippetFor(null, ['x'])).toBeNull()
  })
})

describe('search', () => {
  it('finds every type by title, case-insensitively, with links', async () => {
    const r = await search(F.alice, 'PLAN')
    expect(r.results.filter((x) => x.type === 'plan').map((x) => x.url).sort())
      .toEqual([`/plans/${F.planActive}`, `/plans/${F.planCompleted}`, `/plans/${F.planDraft}`])

    const product = (await search(F.alice, 'shared product')).results.find((x) => x.type === 'product')
    expect(product).toMatchObject({ id: F.productShared, url: '/products/shared-product', productName: 'Shared Product' })

    expect((await search(F.alice, 'api service')).results[0]).toMatchObject({ type: 'asset', url: `/assets/${F.assetApi}` })
    expect((await search(F.alice, 'q4')).results[0]).toMatchObject({ type: 'release', url: '/releases/release-q4' })
    expect((await search(F.alice, 'misaligned')).results[0]).toMatchObject({ type: 'work_item', url: '/work-items?item=wi-bug' })
  })

  it('links tasks to their plan and names the plan', async () => {
    const task = (await search(F.alice, 'task 2')).results.find((x) => x.type === 'task')
    expect(task).toMatchObject({ id: F.task2, url: `/plans/${F.planActive}?task=${F.task2}`, context: 'Active Plan' })
  })

  it('matches text and external keys, with a snippet', async () => {
    const spec = (await search(F.alice, 'password')).results.find((x) => x.type === 'spec')
    expect(spec).toMatchObject({ id: 'spec-auth', url: '/specs/spec-auth' })
    expect(spec!.snippet).toContain('email and password')

    expect((await search(F.alice, 'jira-142')).results[0]).toMatchObject({ id: 'wi-bug', key: 'JIRA-142' })
  })

  it('requires every word, anywhere in title or text', async () => {
    expect(titles(await search(F.alice, 'login safari'))).toEqual(['Login button misaligned'])
    expect(titles(await search(F.alice, 'login chrome'))).toEqual([])
    expect(titles(await search(F.alice, '"sign in with"'))).toEqual(['Authentication flow'])
  })

  it('ranks title matches above text-only matches', async () => {
    await d.insert(workItems).values({ id: 'wi-text', productId: F.productShared, type: 'task', title: 'Polish', description: 'login copy' })
    await d.update(workItems).set({ updatedAt: new Date(Date.now() + 60_000) }).where(eq(workItems.id, 'wi-text'))
    const r = await search(F.alice, 'login', { types: ['work_item'] })
    expect(titles(r)).toEqual(['Login button misaligned', 'Polish'])
  })

  it('only shows products the user can see', async () => {
    expect(titles(await search(F.alice, 'login'))).toEqual(['Login button misaligned'])
    expect(titles(await search(F.carol, 'login'))).toEqual(['Login fails for Carol'])
    expect(titles(await search(F.carol, 'shared'))).toEqual([])
  })

  it('leaves out archived products and assets', async () => {
    await d.update(assets).set({ archivedAt: new Date() }).where(eq(assets.id, F.assetDb))
    expect((await search(F.alice, 'main db')).results).toEqual([])
    await d.update(products).set({ archivedAt: new Date() }).where(eq(products.id, F.productShared))
    expect((await search(F.alice, 'plan')).results).toEqual([])
  })

  it('treats % and _ literally', async () => {
    await d.update(codePlans).set({ title: '100% coverage_goal' }).where(eq(codePlans.id, F.planDraft))
    expect(titles(await search(F.alice, '100%'))).toEqual(['100% coverage_goal'])
    expect(titles(await search(F.alice, 'e_g'))).toEqual(['100% coverage_goal'])
    expect(titles(await search(F.alice, '%%'))).toEqual([])
  })

  it('filters by type and product, pages, and counts', async () => {
    const r = await search(F.alice, 'task', { types: ['task'], limit: 2, withCounts: true })
    expect(r.results).toHaveLength(2)
    expect(r.results.every((x) => x.type === 'task')).toBe(true)
    expect(r.counts!.task).toBe(4)
    expect(r.counts!.plan).toBe(0)
    const page2 = await search(F.alice, 'task', { types: ['task'], limit: 2, offset: 2 })
    expect(page2.results.map((x) => x.id)).not.toContain(r.results[0].id)
    expect(page2.results).toHaveLength(2)

    expect((await search(F.alice, 'login', { productId: F.productCarol })).results).toEqual([])
    await d.update(tasks).set({ title: 'Renamed' }).where(eq(tasks.id, F.task1))
    expect((await search(F.alice, 'task', { types: ['task'], withCounts: true })).counts!.task).toBe(4) // description still says "task"
  })

  it('needs at least two characters', async () => {
    expect((await search(F.alice, 'a')).results).toEqual([])
    expect((await search(F.alice, '   ')).results).toEqual([])
  })
})
