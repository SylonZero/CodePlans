import { readFileSync } from 'node:fs'
import { CliError, EXIT, type Client } from '../client.js'
import { paint, printJson } from '../output.js'
import { list, oneOf, resolveProduct, str, type Command, type Values } from '../cli.js'

type Created = { id: string; title?: string; status?: string }
type ProductAssets = { assets: { id: string; name: string }[] }

const PLAN_TYPES = ['refactor', 'feature', 'improvement', 'bugfix'] as const
const ITEM_TYPES = ['feature', 'bug', 'enhancement', 'ux', 'tech_debt'] as const
const ITEM_STATUSES = ['open', 'planned', 'in_progress', 'resolved', 'wont_do'] as const
const PRIORITIES = ['low', 'medium', 'high', 'critical'] as const

/** Asset ids from names or ids, within one product. */
async function resolveAssets(client: Client, productSlug: string, refs: string[]): Promise<string[]> {
  if (!refs.length) return []
  const { assets } = await client.call<ProductAssets>('get_product', { slug: productSlug })
  return refs.map((ref) => {
    const match = assets.find((a) => a.id === ref) ?? assets.find((a) => a.name.toLowerCase() === ref.toLowerCase())
    if (!match) throw new CliError(`No asset "${ref}" in ${productSlug}. Assets: ${assets.map((a) => a.name).join(', ') || 'none'}.`, EXIT.usage)
    return match.id
  })
}

function done(ctx: { out: Parameters<typeof printJson>[0] }, data: unknown, message: string) {
  if (ctx.out.json) return printJson(ctx.out, data)
  ctx.out.print(`${paint(ctx.out, 'green', '✓')} ${message}`)
}

/** Text from --description, or a file with --description-file (- reads stdin). */
function description(values: Values): string | undefined {
  const file = str(values['description-file'])
  if (file) return readFileSync(file === '-' ? 0 : file, 'utf8')
  return str(values.description)
}

export const planCreate: Command = {
  name: 'plan create',
  summary: 'Create a draft code plan',
  usage: 'codeplans plan create --product <slug> --title <title> [--type feature|refactor|improvement|bugfix] [--asset <name>]… [--item <workItemId>]… [--description <text> | --description-file <path|->] [--tag <tag>]…',
  options: {
    product: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, asset: { type: 'string', multiple: true },
    item: { type: 'string', multiple: true }, description: { type: 'string' }, 'description-file': { type: 'string' }, tag: { type: 'string', multiple: true },
    owner: { type: 'string' }, deadline: { type: 'string' },
  },
  async run(ctx, _args, values) {
    const productRef = str(values.product)
    const title = str(values.title)
    if (!productRef || !title) throw new CliError(`Usage: ${planCreate.usage}`, EXIT.usage)
    const client = ctx.client()
    const p = await resolveProduct(client, productRef)
    const plan = await client.call<Created>('create_code_plan', {
      productId: p.id, title, type: oneOf(str(values.type), PLAN_TYPES, 'type') ?? 'feature',
      description: description(values) ?? '', tags: list(values.tag),
      targetAssetIds: await resolveAssets(client, p.slug, list(values.asset)), workItemIds: list(values.item),
      ...(str(values.owner) ? { ownerEmail: str(values.owner) } : {}), ...(str(values.deadline) ? { deadline: str(values.deadline) } : {}),
    })
    done(ctx, plan, `Created draft plan "${title}" ${paint(ctx.out, 'dim', plan.id)}`)
  },
}

export const planActivate: Command = {
  name: 'plan activate',
  summary: 'Move a draft plan to active (the review workflow may require an approval first)',
  usage: 'codeplans plan activate <planId>',
  minArgs: 1,
  async run(ctx, [id]) {
    const plan = await ctx.client().call<Created>('activate_plan', { id })
    done(ctx, plan, `Activated "${plan.title ?? id}"`)
  },
}

export const planComplete: Command = {
  name: 'plan complete',
  summary: 'Mark a plan completed',
  usage: 'codeplans plan complete <planId>',
  minArgs: 1,
  async run(ctx, [id]) {
    const plan = await ctx.client().call<Created>('complete_plan', { id })
    done(ctx, plan, `Completed "${plan.title ?? id}"`)
  },
}

export const taskAdd: Command = {
  name: 'task add',
  summary: 'Add a task to a plan (re-adding the same title does nothing, so scripts can re-run)',
  usage: 'codeplans task add <planId> <title> [--priority low|medium|high|critical] [--assignee <email>] [--description <text> | --description-file <path|->]',
  options: { priority: { type: 'string' }, assignee: { type: 'string' }, description: { type: 'string' }, 'description-file': { type: 'string' } },
  minArgs: 2,
  async run(ctx, [codePlanId, ...words], values) {
    const title = words.join(' ')
    const task = await ctx.client().call<Created>('create_task', {
      codePlanId, title, priority: oneOf(str(values.priority), PRIORITIES, 'priority') ?? 'medium', description: description(values) ?? '',
      ...(str(values.assignee) ? { assigneeEmail: str(values.assignee) } : {}),
    })
    done(ctx, task, `Task "${title}" ${paint(ctx.out, 'dim', task.id)}`)
  },
}

function taskStatus(name: string, status: 'in_progress' | 'done' | 'not_started', verb: string, summary: string): Command {
  return {
    name,
    summary,
    usage: `codeplans ${name} <taskId>`,
    minArgs: 1,
    async run(ctx, [id]) {
      const task = await ctx.client().call<Created>('update_task_status', { id, status })
      done(ctx, task, `${verb}: ${task.title ?? id}`)
    },
  }
}
export const taskStart = taskStatus('task start', 'in_progress', 'Started', 'Start a task (the review workflow may require the plan to be approved)')
export const taskDone = taskStatus('task done', 'done', 'Done', 'Mark a task done')
export const taskReset = taskStatus('task reset', 'not_started', 'Reset', 'Move a task back to not started')

export const itemAdd: Command = {
  name: 'item add',
  summary: 'File a work item',
  usage: 'codeplans item add --product <slug> --title <title> --type feature|bug|enhancement|ux|tech_debt [--severity <s>] [--asset <name>] [--area <area>] [--description <text>] [--tag <tag>]…',
  options: {
    product: { type: 'string' }, title: { type: 'string' }, type: { type: 'string' }, severity: { type: 'string' }, asset: { type: 'string' },
    area: { type: 'string' }, description: { type: 'string' }, 'description-file': { type: 'string' }, tag: { type: 'string', multiple: true }, owner: { type: 'string' },
  },
  async run(ctx, _args, values) {
    const productRef = str(values.product)
    const title = str(values.title)
    const type = oneOf(str(values.type), ITEM_TYPES, 'type')
    if (!productRef || !title || !type) throw new CliError(`Usage: ${itemAdd.usage}`, EXIT.usage)
    const client = ctx.client()
    const p = await resolveProduct(client, productRef)
    const [assetId] = await resolveAssets(client, p.slug, str(values.asset) ? [str(values.asset)!] : [])
    const item = await client.call<Created>('create_work_item', {
      productId: p.id, title, type, severity: oneOf(str(values.severity), PRIORITIES, 'severity') ?? 'medium',
      description: description(values) ?? '', tags: list(values.tag),
      ...(assetId ? { assetId } : {}), ...(str(values.area) ? { area: str(values.area) } : {}), ...(str(values.owner) ? { ownerEmail: str(values.owner) } : {}),
    })
    done(ctx, item, `Filed "${title}" ${paint(ctx.out, 'dim', item.id)}`)
  },
}

export const itemStatus: Command = {
  name: 'item status',
  summary: "Set a work item's status",
  usage: 'codeplans item status <itemId> open|planned|in_progress|resolved|wont_do',
  minArgs: 2,
  async run(ctx, [id, status]) {
    const item = await ctx.client().call<Created>('update_work_item_status', { id, status: oneOf(status, ITEM_STATUSES, 'status') })
    done(ctx, item, `${item.title ?? id} is now ${status.replace('_', ' ')}`)
  },
}

/** "k=v": the value is parsed as JSON when it parses (numbers, booleans, arrays), else kept as a string. */
export function parseArg(pair: string): [string, unknown] {
  const eq = pair.indexOf('=')
  if (eq < 1) throw new CliError(`--arg takes key=value, got "${pair}"`, EXIT.usage)
  const key = pair.slice(0, eq)
  const raw = pair.slice(eq + 1)
  try { return [key, JSON.parse(raw)] } catch { return [key, raw] }
}

export const call: Command = {
  name: 'call',
  summary: 'Call any MCP tool directly, for anything without its own command',
  usage: 'codeplans call <tool> [--arg key=value]… [--input <file.json|->]',
  details: 'Values given with --arg are parsed as JSON when they can be (e.g. --arg limit=5 --arg tags=\'["a"]\'), otherwise taken as text.\nThe result is printed as JSON. List the tools and their descriptions with: codeplans tools',
  options: { arg: { type: 'string', multiple: true }, input: { type: 'string' } },
  minArgs: 1,
  async run(ctx, [tool], values) {
    let args: Record<string, unknown> = {}
    const input = str(values.input)
    if (input) {
      try { args = JSON.parse(readFileSync(input === '-' ? 0 : input, 'utf8')) } catch (err) {
        throw new CliError(`Can't read JSON from ${input}: ${err instanceof Error ? err.message : err}`, EXIT.usage)
      }
    }
    for (const pair of list(values.arg)) { const [k, v] = parseArg(pair); args[k] = v }
    const result = await ctx.client().call(tool, args)
    printJson(ctx.out, result)
  },
}
