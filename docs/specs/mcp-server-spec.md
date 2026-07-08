# MCP Server Interface — Design (v0.3.1)

> **Status: SHIPPED in v0.3.1; management tools added in v0.3.2** (26 tools:
> products, assets, dependencies, plan lifecycle/targets, full work-item edit). Companion to
> `design-spec-v3.md`; reuses its data layer and access model unchanged.

## Goal

Let AI agents — Claude Code in a repo, Claude Desktop, claude.ai — read and
update CodePlans directly: pull the active plan and its tasks while coding,
mark tasks done, update a plan-asset's branch/PR, file tech-debt items as
they're discovered. No OAuth; API-key auth.

## Approach: Streamable HTTP endpoint inside the Next.js app

One new route handler, `app/api/mcp/[transport]/route.ts`, built on the
`mcp-handler` package (wraps `@modelcontextprotocol/sdk` for App Router
routes). Rationale:

- **Fastest**: a single route file whose tools call the existing
  `lib/db/queries.ts` / `lib/db/mutations.ts` functions — no new service, no
  separate process, works identically for local SQLite and hosted Postgres
  because it lives in the same app.
- **Smoothest for Claude**: Claude Code (`claude mcp add --transport http
  codeplans http://localhost:3000/api/mcp --header "Authorization: Bearer
  <key>"`) and Claude Desktop (same via config JSON) speak Streamable HTTP
  with custom headers today.
- A stdio wrapper is explicitly **not** needed: local users run the dev
  server anyway, and HTTP works for both local and hosted.

`proxy.ts` must exempt `/api/mcp` from the session redirect (it currently
redirects all non-auth routes to `/login`); the route does its own auth.

## Auth: API keys that impersonate a user

New table `api_keys` (both dialects):

| Field | Notes |
|---|---|
| id | PK |
| userId | FK → users — **the key acts as this user** |
| name | label ("Claude Code – laptop") |
| keyHash | SHA-256 of the full key; plaintext shown once at creation |
| keyPrefix | first 12 chars (`cpk_a1b2c3d4`) for display |
| scope | `read` \| `write` (write ⊃ read) |
| lastUsedAt, createdAt, revokedAt | revoke = soft (set revokedAt) |

The key-maps-to-a-user design is the load-bearing decision: every existing
query and mutation already takes `userId` and enforces org scoping via
`productAccessWhere`, and mirrored-field guards live in the mutation layer —
so the MCP surface inherits **all** access control for free. MCP writes also
flow through the same `logActivity` path (actor = the key's user), so agent
actions appear in the activity feed.

Verification per request: `Authorization: Bearer cpk_…` → SHA-256 → indexed
lookup on `keyHash` where `revokedAt IS NULL` → bump `lastUsedAt`
(fire-and-forget). Constant-time compare not required (hash lookup), no
key material ever stored or logged.

**claude.ai caveat**: custom connectors there can't set headers; if needed,
support `?key=` query param as a documented fallback (keys are revocable;
note the URL-logging risk). Primary targets remain Claude Code + Desktop.

## Tool surface (~12 tools, thin wrappers)

Read (scope ≥ read):
- `list_products` → `getProducts`
- `get_product` (slug) → `getProduct` (assets incl. debt scores) + dependency edges
- `list_work_items` (filters: product, type, status, planId) → `getWorkItems`
- `list_code_plans` (filters) → `getCodePlans`
- `get_code_plan` (id) → `getCodePlan` + `getImpactedAssets` (tasks, per-asset PRs, blast radius in one call)
- `get_tech_debt_register` → `getWorkItems({type:'tech_debt'})` grouped by asset

Write (scope = write):
- `create_work_item`, `update_work_item_status`, `link_work_item_to_plan`
- `create_code_plan`, `create_task`, `update_task_status`
- `update_plan_asset` (branch / prUrl / prStatus — lets an agent report its own PR)

Zod schemas (already a dependency) define inputs; outputs are compact JSON.
Mirrored items: the mutation layer already rejects mirrored-field writes —
tools surface that as a clear error message ("mirrored from github — change
it in the tracker").

## UI: key management in Settings

New "API Keys" tab in Settings: create (name + scope, plaintext shown once),
list (prefix, scope, last used), revoke. Follows the existing settings-client
tab pattern.

## Out of scope for v0.3.1

OAuth, per-product key scoping, rate limiting (single-team instances),
deletes of records (link removals only — destructive tools stay UI-only),
MCP resources/prompts (tools only), write-back via MCP (exists via plan
completion already), analytics tools.

## Delivery checklist

1. Migration 0004: `api_keys` (+ index on keyHash) — both dialects
2. `lib/mcp/auth.ts` (key mint/verify), `lib/db` additions (CRUD)
3. `app/api/mcp/[transport]/route.ts` with tool definitions
4. `proxy.ts` exemption; Settings → API Keys tab
5. Tests: key lifecycle, auth rejection paths, 2–3 representative tool
   handlers against the in-memory DB
6. README + docs site: "Connect Claude" section with `claude mcp add` snippet
