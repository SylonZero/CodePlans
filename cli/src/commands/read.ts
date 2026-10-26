import { CliError, EXIT } from '../client.js'
import { ago, paint, printJson, table, truncate } from '../output.js'
import { list, oneOf, resolveProduct, str, type Command, type ProductRow } from '../cli.js'

// Shapes of the MCP results the commands print (only the fields used).
type InboxItem = { verb: string; title: string; detail?: string; url: string; reason: string; productName?: string; urgent?: boolean }
type MyWork = {
  needsYou: InboxItem[]
  inFlight: {
    taskGroups: { planId: string; planTitle: string; productName: string; tasks: { id: string; title: string; status: string; overdue: boolean }[] }[]
    plans: { id: string; title: string; status: string; progress: number; atRisk: boolean }[]
    specs: { id: string; title: string; status: string; version: number }[]
  }
  watching: InboxItem[]
}
type Asset = { id: string; name: string; type: string; layer?: string | null; health: string; openDebtCount?: number; owners?: { name: string }[] }
type Product = ProductRow & { description?: string; assets: Asset[]; dependencies: { sourceAssetName: string; targetAssetName: string; dependencyType: string }[] }
type Plan = { id: string; title: string; status: string; type: string; productName?: string; taskCount?: number; completedTaskCount?: number; revision?: number; updatedAt?: string }
type Task = { id: string; title: string; status: string; priority: string; assigneeId?: string | null }
type PlanDetail = Plan & {
  description?: string
  tasks?: Task[]
  assignees?: { id: string; name: string }[]
  planAssets?: { assetName: string; branch?: string | null; prUrl?: string | null; prStatus?: string | null }[]
  linkedWorkItems?: { id: string; title: string; type: string; status: string }[]
}
type WorkItem = { id: string; title: string; type: string; severity: string; status: string; asset?: string | null; area?: string | null; product?: string; owner?: string | null; updatedAt?: string }

const TASK_MARK: Record<string, string> = { not_started: '○', in_progress: '◐', done: '●' }

export const me: Command = {
  name: 'me',
  aliases: ['my-work'],
  summary: "What's waiting on you: reviews, assignments, overdue tasks, and work in flight",
  usage: 'codeplans me [--product <slug>]',
  options: { product: { type: 'string' } },
  async run(ctx, _args, values) {
    const client = ctx.client()
    const productId = str(values.product) ? (await resolveProduct(client, str(values.product)!)).id : undefined
    const work = await client.call<MyWork>('get_my_work', productId ? { productId } : {})
    if (ctx.out.json) return printJson(ctx.out, work)
    const { out } = ctx
    out.print(paint(out, 'bold', `Needs you (${work.needsYou.length})`))
    if (!work.needsYou.length) out.print(paint(out, 'dim', '  Nothing waiting on you.'))
    for (const line of table(work.needsYou.map((i) => [
      `  ${i.urgent ? paint(out, 'red', i.verb) : paint(out, 'cyan', i.verb)}`,
      truncate(i.title, 60),
      paint(out, 'dim', [i.detail ?? i.reason, i.productName].filter(Boolean).join(' · ')),
    ]))) out.print(line)
    const groups = work.inFlight.taskGroups
    if (groups.length) {
      out.print()
      out.print(paint(out, 'bold', 'Your tasks'))
      for (const g of groups) {
        out.print(`  ${g.planTitle} ${paint(out, 'dim', `· ${g.productName} · plan ${g.planId}`)}`)
        for (const line of table(g.tasks.map((t) => [`    ${TASK_MARK[t.status] ?? '·'}`, t.overdue ? paint(out, 'red', t.title) : t.title, paint(out, 'dim', t.id)]))) out.print(line)
      }
    }
    if (work.inFlight.plans.length) {
      out.print()
      out.print(paint(out, 'bold', 'Plans you own'))
      for (const line of table(work.inFlight.plans.map((p) => [`  ${p.title}`, p.status, `${Math.round(p.progress)}%`, p.atRisk ? paint(out, 'red', 'at risk') : '', paint(out, 'dim', p.id)]))) out.print(line)
    }
  },
}

export const products: Command = {
  name: 'products',
  summary: 'List the products you can see',
  usage: 'codeplans products',
  async run(ctx) {
    const rows = await ctx.client().call<ProductRow[]>('list_products')
    if (ctx.out.json) return printJson(ctx.out, rows)
    if (!rows.length) return ctx.out.print('No products yet.')
    for (const line of table(rows.map((p) => [p.slug, p.name, String(p.assetCount ?? ''), String(p.activePlanCount ?? ''), String(p.workItemCount ?? '')]), ['SLUG', 'NAME', 'ASSETS', 'ACTIVE PLANS', 'WORK ITEMS'], ctx.out)) ctx.out.print(line)
  },
}

export const product: Command = {
  name: 'product',
  summary: "One product's assets and their dependencies",
  usage: 'codeplans product <slug>',
  minArgs: 1,
  async run(ctx, [ref]) {
    const client = ctx.client()
    const slug = (await resolveProduct(client, ref)).slug
    const p = await client.call<Product>('get_product', { slug })
    if (ctx.out.json) return printJson(ctx.out, p)
    const { out } = ctx
    out.print(`${paint(out, 'bold', p.name)} ${paint(out, 'dim', `(${p.slug})`)}`)
    if (p.description) out.print(truncate(p.description, 160))
    out.print()
    for (const line of table(p.assets.map((a) => [a.name, a.type, a.layer ?? '', a.health, String(a.openDebtCount ?? 0), (a.owners ?? []).map((o) => o.name).join(', ')]), ['ASSET', 'TYPE', 'LAYER', 'HEALTH', 'DEBT', 'CODE OWNERS'], out)) out.print(line)
    if (p.dependencies.length) {
      out.print()
      out.print(paint(out, 'bold', 'Dependencies'))
      for (const line of table(p.dependencies.map((d) => [`  ${d.sourceAssetName}`, paint(out, 'dim', d.dependencyType.replace('_', ' ')), d.targetAssetName]))) out.print(line)
    }
  },
}

const PLAN_STATUSES = ['draft', 'active', 'completed', 'cancelled'] as const
const PLAN_TYPES = ['refactor', 'feature', 'improvement', 'bugfix'] as const

export const plans: Command = {
  name: 'plans',
  summary: 'List code plans with progress',
  usage: 'codeplans plans [--product <slug>] [--status draft|active|completed|cancelled] [--type <type>]',
  options: { product: { type: 'string' }, status: { type: 'string' }, type: { type: 'string' } },
  async run(ctx, _args, values) {
    const client = ctx.client()
    const filters: Record<string, string> = {}
    if (str(values.product)) filters.productId = (await resolveProduct(client, str(values.product)!)).id
    const status = oneOf(str(values.status), PLAN_STATUSES, 'status')
    const type = oneOf(str(values.type), PLAN_TYPES, 'type')
    if (status) filters.status = status
    if (type) filters.type = type
    const rows = await client.call<Plan[]>('list_code_plans', filters)
    if (ctx.out.json) return printJson(ctx.out, rows)
    if (!rows.length) return ctx.out.print('No plans match.')
    for (const line of table(rows.map((p) => [
      p.id, truncate(p.title, 50), p.status, p.type,
      p.taskCount ? `${p.completedTaskCount ?? 0}/${p.taskCount}` : '-',
      p.productName ?? '',
    ]), ['ID', 'TITLE', 'STATUS', 'TYPE', 'TASKS', 'PRODUCT'], ctx.out)) ctx.out.print(line)
  },
}

export const plan: Command = {
  name: 'plan',
  summary: "A plan's tasks, assets and PRs, and the work items it addresses",
  usage: 'codeplans plan <planId>',
  minArgs: 1,
  async run(ctx, [id]) {
    const p = await ctx.client().call<PlanDetail>('get_code_plan', { id })
    if (ctx.out.json) return printJson(ctx.out, p)
    const { out } = ctx
    out.print(`${paint(out, 'bold', p.title)} ${paint(out, 'dim', `· ${p.status} · ${p.type}${p.revision ? ` · rev ${p.revision}` : ''}${p.productName ? ` · ${p.productName}` : ''}`)}`)
    if (p.description) { out.print(); out.print(truncate(p.description.replace(/\s+/g, ' '), 300)) }
    const tasks = p.tasks ?? []
    out.print()
    out.print(paint(out, 'bold', `Tasks (${tasks.filter((t) => t.status === 'done').length}/${tasks.length} done)`))
    if (!tasks.length) out.print(paint(out, 'dim', '  No tasks yet. Add one: codeplans task add <planId> "<title>"'))
    const names = new Map((p.assignees ?? []).map((a) => [a.id, a.name]))
    for (const line of table(tasks.map((t) => [`  ${TASK_MARK[t.status] ?? '·'}`, truncate(t.title, 60), t.priority, (t.assigneeId && names.get(t.assigneeId)) || '', paint(out, 'dim', t.id)]))) out.print(line)
    const assets = p.planAssets ?? []
    if (assets.length) {
      out.print()
      out.print(paint(out, 'bold', 'Assets'))
      for (const line of table(assets.map((a) => [`  ${a.assetName}`, a.branch ?? '', a.prStatus && a.prStatus !== 'none' ? a.prStatus : '', a.prUrl ?? '']))) out.print(line)
    }
    const items = p.linkedWorkItems ?? []
    if (items.length) {
      out.print()
      out.print(paint(out, 'bold', 'Work items'))
      for (const line of table(items.map((w) => [`  ${truncate(w.title, 60)}`, w.type.replace('_', ' '), w.status.replace('_', ' '), paint(out, 'dim', w.id)]))) out.print(line)
    }
  },
}

const ITEM_TYPES = ['feature', 'bug', 'enhancement', 'ux', 'tech_debt'] as const
const ITEM_STATUSES = ['open', 'planned', 'in_progress', 'resolved', 'wont_do'] as const
const SEVERITIES = ['low', 'medium', 'high', 'critical'] as const

export const items: Command = {
  name: 'items',
  summary: 'List work items (features, bugs, UX issues, tech debt)',
  usage: 'codeplans items [--product <slug>] [--type <type>] [--status <status>] [--severity <s>] [--tag <tag>] [--plan <planId>] [--limit <n>] [--cursor <c>]',
  options: { product: { type: 'string' }, type: { type: 'string' }, status: { type: 'string' }, severity: { type: 'string' }, tag: { type: 'string' }, plan: { type: 'string' }, limit: { type: 'string' }, cursor: { type: 'string' } },
  async run(ctx, _args, values) {
    const client = ctx.client()
    const args: Record<string, unknown> = {}
    if (str(values.product)) args.productId = (await resolveProduct(client, str(values.product)!)).id
    const type = oneOf(str(values.type), ITEM_TYPES, 'type')
    const status = oneOf(str(values.status), ITEM_STATUSES, 'status')
    const severity = oneOf(str(values.severity), SEVERITIES, 'severity')
    if (type) args.type = type
    if (status) args.status = status
    if (severity) args.severity = severity
    if (str(values.tag)) args.tag = str(values.tag)
    if (str(values.plan)) args.planId = str(values.plan)
    if (str(values.cursor)) args.cursor = str(values.cursor)
    if (str(values.limit)) {
      const n = Number(str(values.limit))
      if (!Number.isInteger(n) || n < 1 || n > 200) throw new CliError('--limit must be a whole number from 1 to 200', EXIT.usage)
      args.limit = n
    }
    const res = await client.call<{ items: WorkItem[]; total: number; nextCursor: string | null }>('list_work_items', args)
    if (ctx.out.json) return printJson(ctx.out, res)
    if (!res.items.length) return ctx.out.print('No work items match.')
    for (const line of table(res.items.map((w) => [
      w.id, truncate(w.title, 50), w.type.replace('_', ' '), severityLabel(ctx.out, w.severity), w.status.replace('_', ' '),
      [w.asset, w.area].filter(Boolean).join(' · '), w.owner ?? '', ago(w.updatedAt),
    ]), ['ID', 'TITLE', 'TYPE', 'SEVERITY', 'STATUS', 'ASSET / AREA', 'OWNER', 'UPDATED'], ctx.out)) ctx.out.print(line)
    if (res.nextCursor) ctx.out.print(paint(ctx.out, 'dim', `Showing ${res.items.length} of ${res.total}. Narrow with filters, raise --limit (up to 200), or get the next page with --cursor ${res.nextCursor}.`))
  },
}

function severityLabel(out: Parameters<typeof paint>[0], s: string) {
  return s === 'critical' || s === 'high' ? paint(out, s === 'critical' ? 'red' : 'yellow', s) : s
}

const SEARCH_TYPES = ['product', 'asset', 'plan', 'task', 'work_item', 'spec', 'release'] as const

export const search: Command = {
  name: 'search',
  summary: 'Search products, assets, plans, tasks, work items, specs and releases',
  usage: 'codeplans search <words…> [--type <type>]… [--product <slug>] [--limit <n>]',
  options: { type: { type: 'string', multiple: true }, product: { type: 'string' }, limit: { type: 'string' } },
  minArgs: 1,
  async run(ctx, args, values) {
    const client = ctx.client()
    const query = args.join(' ')
    if (query.trim().length < 2) throw new CliError('Search for at least 2 characters.', EXIT.usage)
    const params: Record<string, unknown> = { query }
    const types = list(values.type).map((t) => oneOf(t, SEARCH_TYPES, 'type')!)
    if (types.length) params.types = types
    if (str(values.product)) params.productId = (await resolveProduct(client, str(values.product)!)).id
    if (str(values.limit)) params.limit = Number(str(values.limit))
    const res = await client.call<{ results: { type: string; id: string; title: string; productName: string; status: string | null; key: string | null }[]; counts?: Record<string, number> }>('search', params)
    if (ctx.out.json) return printJson(ctx.out, res)
    if (!res.results.length) return ctx.out.print(`Nothing matches "${query}".`)
    for (const line of table(res.results.map((r) => [
      paint(ctx.out, 'dim', r.type.replace('_', ' ')), truncate(r.key ? `${r.key} ${r.title}` : r.title, 60), r.status?.replace('_', ' ') ?? '', paint(ctx.out, 'dim', r.productName), r.id,
    ]))) ctx.out.print(line)
  },
}

export const tools: Command = {
  name: 'tools',
  summary: 'List every MCP tool the server offers (use them with codeplans call)',
  usage: 'codeplans tools',
  async run(ctx) {
    const rows = await ctx.client().listTools()
    if (ctx.out.json) return printJson(ctx.out, rows)
    for (const line of table(rows.map((t) => [t.name, truncate((t.description ?? '').split(/(?<=\.)\s/)[0], 90)]))) ctx.out.print(line)
  },
}
