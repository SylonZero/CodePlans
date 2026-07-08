import { createMcpHandler, withMcpAuth } from 'mcp-handler'
import { z } from 'zod'
import { verifyApiKey } from '@/lib/mcp/auth'
import {
  getProducts,
  getProduct,
  getProductDependencyEdges,
  getWorkItems,
  getCodePlans,
  getCodePlan,
  getImpactedAssets,
} from '@/lib/db/queries'
import {
  createWorkItem,
  updateWorkItemStatus,
  linkWorkItemToPlan,
  createCodePlan,
  createTask,
  updateTaskStatus,
  updatePlanAsset,
} from '@/lib/db/mutations'

// The authenticated caller, injected by the auth wrapper below.
type ToolExtra = { authInfo?: { scopes?: string[]; extra?: Record<string, unknown> } }

function uid(extra: ToolExtra): string {
  const userId = extra.authInfo?.extra?.userId
  if (typeof userId !== 'string') throw new Error('Unauthorized')
  return userId
}

function requireWrite(extra: ToolExtra) {
  if (!extra.authInfo?.scopes?.includes('write')) {
    throw new Error('This API key is read-only — a key with write scope is required.')
  }
}

function json(data: unknown) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }] }
}

const handler = createMcpHandler(
  (server) => {
    // ── Read tools ─────────────────────────────────────────────────────────
    server.tool(
      'list_products',
      'List all products visible to this API key, with asset and active-plan counts.',
      {},
      async (_args, extra) => json(await getProducts(uid(extra))),
    )

    server.tool(
      'get_product',
      'Get one product by slug: its assets (with health and tech-debt scores) and dependency edges.',
      { slug: z.string() },
      async ({ slug }, extra) => {
        const product = await getProduct(slug, uid(extra))
        if (!product) return json({ error: 'Product not found or not accessible' })
        const dependencies = await getProductDependencyEdges(product.id)
        return json({ ...product, dependencies })
      },
    )

    server.tool(
      'list_work_items',
      'List work items (features, bugs, UX issues, tech debt) with optional filters.',
      {
        productId: z.string().optional(),
        type: z.enum(['feature', 'bug', 'enhancement', 'ux', 'tech_debt']).optional(),
        status: z.enum(['open', 'planned', 'in_progress', 'resolved', 'wont_do']).optional(),
        planId: z.string().optional(),
      },
      async (filters, extra) => json(await getWorkItems(uid(extra), filters)),
    )

    server.tool(
      'get_tech_debt_register',
      'Open tech-debt work items grouped by asset, most-indebted assets first.',
      { productId: z.string().optional() },
      async ({ productId }, extra) => {
        const items = await getWorkItems(uid(extra), { type: 'tech_debt', productId })
        const open = items.filter((i) => ['open', 'planned', 'in_progress'].includes(i.status))
        const byAsset = new Map<string, typeof open>()
        for (const item of open) {
          const key = item.assetName ?? 'Unassigned'
          byAsset.set(key, [...(byAsset.get(key) ?? []), item])
        }
        return json(
          [...byAsset.entries()]
            .sort((a, b) => b[1].length - a[1].length)
            .map(([asset, assetItems]) => ({ asset, count: assetItems.length, items: assetItems })),
        )
      },
    )

    server.tool(
      'list_code_plans',
      'List code plans with progress, optionally filtered by product/status/type.',
      {
        productId: z.string().optional(),
        status: z.enum(['draft', 'active', 'completed', 'cancelled']).optional(),
        type: z.enum(['refactor', 'feature', 'improvement', 'bugfix']).optional(),
      },
      async (filters, extra) => json(await getCodePlans(uid(extra), filters)),
    )

    server.tool(
      'get_code_plan',
      'Full detail for one code plan: tasks, per-asset branches/PRs, linked work items, and impacted (dependent) assets.',
      { id: z.string() },
      async ({ id }, extra) => {
        const userId = uid(extra)
        const plan = await getCodePlan(id, userId)
        if (!plan) return json({ error: 'Plan not found or not accessible' })
        const [impactedAssets, linkedWorkItems] = await Promise.all([
          getImpactedAssets(id),
          getWorkItems(userId, { planId: id }),
        ])
        return json({ ...plan, impactedAssets, linkedWorkItems })
      },
    )

    // ── Write tools ────────────────────────────────────────────────────────
    server.tool(
      'create_work_item',
      'File a work item (e.g. tech debt discovered while coding). Severity defaults to medium.',
      {
        productId: z.string(),
        title: z.string(),
        description: z.string().default(''),
        type: z.enum(['feature', 'bug', 'enhancement', 'ux', 'tech_debt']),
        severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
        assetId: z.string().optional(),
        area: z.string().optional(),
        tags: z.array(z.string()).default([]),
      },
      async (args, extra) => {
        requireWrite(extra)
        return json(await createWorkItem(args, uid(extra)))
      },
    )

    server.tool(
      'update_work_item_status',
      'Set a native work item status. Mirrored items must be changed in their external tracker.',
      { id: z.string(), status: z.enum(['open', 'planned', 'in_progress', 'resolved', 'wont_do']) },
      async ({ id, status }, extra) => {
        requireWrite(extra)
        const item = await updateWorkItemStatus(id, status)
        return json(item ?? { error: 'Not found, or mirrored from an external tracker — change it there.' })
      },
    )

    server.tool(
      'link_work_item_to_plan',
      'Link a work item to a code plan (many-to-many).',
      { workItemId: z.string(), codePlanId: z.string() },
      async ({ workItemId, codePlanId }, extra) => {
        requireWrite(extra)
        return json(await linkWorkItemToPlan(workItemId, codePlanId))
      },
    )

    server.tool(
      'create_code_plan',
      'Create a draft code plan, optionally targeting assets and linking work items.',
      {
        productId: z.string(),
        title: z.string(),
        description: z.string().default(''),
        type: z.enum(['refactor', 'feature', 'improvement', 'bugfix']),
        tags: z.array(z.string()).default([]),
        targetAssetIds: z.array(z.string()).default([]),
        deadline: z.string().optional(),
        workItemIds: z.array(z.string()).default([]),
      },
      async ({ workItemIds, ...data }, extra) => {
        requireWrite(extra)
        const plan = await createCodePlan({ ...data, assigneeIds: [] }, uid(extra))
        for (const workItemId of workItemIds) await linkWorkItemToPlan(workItemId, plan.id)
        return json(plan)
      },
    )

    server.tool(
      'create_task',
      'Add a task to a code plan.',
      {
        codePlanId: z.string(),
        title: z.string(),
        description: z.string().default(''),
        priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
        assetId: z.string().optional(),
        estimatedEffort: z.number().optional(),
        tags: z.array(z.string()).default([]),
      },
      async (args, extra) => {
        requireWrite(extra)
        return json(await createTask(args))
      },
    )

    server.tool(
      'update_task_status',
      'Set a native task status. Mirrored tasks must be changed in their external tracker.',
      { id: z.string(), status: z.enum(['not_started', 'in_progress', 'done']) },
      async ({ id, status }, extra) => {
        requireWrite(extra)
        const task = await updateTaskStatus(id, status)
        return json(task ?? { error: 'Not found, or mirrored from an external tracker — change it there.' })
      },
    )

    server.tool(
      'update_plan_asset',
      "Record delivery details on a plan's target asset: working branch, PR URL, PR status, notes.",
      {
        codePlanId: z.string(),
        assetId: z.string(),
        branch: z.string().optional(),
        prUrl: z.string().optional(),
        prStatus: z.enum(['none', 'draft', 'open', 'merged', 'closed']).optional(),
        notes: z.string().optional(),
      },
      async ({ codePlanId, assetId, ...data }, extra) => {
        requireWrite(extra)
        const row = await updatePlanAsset(codePlanId, assetId, data)
        return json(row ?? { error: 'Asset is not a target of this plan — add it in the plan first.' })
      },
    )
  },
  {},
  { basePath: '/api/mcp' },
)

// Bearer-token auth: cpk_ keys resolve to a CodePlans user; every tool call
// then runs through the existing user-scoped queries and mutations.
const authedHandler = withMcpAuth(
  handler,
  async (_req, token) => {
    const verified = await verifyApiKey(token)
    if (!verified) return undefined
    return {
      token: token!,
      clientId: verified.userId,
      scopes: verified.scope === 'write' ? ['read', 'write'] : ['read'],
      extra: { userId: verified.userId },
    }
  },
  { required: true },
)

export { authedHandler as GET, authedHandler as POST, authedHandler as DELETE }
