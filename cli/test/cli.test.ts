import { writeFileSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { run, VERSION } from '../src/cli'
import { COMMANDS } from '../src/commands'
import { parseArg } from '../src/commands/write'
import { capture, fakeServer } from './helpers'

const env = { CODEPLANS_URL: 'https://cp.test', CODEPLANS_API_KEY: 'cpk_test' }
const dirs: string[] = []
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }) })

async function cli(argv: string[], handlers: Parameters<typeof fakeServer>[0] = {}, extraEnv: Record<string, string> = env) {
  const stdout = capture()
  const stderr = capture()
  const server = fakeServer(handlers)
  const code = await run(argv, COMMANDS, { env: extraEnv, stdout, stderr, fetch: server.fetch })
  return { code, out: stdout.text(), err: stderr.text(), calls: server.calls }
}

const products = () => [{ id: 'p1', name: 'Web', slug: 'web', assetCount: 2, activePlanCount: 1, workItemCount: 3 }]

describe('run', () => {
  it('prints help and the version', async () => {
    expect((await cli([])).out).toMatch(/Usage: codeplans <command>/)
    expect((await cli(['--version'])).out.trim()).toBe(VERSION)
    expect((await cli(['help', 'plan', 'create'])).out).toMatch(/codeplans plan create --product/)
    expect((await cli(['items', '--help'])).out).toMatch(/codeplans items/)
  })

  it('exits 2 on usage mistakes', async () => {
    expect((await cli(['bogus'])).code).toBe(2)
    expect((await cli(['products', '--nope'])).code).toBe(2)
    expect((await cli(['plan'])).code).toBe(2)
    expect((await cli(['item', 'status', 'i1', 'done'])).err).toMatch(/must be one of/)
  })

  it('exits 3 when not connected', async () => {
    const xdg = mkdtempSync(path.join(tmpdir(), 'codeplans-cli-'))
    dirs.push(xdg)
    const r = await cli(['products'], {}, { XDG_CONFIG_HOME: xdg })
    expect(r.code).toBe(3)
    expect(r.err).toMatch(/codeplans login/)
  })

  it('lists products as a table, or JSON with --json', async () => {
    const table = await cli(['products'], { list_products: products })
    expect(table.code).toBe(0)
    expect(table.out).toMatch(/^SLUG\s+NAME/)
    expect(table.out).toMatch(/web\s+Web/)
    const json = await cli(['products', '--json'], { list_products: products })
    expect(JSON.parse(json.out)).toEqual(products())
  })

  it('picks the two-word command and passes options through', async () => {
    const r = await cli(['plan', 'create', '--product', 'web', '--title', 'New thing', '--tag', 'cli', '--json'], {
      list_products: products,
      create_code_plan: (args) => ({ id: 'plan1', ...args }),
    })
    expect(r.code).toBe(0)
    expect(r.calls.at(-1)).toEqual({
      name: 'create_code_plan',
      args: { productId: 'p1', title: 'New thing', type: 'feature', description: '', tags: ['cli'], targetAssetIds: [], workItemIds: [] },
    })
  })

  it('turns a tool error into exit 1 on stderr', async () => {
    const r = await cli(['task', 'start', 't1'], { update_task_status: () => { throw new Error('This plan needs an approved review before work starts.') } })
    expect(r.code).toBe(1)
    expect(r.err).toMatch(/approved review/)
  })

  it('calls any tool with call', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'codeplans-cli-'))
    dirs.push(dir)
    const input = path.join(dir, 'args.json')
    writeFileSync(input, JSON.stringify({ productId: 'p1', limit: 1 }))
    const r = await cli(['call', 'list_work_items', '--input', input, '--arg', 'limit=5', '--arg', 'status=open'], { list_work_items: (args) => ({ args }) })
    expect(JSON.parse(r.out)).toEqual({ args: { productId: 'p1', limit: 5, status: 'open' } })
  })
})

describe('parseArg', () => {
  it('parses JSON values and keeps the rest as text', () => {
    expect(parseArg('limit=5')).toEqual(['limit', 5])
    expect(parseArg('tags=["a","b"]')).toEqual(['tags', ['a', 'b']])
    expect(parseArg('title=hello world')).toEqual(['title', 'hello world'])
    expect(parseArg('expr=a=b')).toEqual(['expr', 'a=b'])
    expect(() => parseArg('=x')).toThrow(/key=value/)
  })
})
