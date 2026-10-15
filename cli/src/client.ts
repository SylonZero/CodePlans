// Talks to a CodePlans server through its authenticated MCP endpoint
// (/api/mcp/mcp). The endpoint is stateless, so each call is one JSON-RPC POST;
// the response is either JSON or a server-sent event stream.

/** Exit codes: 1 a failed operation, 2 a usage error, 3 authentication or connection. */
export const EXIT = { failed: 1, usage: 2, auth: 3 } as const

export class CliError extends Error {
  constructor(message: string, readonly exitCode: number = EXIT.failed) {
    super(message)
  }
}

export type ToolInfo = { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown>; required?: string[] } }

type RpcResponse = {
  id?: number | string | null
  result?: unknown
  error?: { code: number; message: string }
}

type ToolResult = { content?: { type: string; text?: string }[]; isError?: boolean }

const PROTOCOL_VERSION = '2025-06-18'

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>

export class Client {
  private nextId = 1
  readonly endpoint: string

  constructor(readonly baseUrl: string, private readonly key: string, private readonly fetchImpl: FetchLike = fetch) {
    this.endpoint = `${baseUrl.replace(/\/+$/, '')}/api/mcp/mcp`
  }

  /** Calls a tool and returns its JSON result. A result carrying an `error` string is thrown as a CliError. */
  async call<T = unknown>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const result = (await this.rpc('tools/call', { name, arguments: args })) as ToolResult
    const text = (result.content ?? []).filter((c) => c.type === 'text').map((c) => c.text ?? '').join('\n')
    if (result.isError) throw new CliError(text || `${name} failed`)
    let data: unknown = text
    try { data = text ? JSON.parse(text) : null } catch { /* plain text result */ }
    if (data && typeof data === 'object' && !Array.isArray(data) && typeof (data as { error?: unknown }).error === 'string') {
      throw new CliError((data as { error: string }).error)
    }
    return data as T
  }

  async listTools(): Promise<ToolInfo[]> {
    const result = (await this.rpc('tools/list', {})) as { tools?: ToolInfo[] }
    return result.tools ?? []
  }

  private async rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId++
    let res: Response
    try {
      res = await this.fetchImpl(this.endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          authorization: `Bearer ${this.key}`,
          'mcp-protocol-version': PROTOCOL_VERSION,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
      })
    } catch (err) {
      const cause = err instanceof Error && err.cause instanceof Error ? `: ${err.cause.message}` : ''
      throw new CliError(`Could not reach ${this.baseUrl}${cause}`, EXIT.auth)
    }
    if (res.status === 401 || res.status === 403) {
      throw new CliError(`The server at ${this.baseUrl} refused the API key. Check it in Settings → API Keys, or run codeplans login again.`, EXIT.auth)
    }
    if (res.status === 404) throw new CliError(`No CodePlans MCP endpoint at ${this.endpoint}. Is the URL right?`, EXIT.auth)
    const body = await res.text()
    if (!res.ok) throw new CliError(`The server answered ${res.status}${body ? `: ${body.slice(0, 200)}` : ''}`, res.status >= 500 ? EXIT.failed : EXIT.auth)
    const message = parseResponse(body, res.headers.get('content-type') ?? '', id)
    if (message.error) {
      // A thrown tool error (access, a review-workflow block, validation) arrives as a JSON-RPC error.
      throw new CliError(message.error.message)
    }
    return message.result
  }
}

/** Reads the JSON-RPC response with the given id from a JSON body or a server-sent event stream. */
export function parseResponse(body: string, contentType: string, id: number): RpcResponse {
  const candidates: RpcResponse[] = []
  if (contentType.includes('text/event-stream')) {
    for (const event of body.split(/\r?\n\r?\n/)) {
      const data = event.split(/\r?\n/).filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trimStart()).join('\n')
      if (!data) continue
      try { candidates.push(JSON.parse(data)) } catch { /* not JSON: skip */ }
    }
  } else {
    try {
      const parsed = JSON.parse(body)
      candidates.push(...(Array.isArray(parsed) ? parsed : [parsed]))
    } catch {
      throw new CliError(`Unexpected response from the server: ${body.slice(0, 200)}`)
    }
  }
  const match = candidates.find((m) => m.id === id) ?? candidates.find((m) => 'result' in m || 'error' in m)
  if (!match) throw new CliError('The server sent no response to the request.')
  return match
}
