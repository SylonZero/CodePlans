import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { NextRequest } from 'next/server'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createApiKey, revokeApiKey } from '@/lib/mcp/auth'
import { POST } from '@/app/api/mcp/[transport]/route'

// Exercise the real handler and SDK: the tool-level tests mock registration,
// so they cannot catch incompatible Zod schemas or transport/auth changes.
async function request(body: unknown, token?: string) {
  return POST(new NextRequest('http://localhost:3000/api/mcp/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(token && { Authorization: `Bearer ${token}` }),
    },
    body: JSON.stringify(body),
  }))
}

async function rpc(method: string, params: unknown, token: string) {
  const response = await request({ jsonrpc: '2.0', id: 1, method, params }, token)
  expect(response.status).toBe(200)
  const body = await response.text()
  const message = response.headers.get('content-type')?.includes('text/event-stream')
    ? JSON.parse(body.split('\n').find((line) => line.startsWith('data: '))!.slice(6))
    : JSON.parse(body)
  expect(message.error).toBeUndefined()
  return message.result
}

beforeAll(runMigrations)
beforeEach(seedFixtures)
afterEach(clearTables)

describe('MCP HTTP transport with the real SDK', () => {
  it('rejects missing and revoked bearer keys', async () => {
    const body = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
    expect((await request(body)).status).toBe(401)
    const key = await createApiKey(F.alice, 'transport test', 'read')
    await revokeApiKey(key.id, F.alice)
    expect((await request(body, key.plaintext)).status).toBe(401)
  })

  it('initializes and publishes usable Zod tool schemas', async () => {
    const key = await createApiKey(F.alice, 'transport test', 'read')
    const initialized = await rpc('initialize', {
      protocolVersion: '2025-03-26',
      capabilities: {},
      clientInfo: { name: 'compatibility-test', version: '1.0.0' },
    }, key.plaintext)
    expect(initialized.capabilities).toHaveProperty('tools')
    const catalog = await rpc('tools/list', {}, key.plaintext)
    const createSpec = catalog.tools.find((tool: { name: string }) => tool.name === 'create_spec')
    expect(createSpec.inputSchema.properties.title).toMatchObject({ type: 'string' })
    expect(createSpec.inputSchema.required).toContain('title')
  })

  it('validates arguments, enforces read scope, and creates and reads a spec', async () => {
    const read = await createApiKey(F.alice, 'read transport test', 'read')
    const write = await createApiKey(F.alice, 'write transport test', 'write')
    const args = { productId: F.productShared, title: 'Transport spec', body: 'Wire protocol body', specType: 'feature' }
    const call = (name: string, input: unknown, token = write.plaintext) =>
      rpc('tools/call', { name, arguments: input }, token)
    expect(await call('create_spec', { ...args, title: 42 })).toHaveProperty('isError', true)
    const denied = await call('create_spec', args, read.plaintext)
    expect(denied.isError).toBe(true)
    expect(JSON.stringify(denied.content)).toContain('read-only')
    const created = await call('create_spec', args)
    expect(created.isError).not.toBe(true)
    const spec = JSON.parse(created.content[0].text)
    expect(spec).toMatchObject({ title: args.title, version: 1 })
    const fetched = await call('get_spec', { id: spec.id }, read.plaintext)
    expect(JSON.parse(fetched.content[0].text)).toMatchObject({ body: args.body })
  })
})
