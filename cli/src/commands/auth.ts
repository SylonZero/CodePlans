import { Client, CliError, EXIT } from '../client.js'
import { maskKey, normalizeUrl, readConfig, writeConfig } from '../config.js'
import { paint, printJson, table } from '../output.js'
import { str, type Command, type ProductRow } from '../cli.js'

export const login: Command = {
  name: 'login',
  summary: 'Save a connection (URL and API key) as a profile, after checking it works',
  usage: 'codeplans login --url <url> --key <cpk_…> [--profile <name>]',
  details: [
    'Create an API key in CodePlans under Settings → API Keys. Read keys can list and read;',
    'read/write keys can also change things. The profile is saved to ~/.config/codeplans/config.json',
    '(mode 0600) and becomes the current one. In CI, set CODEPLANS_URL and CODEPLANS_API_KEY instead.',
  ].join('\n'),
  options: { url: { type: 'string' }, key: { type: 'string' } },
  async run(ctx, _args, values) {
    const rawUrl = str(values.url) ?? ctx.env.CODEPLANS_URL
    const key = str(values.key) ?? ctx.env.CODEPLANS_API_KEY
    if (!rawUrl || !key) throw new CliError('Usage: codeplans login --url <url> --key <cpk_…>', EXIT.usage)
    if (!key.startsWith('cpk_')) throw new CliError('That doesn\'t look like a CodePlans API key (they start with cpk_).', EXIT.usage)
    const url = normalizeUrl(rawUrl)
    const products = await new Client(url, key, ctx.fetch).call<ProductRow[]>('list_products')
    const name = ctx.profile ?? 'default'
    const config = readConfig(ctx.configFile)
    config.profiles[name] = { url, key }
    config.current = name
    writeConfig(config, ctx.configFile)
    if (ctx.out.json) return printJson(ctx.out, { profile: name, url, products: products.length })
    ctx.out.print(`${paint(ctx.out, 'green', '✓')} Connected to ${url} as profile "${name}" (${products.length} product${products.length === 1 ? '' : 's'} visible).`)
  },
}

export const logout: Command = {
  name: 'logout',
  summary: 'Remove a saved profile (the current one unless --profile is given)',
  usage: 'codeplans logout [--profile <name>]',
  async run(ctx) {
    const config = readConfig(ctx.configFile)
    const name = ctx.profile ?? config.current ?? 'default'
    if (!config.profiles[name]) throw new CliError(`No profile named "${name}".`, EXIT.usage)
    delete config.profiles[name]
    if (config.current === name) config.current = Object.keys(config.profiles)[0]
    writeConfig(config, ctx.configFile)
    if (ctx.out.json) return printJson(ctx.out, { removed: name, current: config.current ?? null })
    ctx.out.print(`Removed profile "${name}".${config.current ? ` Current profile: "${config.current}".` : ''}`)
  },
}

export const status: Command = {
  name: 'status',
  summary: 'Show the connection in use and check that it works',
  usage: 'codeplans status',
  async run(ctx) {
    const conn = ctx.connection()
    const config = readConfig(ctx.configFile)
    let products: ProductRow[] | null = null
    let problem: string | null = null
    try {
      products = await ctx.client().call<ProductRow[]>('list_products')
    } catch (err) {
      problem = err instanceof Error ? err.message : String(err)
    }
    if (ctx.out.json) {
      printJson(ctx.out, { url: conn.url, profile: conn.profile, source: conn.source, key: maskKey(conn.key), ok: !problem, products: products?.length ?? null, error: problem, profiles: Object.keys(config.profiles) })
    } else {
      for (const line of table([
        ['URL', conn.url],
        ['Profile', conn.source === 'env' ? 'environment (CODEPLANS_URL, CODEPLANS_API_KEY)' : conn.profile ?? ''],
        ['API key', maskKey(conn.key)],
        ['Status', problem ? paint(ctx.out, 'red', problem) : paint(ctx.out, 'green', `connected, ${products!.length} product${products!.length === 1 ? '' : 's'} visible`)],
        ...(Object.keys(config.profiles).length > 1 ? [['Profiles', Object.keys(config.profiles).join(', ')]] : []),
      ])) ctx.out.print(line)
    }
    if (problem) throw new CliError('Not connected.', EXIT.auth)
  },
}
