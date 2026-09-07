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
    expect(unpack(await call('graduate_work_item', { workItemId: 'mcp-item' }, F.carol))).toHaveProperty('error')
    const spec = await createSpec({ productId: F.productShared, title: 'MCP spec', body: 'first', specType: 'feature' }, F.alice)
    await call('link_spec', { specId: spec.id, targetType: 'work_item', targetId: 'mcp-item' })
    const note = unpack(await call('record_design_note', { assetId: F.assetApi, title: 'Change', revisesSpecId: spec.id, revisedSpecBody: 'second', expectedSpecVersion: 1 }))
    expect(note.specEventId).toBeTruthy()
    expect(unpack(await call('graduate_work_item', { workItemId: 'mcp-item' })).capability).toMatchObject({ sourceSpecId: spec.id, sourceSpecVersion: 2 })
  })
})
