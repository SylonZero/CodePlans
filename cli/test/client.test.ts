import { describe, expect, it } from 'vitest'
import { Client, CliError, EXIT, parseResponse } from '../src/client'
import { fakeServer } from './helpers'

const failure = (p: Promise<unknown>) => p.then(() => { throw new Error('expected a failure') }, (e: CliError) => e)

describe('parseResponse', () => {
  it('reads a JSON body', () => {
    expect(parseResponse('{"jsonrpc":"2.0","id":3,"result":{"ok":true}}', 'application/json', 3).result).toEqual({ ok: true })
  })

  it('reads the matching message from an event stream', () => {
    const body = 'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress"}\n\nevent: message\ndata: {"jsonrpc":"2.0","id":7,"result":{"n":1}}\n\n'
    expect(parseResponse(body, 'text/event-stream', 7).result).toEqual({ n: 1 })
  })

  it('rejects a body that is not JSON', () => {
    expect(() => parseResponse('<html>', 'text/html', 1)).toThrow(/Unexpected response/)
  })
})

describe('Client', () => {
  it('returns parsed tool results over JSON and SSE', async () => {
    for (const sse of [false, true]) {
      const server = fakeServer({ list_products: () => [{ slug: 'web' }] }, { sse })
      const client = new Client('https://cp.example.com/', 'cpk_test', server.fetch)
      expect(await client.call('list_products')).toEqual([{ slug: 'web' }])
    }
  })

  it('throws a tool result carrying an error', async () => {
    const server = fakeServer({ get_product: () => ({ error: 'Product not found' }) })
    await expect(new Client('https://x.test', 'k', server.fetch).call('get_product')).rejects.toThrow('Product not found')
  })

  it('throws a JSON-RPC error with exit code 1', async () => {
    const server = fakeServer({})
    const err = await failure(new Client('https://x.test', 'k', server.fetch).call('missing'))
    expect(err).toBeInstanceOf(CliError)
    expect(err.exitCode).toBe(EXIT.failed)
  })

  it('maps a refused key and an unreachable server to exit code 3', async () => {
    const refused = await failure(new Client('https://x.test', 'k', fakeServer({}, { status: 401 }).fetch).call('x'))
    expect(refused.exitCode).toBe(EXIT.auth)
    const down = await failure(new Client('https://x.test', 'k', async () => { throw new TypeError('fetch failed') }).call('x'))
    expect(down.exitCode).toBe(EXIT.auth)
    expect(down.message).toMatch(/Could not reach/)
  })

  it('posts to the MCP endpoint with the bearer key', async () => {
    let seen: { url: string; auth: string } | undefined
    const client = new Client('https://x.test/', 'cpk_abc', async (url, init) => {
      seen = { url, auth: (init.headers as Record<string, string>).authorization }
      return new Response('{"jsonrpc":"2.0","id":1,"result":{"tools":[]}}', { headers: { 'content-type': 'application/json' } })
    })
    await client.listTools()
    expect(seen).toEqual({ url: 'https://x.test/api/mcp/mcp', auth: 'Bearer cpk_abc' })
  })
})
