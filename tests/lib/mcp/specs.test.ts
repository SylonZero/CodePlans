import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createSpec } from '@/lib/db/specs'
import { db } from '@/lib/db'
import { workItems } from '@/lib/db/schema.sqlite'
const { registered } = vi.hoisted(() => ({ registered: new Map<string, (...args: any[]) => Promise<any>>() }))
vi.mock('mcp-handler', () => ({
  createMcpHandler: (register: (server: any) => void) => {
    register({ tool: (name: string, _description: string, _schema: unknown, handler: (...args: any[]) => Promise<any>) => registered.set(name, handler) })
    return () => {}
  },
  withMcpAuth: (handler: unknown) => handler,
}))
beforeAll(async () => { await runMigrations(); await import('@/app/api/mcp/[transport]/route') })
beforeEach(seedFixtures)
afterEach(clearTables)
const extra = (userId: string, write = true) => ({ authInfo: { scopes: write ? ['read', 'write'] : ['read'], extra: { userId } } })
const call = (tool: string, data: unknown, user = F.alice as string, write = true) => registered.get(tool)!(data, extra(user, write))
const unpack = (result: any) => JSON.parse(result.content[0].text)

describe('native spec MCP tools', () => {
  it('registers the complete surface and requires write scope', async () => {
    const input = { productId: F.productShared, title: 'Spec', body: 'Body', specType: 'feature' }
    for (const tool of ['create_spec', 'update_spec', 'supersede_spec', 'link_spec', 'unlink_spec', 'get_spec', 'list_specs']) expect(registered.has(tool)).toBe(true)
    await expect(call('create_spec', input, F.alice, false)).rejects.toThrow('read-only')
    const spec = unpack(await call('create_spec', input))
    expect(spec).toMatchObject({ version: 1, authorType: 'agent' })
    await expect(call('update_spec', { id: spec.id, body: 'Changed' }, F.alice, false)).rejects.toThrow('read-only')
    await expect(call('link_spec', { specId: spec.id, targetType: 'asset', targetId: F.assetApi }, F.alice, false)).rejects.toThrow('read-only')
    await expect(call('get_spec', { id: spec.id }, F.carol)).rejects.toThrow('accessible')
    expect(unpack(await call('list_specs', {}, F.carol))).toEqual([])
    expect(unpack(await call('get_spec', { id: spec.id }, F.alice, false))).toMatchObject({ body: 'Body' })
  })
  it('guards graduation access and records separate note revisions', async () => {
    await (db as any).insert(workItems).values({ id: 'mcp-item', productId: F.productShared, assetId: F.assetApi, title: 'Feature', type: 'feature', status: 'resolved' })
    await expect(call('graduate_work_item', { workItemId: 'mcp-item' }, F.carol)).rejects.toThrow('accessible')
    const spec = await createSpec({ productId: F.productShared, title: 'MCP spec', body: 'first', specType: 'feature' }, F.alice)
    await call('link_spec', { specId: spec.id, targetType: 'work_item', targetId: 'mcp-item' })
    const note = unpack(await call('record_design_note', { assetId: F.assetApi, title: 'Change', revisesSpecId: spec.id, revisedSpecBody: 'second', expectedSpecVersion: 1 }))
    expect(note.specEventId).toBeTruthy()
    expect(unpack(await call('graduate_work_item', { workItemId: 'mcp-item' })).capability).toMatchObject({ sourceSpecId: spec.id, sourceSpecVersion: 2 })
  })
})

describe('MCP write authorization', () => {
  const DAVE = 'user-dave-mcp'
  beforeEach(async () => {
    const { users, organizationMembers } = await import('@/lib/db/schema.sqlite')
    await (db as any).insert(users).values({ id: DAVE, email: 'dave-mcp@test.local', name: 'Dave', billingTier: 'free', role: 'viewer', organizationId: F.org, featureFlags: {} })
    await (db as any).insert(organizationMembers).values({ id: 'member-dave-mcp', organizationId: F.org, userId: DAVE, role: 'viewer', joinedAt: new Date() })
  })

  it('blocks a viewer holding a write-scoped key from changing product data', async () => {
    await expect(call('create_asset', { productId: F.productShared, name: 'X', type: 'service', description: '', tags: [] }, DAVE)).rejects.toThrow('view-only')
    await expect(call('update_task_status', { id: F.task1, status: 'done' }, DAVE)).rejects.toThrow('view-only')
    await expect(call('create_product', { name: 'Viewer product', description: '', tags: [] }, DAVE)).resolves.toMatchObject({ content: [{ text: expect.stringContaining('view-only') }] })
  })

  it('lets an editor write and hides other products entirely', async () => {
    const task = unpack(await call('update_task_status', { id: F.task1, status: 'done' }, F.bob))
    expect(task).toMatchObject({ status: 'done' })
    await expect(call('update_task_status', { id: F.task1, status: 'done' }, F.carol)).rejects.toThrow('not accessible')
  })
})

describe('MCP comments and reviews', () => {
  it('lets an agent comment, request a review and read it, but offers no way to approve', async () => {
    const spec = unpack(await call('create_spec', { productId: F.productShared, title: 'Agent spec', body: 'Body text here', specType: 'api' }))
    const comment = unpack(await call('add_comment', { subjectType: 'spec', subjectId: spec.id, body: 'Please check @Bob', kind: 'question', anchor: { quote: 'Body text' }, mentionEmails: ['bob@test.local'] }))
    expect(comment).toMatchObject({ authorType: 'agent', kind: 'question', mentions: ['user-bob'] })
    const threads = unpack(await call('list_comments', { subjectType: 'spec', subjectId: spec.id }, F.bob))
    expect(threads[0]).toMatchObject({ anchorStatus: 'anchored', authorName: 'Alice' })
    expect(unpack(await call('resolve_comment', { id: comment.id, resolved: true }))).toMatchObject({ resolvedById: F.alice })

    const review = unpack(await call('request_review', { subjectType: 'spec', subjectId: spec.id, reviewerEmails: ['bob@test.local'] }))
    expect(review).toMatchObject({ state: 'open', requestedByKind: 'agent' })
    const summary = unpack(await call('get_review', { subjectType: 'spec', subjectId: spec.id }))
    expect(summary.current.participants).toEqual([expect.objectContaining({ name: 'Bob', decision: 'pending' })])
    expect(summary).not.toHaveProperty('audience')
    expect(unpack(await call('list_reviews', { awaitingMe: true }, F.bob)).map((r: any) => r.subjectTitle)).toEqual(['Agent spec'])
    expect([...registered.keys()].some((name) => /approve|decide/.test(name))).toBe(false)
    await expect(call('add_comment', { subjectType: 'spec', subjectId: spec.id, body: 'x' }, F.alice, false)).rejects.toThrow('read-only')
  })
})
