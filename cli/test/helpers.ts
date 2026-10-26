import type { FetchLike } from '../src/client'
import type { Sink } from '../src/output'

/** A fake MCP endpoint: each tools/call is answered by the matching handler. */
export function fakeServer(handlers: Record<string, (args: Record<string, unknown>) => unknown>, opts: { sse?: boolean; status?: number } = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = []
  const fetchImpl: FetchLike = async (_url, init) => {
    if (opts.status) return new Response('nope', { status: opts.status })
    const req = JSON.parse(String(init.body)) as { id: number; method: string; params: { name: string; arguments: Record<string, unknown> } }
    let message: unknown
    if (req.method === 'tools/list') {
      message = { jsonrpc: '2.0', id: req.id, result: { tools: Object.keys(handlers).map((name) => ({ name, description: `${name} tool` })) } }
    } else {
      const { name, arguments: args } = req.params
      calls.push({ name, args })
      const handler = handlers[name]
      if (!handler) message = { jsonrpc: '2.0', id: req.id, error: { code: -32602, message: `Tool ${name} not found` } }
      else {
        try {
          message = { jsonrpc: '2.0', id: req.id, result: { content: [{ type: 'text', text: JSON.stringify(handler(args)) }] } }
        } catch (err) {
          message = { jsonrpc: '2.0', id: req.id, error: { code: -32603, message: (err as Error).message } }
        }
      }
    }
    return opts.sse
      ? new Response(`event: message\ndata: ${JSON.stringify(message)}\n\n`, { headers: { 'content-type': 'text/event-stream' } })
      : new Response(JSON.stringify(message), { headers: { 'content-type': 'application/json' } })
  }
  return { fetch: fetchImpl, calls }
}

export function capture(): Sink & { text: () => string } {
  let buf = ''
  return { write: (chunk: string) => { buf += chunk; return true }, isTTY: false, text: () => buf }
}
