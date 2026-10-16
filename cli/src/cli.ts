// Command registry and runner. Every command declares its options for
// node:util parseArgs; the runner adds --json, --profile and --help, turns
// errors into messages on stderr and exit codes, and creates the client lazily
// (login and help never need one).
import { parseArgs, type ParseArgsConfig } from 'node:util'
import { Client, CliError, EXIT, type FetchLike } from './client.js'
import { configPath, resolveConnection, type Connection, type Env } from './config.js'
import { createOut, paint, table, type Out, type Sink } from './output.js'

export const VERSION = '0.1.0'

type Options = NonNullable<ParseArgsConfig['options']>
export type Values = Record<string, string | boolean | string[] | undefined>

export type Context = {
  out: Out
  env: Env
  configFile: string
  profile?: string
  fetch: FetchLike
  /** The connection for this run (env or profile); throws when not logged in. */
  connection: () => Connection
  client: () => Client
}

export type Command = {
  name: string
  aliases?: string[]
  summary: string
  usage: string
  /** Extra help shown under the usage line. */
  details?: string
  options?: Options
  /** At least this many positional arguments. */
  minArgs?: number
  run: (ctx: Context, args: string[], values: Values) => Promise<void>
}

const GLOBAL_OPTIONS: Options = {
  json: { type: 'boolean' },
  profile: { type: 'string' },
  help: { type: 'boolean', short: 'h' },
}

export type RunDeps = {
  env?: Env
  stdout?: Sink
  stderr?: Sink
  fetch?: FetchLike
}

/** Runs the CLI and returns the exit code. */
export async function run(argv: string[], commands: Command[], deps: RunDeps = {}): Promise<number> {
  const env = deps.env ?? process.env
  const wantsJson = argv.includes('--json')
  const out = createOut(wantsJson, deps.stdout ?? process.stdout, deps.stderr ?? process.stderr, env)

  // The command comes first: one or two words ("plan", "plan create"); the longest match wins.
  const lead: string[] = []
  for (const a of argv) { if (a.startsWith('-')) break; lead.push(a) }
  const find = (name: string) => commands.find((c) => c.name === name || c.aliases?.includes(name))
  const two = lead.length >= 2 ? find(`${lead[0]} ${lead[1]}`) : undefined
  const command = two ?? (lead.length ? find(lead[0]) : undefined)

  if (!command) {
    if (argv.includes('--version') || argv.includes('-v')) { out.print(VERSION); return 0 }
    if (!lead.length || lead[0] === 'help') {
      const topic = lead.slice(1)
      printHelp(out, commands, topic.length ? find(topic.join(' ')) ?? find(topic[0]) : undefined)
      return 0
    }
    out.error(`Unknown command "${lead[0]}". Run codeplans help for the list.`)
    return EXIT.usage
  }

  const rest = argv.slice(two ? 2 : 1)

  let positionals: string[]
  let values: Values
  try {
    const parsed = parseArgs({ args: rest, options: { ...GLOBAL_OPTIONS, ...command.options }, allowPositionals: true, strict: true })
    positionals = parsed.positionals
    values = parsed.values as Values
  } catch (err) {
    out.error(`${err instanceof Error ? err.message : String(err)}\nUsage: ${command.usage}`)
    return EXIT.usage
  }
  if (values.help) { printHelp(out, commands, command); return 0 }
  if (positionals.length < (command.minArgs ?? 0)) {
    out.error(`Usage: ${command.usage}`)
    return EXIT.usage
  }

  let cachedClient: Client | undefined
  const ctx: Context = {
    out,
    env,
    configFile: configPath(env),
    profile: values.profile as string | undefined,
    fetch: deps.fetch ?? fetch,
    connection: () => resolveConnection({ profile: values.profile as string | undefined }, env, configPath(env)),
    client: () => {
      if (!cachedClient) {
        const conn = ctx.connection()
        cachedClient = new Client(conn.url, conn.key, ctx.fetch)
      }
      return cachedClient
    },
  }

  try {
    await command.run(ctx, positionals, values)
    return 0
  } catch (err) {
    if (err instanceof CliError) {
      out.error(paint({ color: !!(deps.stderr ?? process.stderr).isTTY && !env.NO_COLOR }, 'red', err.message))
      return err.exitCode
    }
    out.error(`Unexpected error: ${err instanceof Error ? err.stack ?? err.message : String(err)}`)
    return EXIT.failed
  }
}

function printHelp(out: Out, commands: Command[], command?: Command) {
  if (command) {
    out.print(`Usage: ${command.usage}`)
    out.print()
    out.print(command.summary)
    if (command.details) { out.print(); out.print(command.details) }
    out.print()
    out.print('Global options: --json (machine-readable output), --profile <name>, --help')
    return
  }
  out.print(`codeplans ${VERSION}: CodePlans from your terminal`)
  out.print()
  out.print('Usage: codeplans <command> [options]')
  out.print()
  for (const line of table(commands.map((c) => [`  ${c.name}`, c.summary]))) out.print(line)
  out.print()
  out.print('Global options: --json  --profile <name>  --help  --version')
  out.print('Connect with: codeplans login --url https://your-codeplans --key cpk_…')
  out.print('Docs: https://github.com/SylonZero/CodePlans/blob/master/docs/guides/cli.md')
}

// ── Helpers shared by commands ──────────────────────────────────────────────

export type ProductRow = { id: string; name: string; slug: string; assetCount?: number; activePlanCount?: number; planCount?: number; workItemCount?: number; specCount?: number }

/** A product by id, slug or (case-insensitive) name. */
export async function resolveProduct(client: Client, ref: string): Promise<ProductRow> {
  const products = await client.call<ProductRow[]>('list_products')
  const lower = ref.toLowerCase()
  const match = products.find((p) => p.id === ref || p.slug === lower)
    ?? products.filter((p) => p.name.toLowerCase() === lower).at(0)
  if (!match) throw new CliError(`No product "${ref}". Products: ${products.map((p) => p.slug).join(', ') || 'none'}.`)
  return match
}

export function str(v: Values[string]): string | undefined {
  return typeof v === 'string' ? v : undefined
}

export function list(v: Values[string]): string[] {
  return Array.isArray(v) ? v : typeof v === 'string' ? [v] : []
}

export function oneOf<T extends string>(value: string | undefined, allowed: readonly T[], flag: string): T | undefined {
  if (value === undefined) return undefined
  if (!(allowed as readonly string[]).includes(value)) throw new CliError(`--${flag} must be one of: ${allowed.join(', ')}`, EXIT.usage)
  return value as T
}
