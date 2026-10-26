import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { readdirSync } from 'node:fs'
import { sql, eq, inArray } from 'drizzle-orm'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { db } from '@/lib/db'
import { users, workItems, specLinks } from '@/lib/db/schema.sqlite'
import { createWorkItem, createTask } from '@/lib/db/mutations'
import { createSpec, linkSpec } from '@/lib/db/specs'
import { search } from '@/lib/db/search'
import { NestedWriteError, WriteQueue } from '@/lib/db/sqlite-writes'

// Regression for parallel MCP writes against a SQLite file: writes that arrived
// while a transaction was open failed with SQLITE_BUSY, because connections
// libsql opened after a transaction had no busy timeout, and each transaction
// left its connection open until garbage collection.

beforeAll(runMigrations)
beforeEach(seedFixtures)
afterEach(clearTables)
const d = db as any
const busyTimeout = async () => ((await d.all(sql`PRAGMA busy_timeout`)) as { timeout: number }[])[0].timeout
const openFiles = () => readdirSync(process.platform === 'linux' ? '/proc/self/fd' : '/dev/fd').length
const item = (title: string) =>
  createWorkItem({ productId: F.productShared, type: 'bug', title, description: '', severity: 'low', tags: [] }, F.alice, 'agent')

describe('parallel writes on SQLite', () => {
  it('keeps the busy timeout on the connection libsql opens after a transaction', async () => {
    await d.transaction(async (tx: any) => tx.select().from(users))
    expect(await busyTimeout()).toBe(5000)
  })

  it.skipIf(process.platform === 'win32')('returns transaction connections instead of leaving them open', async () => {
    await d.transaction(async (tx: any) => tx.select().from(users))
    const before = openFiles()
    for (let i = 0; i < 100; i++) {
      await d.transaction(async (tx: any) => tx.update(users).set({ name: `Alice ${i}` }).where(eq(users.id, F.alice)))
    }
    // libsql 0.17 kept about two files open per transaction (~200 here).
    expect(openFiles() - before).toBeLessThan(10)
  })

  it('persists a parallel batch of creates and spec links', async () => {
    const spec = await createSpec({ productId: F.productShared, title: 'Parallel spec', body: 'body', specType: 'design' }, F.alice, 'agent')
    const titles = Array.from({ length: 8 }, (_, i) => `Parallel item ${i}`)
    const results = await Promise.allSettled([
      ...titles.map(item),
      createTask({ codePlanId: F.planActive, title: 'Parallel task', description: '', priority: 'low', tags: [] }),
      createSpec({ productId: F.productShared, title: 'Second parallel spec', body: 'body', specType: 'design' }, F.alice, 'agent'),
      linkSpec(spec.id, 'code_plan', F.planActive, 'creates', F.alice),
      linkSpec(spec.id, 'asset', F.assetApi, undefined, F.alice),
    ])
    expect(results.filter((r) => r.status === 'rejected')).toEqual([])

    const ids = results.slice(0, titles.length).map((r) => (r as PromiseFulfilledResult<{ id: string }>).value.id)
    const stored = await d.select({ id: workItems.id }).from(workItems).where(inArray(workItems.id, ids))
    expect(stored).toHaveLength(titles.length)
    const found = await search(F.alice, '"Parallel item"', { types: ['work_item'], limit: 50 })
    expect(found.results.map((r: { id: string }) => r.id).sort()).toEqual([...ids].sort())

    // Linking the new items right afterwards finds every one of them.
    await Promise.all(ids.map((id) => linkSpec(spec.id, 'work_item', id, undefined, F.alice)))
    expect(await d.select().from(specLinks).where(eq(specLinks.specId, spec.id))).toHaveLength(2 + ids.length)
  })

  it('queues a write behind an open transaction instead of failing it', async () => {
    let inside!: () => void
    const entered = new Promise<void>((resolve) => { inside = resolve })
    const tx = d.transaction(async (t: any) => {
      inside()
      await new Promise((resolve) => setTimeout(resolve, 50))
      await t.insert(users).values({ id: 'u-tx', email: 'tx@example.com', name: 'Tx' })
    })
    await entered
    const outside = d.insert(users).values({ id: 'u-out', email: 'out@example.com', name: 'Out' }).returning()
    await Promise.all([tx, outside])
    const rows = await d.select({ id: users.id }).from(users).where(inArray(users.id, ['u-tx', 'u-out']))
    expect(rows).toHaveLength(2)
  })

  it('lets reads run while a transaction is open', async () => {
    let release!: () => void
    const held = new Promise<void>((resolve) => { release = resolve })
    const tx = d.transaction(async () => held)
    expect(await d.select().from(users).where(eq(users.id, F.alice))).toHaveLength(1)
    release()
    await tx
  })

  it('rejects a write through db inside db.transaction rather than deadlocking', async () => {
    await expect(
      d.transaction(async () => d.insert(users).values({ id: 'u-nested', email: 'n@example.com', name: 'N' })),
    ).rejects.toMatchObject({ cause: expect.any(NestedWriteError) })
    await expect(d.transaction(async () => d.transaction(async () => {}))).rejects.toThrow(NestedWriteError)
    // The queue is free again afterwards.
    await d.insert(users).values({ id: 'u-after', email: 'after@example.com', name: 'After' })
  })
})

describe('WriteQueue', () => {
  it('runs writes one at a time, in order, and survives a failing one', async () => {
    const queue = new WriteQueue()
    const order: string[] = []
    const step = (name: string, ms: number, fail = false) =>
      queue.run(async () => {
        order.push(`${name}:start`)
        await new Promise((resolve) => setTimeout(resolve, ms))
        order.push(`${name}:end`)
        if (fail) throw new Error(name)
      })
    const results = await Promise.allSettled([step('a', 20), step('b', 0, true), step('c', 0)])
    expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected', 'fulfilled'])
    expect(order).toEqual(['a:start', 'a:end', 'b:start', 'b:end', 'c:start', 'c:end'])
  })
})
