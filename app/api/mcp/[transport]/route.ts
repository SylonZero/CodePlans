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
  createProduct,
  updateProduct,
  createAsset,
  updateAsset,
  setAssetOwners,
  createAssetDependency,
  deleteAssetDependency,
  createWorkItem,
  updateWorkItem,
  updateWorkItemStatus,
  linkWorkItemToPlan,
  unlinkWorkItemFromPlan,
  createCodePlan,
  updateCodePlan,
  createTask,
  updateTask,
  updateTaskStatus,
  updatePlanAsset,
  addPlanAsset,
  removePlanAsset,
} from '@/lib/db/mutations'
import { getAssetOptions } from '@/lib/db/queries'
import { resolveAssigneeEmail } from '@/lib/mcp/users'

/** Guard: the key's user must be able to see the product. */
async function assertProductAccess(userId: string, productId: string) {
  const visible = await getProducts(userId, productId)
  if (visible.length === 0) throw new Error('Product not found or not accessible')
}

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

    // ── Product & asset management ─────────────────────────────────────────
    server.tool(
      'get_modeling_guide',
      'How to break a codebase (especially a monorepo) into CodePlans products, assets, and dependency edges. Read this before bulk-creating assets.',
      {},
      async () => json({
        product: 'A planning boundary, not a repo boundary. One product can span repos; a monorepo can host several products. Shared platform libraries serving multiple products go in a dedicated Platform product — cross-product dependency edges and impact analysis work.',
        assetTest: 'Model something as an asset only if: (a) code plans will target it, (b) tech debt will be registered against it, or (c) it must appear in blast-radius reports. Assets are coordination units, not folders.',
        tiers: [
          'Apps: always their own asset (repoPath: apps/<name> in monorepos).',
          'Services (deployable units, incl. internal/MCP services): always their own asset.',
          'Keystone libraries (high-fanout or high-churn: UI kit, data-access, auth, shared schema): own asset each — usually 5-8, not 30.',
          'Long-tail libraries: cluster into 2-4 domain-group assets (e.g. "Shared Libs — Domain Utils", repoPath: packages/). Use the work item `area` field (e.g. packages/date-helpers) for lib-level precision inside a cluster.',
        ],
        promotion: 'Start coarse; split a library out of its cluster only when it repeatedly accumulates debt items or becomes a plan target. Promoting later is cheap (create_asset, re-point work items via update_work_item assetId, add edges); pruning over-modeled assets is not.',
        dependencies: 'Map coordination risk, not the import graph — your build tool already knows every import. Add an edge only where a change genuinely forces cross-asset coordination. Impact analysis is only trusted when curated.',
        monorepoCaveat: 'PRs are per-repo: a cross-library plan in one monorepo shares one PR across its plan-asset rows. Put the PR URL on the primary target and use notes on the others; this argues for FEWER assets, not more.',
        workflow: 'Recommended flow: read the workspace graph (pnpm-workspace/nx/turbo), propose the tiered asset list and 10-25 dependency edges to the user for approval BEFORE creating anything, then create_product/create_asset/add_asset_dependency in one pass, and finish by reading get_product back to verify.',
      }),
    )
    server.tool(
      'create_product',
      'Create a product in your workspace. A product is a PLANNING boundary, not a repo boundary — one product may span several repos, and shared platform libraries serving multiple products belong in their own "Platform" product (cross-product dependency edges work).',
      { name: z.string(), description: z.string().default(''), tags: z.array(z.string()).default([]), slug: z.string().optional() },
      async ({ name, slug, ...rest }, extra) => {
        requireWrite(extra)
        const userId = uid(extra)
        const { db } = await import('@/lib/db')
        const { users } = await import('@/lib/db/schema')
        const { eq } = await import('drizzle-orm')
        const profile = await db.query.users.findFirst({ where: eq(users.id, userId) })
        const finalSlug = slug ?? name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
        return json(await createProduct(
          { name, slug: finalSlug, organizationId: profile?.organizationId ?? undefined, ...rest },
          userId,
        ))
      },
    )

    server.tool(
      'update_product',
      'Update a product you created (name, description, tags).',
      { id: z.string(), name: z.string().optional(), description: z.string().optional(), tags: z.array(z.string()).optional() },
      async ({ id, ...data }, extra) => {
        requireWrite(extra)
        const row = await updateProduct(id, data, uid(extra))
        return json(row ?? { error: 'Not found, or only the product creator can update it' })
      },
    )

    server.tool(
      'create_asset',
      'Add an asset to a product. Assets are COORDINATION units, not a folder inventory — model something only if plans will target it, debt will be registered against it, or it belongs in blast-radius reports. Apps and services: always. Libraries: only high-fanout/high-churn ones individually; cluster the long tail into domain-group assets (work items use their `area` field for lib-level precision inside a cluster). Use repoPath for monorepo folders. Call get_modeling_guide for the full heuristic.',
      {
        productId: z.string(),
        name: z.string(),
        type: z.enum(['app', 'service', 'library', 'datastore', 'platform']),
        description: z.string().default(''),
        tags: z.array(z.string()).default([]),
        repositoryUrl: z.string().optional(),
        repoPath: z.string().optional(),
        documentationUrl: z.string().optional(),
        ownerEmails: z.array(z.string()).optional(),
      },
      async ({ ownerEmails, ...args }, extra) => {
        requireWrite(extra)
        await assertProductAccess(uid(extra), args.productId)
        const asset = await createAsset(args)
        if (ownerEmails !== undefined) {
          const ownerIds = await Promise.all(ownerEmails.map((e) => resolveAssigneeEmail(uid(extra), e)))
          await setAssetOwners(asset.id, ownerIds)
        }
        return json(asset)
      },
    )

    server.tool(
      'update_asset',
      'Update an asset: description, tags, health, manual tech-debt score, repo details, owners (ownerEmails replaces the full owner set; [] clears it).',
      {
        id: z.string(),
        name: z.string().optional(),
        description: z.string().optional(),
        tags: z.array(z.string()).optional(),
        health: z.enum(['healthy', 'warning', 'critical']).optional(),
        techDebtScore: z.number().int().min(0).max(100).optional(),
        repositoryUrl: z.string().optional(),
        repoPath: z.string().optional(),
        documentationUrl: z.string().optional(),
        ownerEmails: z.array(z.string()).optional(),
      },
      async ({ id, ownerEmails, ...data }, extra) => {
        requireWrite(extra)
        const options = await getAssetOptions(uid(extra))
        if (!options.some((a) => a.id === id)) return json({ error: 'Asset not found or not accessible' })
        if (ownerEmails !== undefined) {
          const ownerIds = await Promise.all(ownerEmails.map((e) => resolveAssigneeEmail(uid(extra), e)))
          await setAssetOwners(id, ownerIds)
        }
        return json(await updateAsset(id, data))
      },
    )

    server.tool(
      'add_asset_dependency',
      'Record that one asset depends on / integrates with / aggregates another — powers plan impact analysis. Map COORDINATION RISK, not the import graph: only edges where a change forces cross-asset coordination. Twenty curated edges beat two hundred stale ones.',
      {
        sourceAssetId: z.string(),
        targetAssetId: z.string(),
        dependencyType: z.enum(['depends_on', 'integrates_with', 'aggregates']).default('depends_on'),
        description: z.string().optional(),
      },
      async (args, extra) => {
        requireWrite(extra)
        const options = await getAssetOptions(uid(extra))
        const ids = new Set(options.map((a) => a.id))
        if (!ids.has(args.sourceAssetId) || !ids.has(args.targetAssetId)) {
          return json({ error: 'One or both assets not found or not accessible' })
        }
        const edge = await createAssetDependency(args)
        return json(edge ?? { error: 'Self-dependencies are not allowed' })
      },
    )

    server.tool(
      'remove_asset_dependency',
      'Remove a dependency edge by its id (see get_product dependencies).',
      { id: z.string() },
      async ({ id }, extra) => {
        requireWrite(extra)
        return json((await deleteAssetDependency(id)) ?? { error: 'Edge not found' })
      },
    )

    // ── Plan lifecycle & targets ───────────────────────────────────────────
    server.tool(
      'update_code_plan',
      'Edit a plan: title, description, type, tags, deadline, or specUrl (link the design spec markdown).',
      {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['refactor', 'feature', 'improvement', 'bugfix']).optional(),
        tags: z.array(z.string()).optional(),
        deadline: z.string().optional(),
        specUrl: z.string().optional(),
        ownerEmail: z.string().nullable().optional(),
      },
      async ({ id, ownerEmail, ...data }, extra) => {
        requireWrite(extra)
        if (!(await getCodePlan(id, uid(extra)))) return json({ error: 'Plan not found or not accessible' })
        const ownerId =
          ownerEmail === undefined ? undefined
          : ownerEmail === null ? null
          : await resolveAssigneeEmail(uid(extra), ownerEmail)
        return json(await updateCodePlan(id, { ...data, ...(ownerId !== undefined ? { ownerId } : {}) }))
      },
    )

    server.tool(
      'activate_plan',
      'Move a draft code plan to active.',
      { id: z.string() },
      async ({ id }, extra) => {
        requireWrite(extra)
        if (!(await getCodePlan(id, uid(extra)))) return json({ error: 'Plan not found or not accessible' })
        return json(await updateCodePlan(id, { status: 'active' }))
      },
    )

    server.tool(
      'complete_plan',
      'Mark a code plan completed. Also posts completion comments to mirrored tracker issues linked to it.',
      { id: z.string() },
      async ({ id }, extra) => {
        requireWrite(extra)
        if (!(await getCodePlan(id, uid(extra)))) return json({ error: 'Plan not found or not accessible' })
        const plan = await updateCodePlan(id, { status: 'completed' })
        const { notifyPlanCompleted } = await import('@/lib/integrations/writeback')
        const commentsPosted = await notifyPlanCompleted(id)
        return json({ ...plan, commentsPosted })
      },
    )

    server.tool(
      'add_plan_asset',
      'Add a target asset to an existing plan (creates its branch/PR row).',
      { codePlanId: z.string(), assetId: z.string() },
      async ({ codePlanId, assetId }, extra) => {
        requireWrite(extra)
        if (!(await getCodePlan(codePlanId, uid(extra)))) return json({ error: 'Plan not found or not accessible' })
        return json(await addPlanAsset(codePlanId, assetId))
      },
    )

    server.tool(
      'remove_plan_asset',
      'Remove a target asset from a plan.',
      { codePlanId: z.string(), assetId: z.string() },
      async ({ codePlanId, assetId }, extra) => {
        requireWrite(extra)
        return json((await removePlanAsset(codePlanId, assetId)) ?? { error: 'Not a target of this plan' })
      },
    )

    server.tool(
      'update_work_item',
      'Edit a work item (native fields only on mirrored items: asset, area, severity).',
      {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        type: z.enum(['feature', 'bug', 'enhancement', 'ux', 'tech_debt']).optional(),
        status: z.enum(['open', 'planned', 'in_progress', 'resolved', 'wont_do']).optional(),
        severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        assetId: z.string().nullable().optional(),
        area: z.string().nullable().optional(),
        specUrl: z.string().optional(),
        ownerEmail: z.string().nullable().optional(),
        tags: z.array(z.string()).optional(),
      },
      async ({ id, ownerEmail, ...data }, extra) => {
        requireWrite(extra)
        const ownerId =
          ownerEmail === undefined ? undefined
          : ownerEmail === null ? null
          : await resolveAssigneeEmail(uid(extra), ownerEmail)
        return json((await updateWorkItem(id, { ...data, ...(ownerId !== undefined ? { ownerId } : {}) })) ?? { error: 'Work item not found' })
      },
    )

    server.tool(
      'unlink_work_item_from_plan',
      'Remove a work item ↔ plan link.',
      { workItemId: z.string(), codePlanId: z.string() },
      async ({ workItemId, codePlanId }, extra) => {
        requireWrite(extra)
        return json((await unlinkWorkItemFromPlan(workItemId, codePlanId)) ?? { error: 'Link not found' })
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
        specUrl: z.string().optional(),
        ownerEmail: z.string().optional(),
        tags: z.array(z.string()).default([]),
      },
      async ({ ownerEmail, ...args }, extra) => {
        requireWrite(extra)
        const ownerId = ownerEmail ? await resolveAssigneeEmail(uid(extra), ownerEmail) : undefined
        return json(await createWorkItem({ ...args, ownerId }, uid(extra)))
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
        specUrl: z.string().optional(),
        ownerEmail: z.string().optional(),
        workItemIds: z.array(z.string()).default([]),
      },
      async ({ workItemIds, ownerEmail, ...data }, extra) => {
        requireWrite(extra)
        const ownerId = ownerEmail ? await resolveAssigneeEmail(uid(extra), ownerEmail) : undefined
        const plan = await createCodePlan({ ...data, ownerId }, uid(extra))
        for (const workItemId of workItemIds) await linkWorkItemToPlan(workItemId, plan.id)
        return json(plan)
      },
    )

    server.tool(
      'create_task',
      'Add a task to a code plan. assigneeEmail must be a workspace member.',
      {
        codePlanId: z.string(),
        title: z.string(),
        description: z.string().default(''),
        priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
        assetId: z.string().optional(),
        assigneeEmail: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        estimatedEffort: z.number().optional(),
        tags: z.array(z.string()).default([]),
      },
      async ({ assigneeEmail, ...args }, extra) => {
        requireWrite(extra)
        const assigneeId = assigneeEmail
          ? await resolveAssigneeEmail(uid(extra), assigneeEmail)
          : undefined
        return json(await createTask({ ...args, assigneeId }))
      },
    )

    server.tool(
      'update_task',
      'Edit a task: title/description/priority/effort/assignee (by email; null email unassigns). Mirrored tasks: only assignee, priority, effort, and asset are editable.',
      {
        id: z.string(),
        title: z.string().optional(),
        description: z.string().optional(),
        priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
        assetId: z.string().optional(),
        assigneeEmail: z.string().nullable().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        estimatedEffort: z.number().optional(),
        actualEffort: z.number().optional(),
        percentComplete: z.number().int().min(0).max(100).optional(),
        tags: z.array(z.string()).optional(),
      },
      async ({ id, assigneeEmail, ...data }, extra) => {
        requireWrite(extra)
        const assigneeId =
          assigneeEmail === undefined
            ? undefined
            : assigneeEmail === null
              ? null
              : await resolveAssigneeEmail(uid(extra), assigneeEmail)
        const task = await updateTask(id, { ...data, ...(assigneeId !== undefined ? { assigneeId } : {}) })
        return json(task ?? { error: 'Task not found' })
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
