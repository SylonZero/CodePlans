## CodePlans App Spec

> **Status:** current implemented state as of **v0.4.4** (2026-08). For the target
> design and rationale, see `docs/specs/design-spec-v3.md` (all phases shipped),
> `docs/specs/releases-and-asset-history-spec.md` (Phases A–D shipped), and
> `docs/specs/asset-record-spec.md` (Phase A shipped; Phases B–C are the next
> tranche, v0.4.5+).

### Overview

CodePlans is a **code change coordination tool** for engineering teams. It organizes work around the hierarchy **Products → Assets → Code Plans → Tasks**, with **Work Items** (features, bugs, UX issues, tech debt) as the demand side linked many-to-many to code plans, per-asset **branch/PR tracking** on plans, **releases** grouping the plans that ship together (with per-asset version stamps and derived release notes), a per-asset **history timeline and design log**, a per-asset **record** (capabilities register graduated from delivered work), **asset dependencies** with impact analysis, pull-only **integrations** that mirror external tracker items into work items, and a 41-tool **MCP server** for AI coding agents. Users track technical debt, coordinate architectural changes, and measure team velocity. Deployed at `codeplans.ai`. Stack: Next.js 16 (App Router), Drizzle ORM, pluggable auth/DB (SQLite local / Supabase+Postgres cloud).

---

### Data Model

#### `users`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| email | text | |
| name | text | |
| avatarUrl | text? | |
| billingTier | `free\|pro\|team\|enterprise` | default `free` |
| role | `owner\|admin\|editor\|viewer` | default `viewer` |
| organizationId | text? | FK → organizations (nullable) |
| featureFlags | JSON `{ alpha?, beta?, aiAssistance? }` | default `{}` |
| passwordHash | text? | only used in local auth mode |
| createdAt | timestamp | |

#### `organizations`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| name | text | |
| slug | text | unique |
| ownerId | text | FK → users.id |
| billingTier | `free\|pro\|team\|enterprise` | default `free` |
| productLimit | integer | default `1` |
| createdAt | timestamp | |

#### `organization_members`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| organizationId | text | FK → organizations (cascade delete) |
| userId | text | FK → users (cascade delete) |
| role | `owner\|admin\|editor\|viewer` | default `viewer` |
| invitedBy | text? | FK → users |
| joinedAt | timestamp? | null = pending invitation |
| createdAt | timestamp | |

**Rule:** A member with `joinedAt = null` is a **pending invite** (not yet counted as active member).

#### `products`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| name | text | |
| slug | text | unique |
| description | text | default `''` |
| tags | JSON `string[]` | |
| organizationId | text? | FK → organizations (set null on delete) |
| creatorId | text | FK → users |
| createdAt | timestamp | |

#### `assets`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| productId | text | FK → products (cascade delete) |
| name | text | |
| type | `app\|service\|library\|datastore\|platform` | |
| description | text | |
| tags | JSON `string[]` | |
| health | `healthy\|warning\|critical` | default `healthy` |
| status | `active\|deprecated\|planned` | default `active` |
| techDebtScore | integer? | 0–100 scale |
| repositoryUrl | text? | |
| documentationUrl | text? | |
| metadata | JSON object | extensible |
| createdAt / updatedAt | timestamp | |

#### `asset_dependencies`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| sourceAssetId | text | FK → assets (cascade delete) |
| targetAssetId | text | FK → assets (cascade delete) |
| dependencyType | `depends_on\|integrates_with\|aggregates` | |
| description | text? | |
| createdAt | timestamp | |

**Used by:** the product Dependencies tab (edge CRUD + adjacency view) and plan Impact Analysis (`getImpactedAssets`).

#### `code_plans`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| title | text | |
| description | text | |
| productId | text | FK → products (cascade delete) |
| type | `refactor\|feature\|improvement\|bugfix` | |
| status | `draft\|active\|completed\|cancelled` | default `draft` |
| tags | JSON `string[]` | |
| targetAssetIds | JSON `string[]` | asset IDs this plan affects |
| startDate / endDate / deadline | text? | ISO date strings |
| creatorId | text | FK → users |
| assigneeIds | JSON `string[]` | user IDs |
| createdAt / updatedAt | timestamp | |

#### `tasks`
| Field | Type | Notes |
|---|---|---|
| id | text (UUID) | PK |
| codePlanId | text | FK → code_plans (cascade delete) |
| assetId | text? | FK → assets (set null on delete) |
| title | text | |
| description | text | |
| status | `not_started\|in_progress\|done` | default `not_started` |
| priority | `low\|medium\|high\|critical` | default `medium` |
| tags | JSON `string[]` | |
| assigneeId | text? | FK → users (set null on delete) |
| percentComplete | integer? | 0–100, meaningful while in_progress (slider in the task panel) |
| startDate / endDate | date? | scheduling window (for future PM-tool syncs) |
| estimatedEffort | integer? | hours |
| actualEffort | integer? | hours |
| createdAt / updatedAt | timestamp | |

#### v3 foundation tables (see design-spec-v3 §5 for full field tables)

| Table | Purpose |
|---|---|
| `work_items` | Demand side: `type` feature/bug/enhancement/ux/tech_debt, `status` open/planned/in_progress/resolved/wont_do, `severity`, optional `assetId` + free-text `area`, one-level `parentId`, plus provenance columns |
| `work_item_code_plans` | Many-to-many work item ↔ plan links (unique pair) |
| `code_plan_assets` | Source of truth for plan targets; per-asset `branch`, `prUrl`, `prStatus` (none/draft/open/merged/closed), `notes` (unique plan+asset) |
| `integrations` | Org-scoped connections: `provider`, credential = `token_encrypted` (AES-256-GCM, key from AUTH_SECRET — preferred) or `authRef` env-var name, `config` (repo, target productId, status/type maps), `status`, `lastSyncAt`, `lastError` |
| `sync_log` | Item-level events (native mutations + sync runs); drives the activity feed |
| `api_keys` | MCP access: per-user hashed `cpk_` tokens (`keyHash` sha256, `keyPrefix` for display, `scope` read/write, soft revoke) |

Provenance columns (`source` default `native`, `connectionId`, `externalId/Key/Url`, `externalData`, `externalDeleted`, `syncedAt`) exist on `work_items`, `code_plans`, `tasks`, and `releases`, with a unique index on `(connection_id, external_id)`. `assets` gained `repo_path` for monorepo folders and a freeform `notes` markdown doc. The `code_plans.target_asset_ids` / `assignee_ids` arrays were **dropped in v0.3.0** (join tables are authoritative). `code_plan_assignees` was **dropped in v0.3.22** — plan assignees are derived from `tasks.assigneeId`. Asset owners (routing/visibility, not an ACL) live in `asset_owners` (v0.3.24).

#### v0.4.x tables (see releases-and-asset-history-spec §5 for full field tables)

| Table | Purpose |
|---|---|
| `releases` | Delivery grouping above plans: `status` planned/in_progress/shipped/abandoned (explicit — shipping is a human act), `shippedAt`, tags, provenance columns. `code_plans.releaseId` (nullable, set-null) attaches a plan to at most one release |
| `release_assets` | Per-asset version stamp: `version`, `notes` (unique release+asset). Shipped releases' stamps become version tick marks in asset history |
| `asset_design_log` | Curated design notes per asset: markdown `body`, optional `releaseId`/`codePlanId` anchors, `authorKind` user/agent + `authorId` |
| `asset_capabilities` | (v0.4.4, asset-record-spec §5.1) Capability claims with receipts: `status` active/removed (tombstones, never deletes), `source` graduated/reconciled, origin FKs (work item — partial-unique, plan, release — all set-null) + `originSummary` text that survives FK nulling, `verifiedAt`, `removedAt` |

---

### Access Control Rules

**Product visibility** (single source of truth: `productAccessWhere` in `lib/db/queries.ts`):
- Products the user created **OR** products belonging to any org where the user has a joined `organization_members` row. `users.organizationId` is only a "current org" pointer and is not consulted for access.
- In `HOST_MODE=team`, a boot hook (`instrumentation.ts` → `lib/db/bootstrap.ts`) creates the workspace org from the first user and adopts org-less products; signup auto-joins new users as editors.
- Mirrored work items (`source ≠ native`): mirrored fields (title/description/status/tags) are rejected by the mutation layer — only native annotations (asset, area, severity) are locally editable.

**Mutation ownership checks:**
- `updateProduct` / `deleteProduct`: requires `creatorId = userId`
- `deleteCodePlan`: requires `creatorId = userId`
- `updateAsset` / `deleteAsset` / `updateCodePlan` / `updateTask` / `createTask`: **no ownership check** — any authenticated user can mutate

**Team members:** Only members with `joinedAt IS NOT NULL` are treated as active. Pending invites are invisible in the team list and memberCount.

---

### Query API

| Function | Returns | Key behavior |
|---|---|---|
| `getDashboardStats(userId, productId?)` | `DashboardStats` | Org-aware product scope, optionally narrowed to one product; velocity = tasksThisWeek (rolling 7 days, done status) |
| `getProducts(userId, productId?)` | `Product[]` | Org-aware, optionally narrowed; includes `assetCount` + `activePlanCount` via correlated subqueries |
| `getProduct(slug, userId)` | `Product & { assets }` \| `null` | Org-aware; assets ordered by createdAt desc; `dependencies` always `[]` |
| `getCodePlans(userId, filters?)` | `CodePlan[]` | Org-aware; filters: `productId`, `status`, `type`; includes `taskCount`, `completedTaskCount`, `progress`, `productName` |
| `getCodePlan(id, userId)` | `CodePlanDetail` \| `null` | Org-scope guarded; includes full `tasks[]`, `assignees[]`, `targetAssets[]`, `planAssets[]` (per-asset branch/PR); `progress` = % done |
| `getTasks(userId, filters?)` | `TaskWithContext[]` | Org-aware; filters: `planId`, `assigneeId`, `status`; includes `planTitle`, `assetName`, `assigneeName` |
| `getWorkItems(userId, filters?)` | `WorkItemWithContext[]` | Org-aware; filters: `productId`, `assetId`, `type`, `status`, `planId`; includes product/asset names + `linkedPlans[]` |
| `getWorkItem(id, userId)` | `WorkItemWithContext` \| `null` | Org-scope guarded |
| `getAssetOptions(userId)` | `{id,name,productId}[]` | Flat asset list across accessible products (dropdowns) |
| `getProductDependencyEdges(productId)` | `DependencyEdge[]` | All edges whose source asset is in the product |
| `getImpactedAssets(planId)` | `ImpactedAsset[]` | Dependents of the plan's target assets, excluding targets |
| `getAnalytics(userId, productId?)` | `AnalyticsData` | Velocity by week, tasks by plan type, effort by month, debt by product, cycle time, estimation accuracy, computed insights |
| `getActivityFeed(userId, limit?)` | `ActivityItem[]` | sync_log rows for the user's orgs mapped to feed entries |
| `getIntegrations(orgId)` | `IntegrationSummary[]` | Connections + mirrored-item counts |
| `getOrganization(id)` | `Organization & { memberCount }` \| `null` | memberCount = joined members only |
| `getTeamMembers(orgId)` | `TeamMember[]` | Joined members only; includes nested `user` object |
| `getAssetDetail(id, userId)` | `AssetDetail` \| `null` | Org-scope guarded; owners, derived debt score, plans with per-asset PR context, dependency edges both directions |
| `getAssetHistory(assetId, userId)` | `AssetHistoryEntry[]` \| `null` | Org-scope guarded; composed timeline: release stamps (shipped only), completed plans, resolved items, debt movement, design notes; plan completion time prefers sync_log event |
| `getReleases(userId, filters?)` | `ReleaseListRow[]` | Org-aware; filters: `productId`, `status`; asset/version chips + plan counts + deduped derived work-item counts |
| `getRelease(id, userId)` | `ReleaseDetail` \| `null` | Org-scope guarded; assets & versions, attached plans with progress, derived work items, per-asset PR chips |
| `getSuggestedReleaseAssets(releaseId)` | `ReleaseAssetChip[]` | Assets targeted by attached plans but not yet stamped on the release |
| `getAssetRecord(assetId, userId)` | `AssetRecord` \| `null` | Org-scope guarded; capabilities (incl. tombstones), derived known issues (open bug/ux) & debt register (open tech_debt), graduation candidates (resolved feature/enhancement not yet graduated) |

---

### Mutation API

| Function | Auth check | Notes |
|---|---|---|
| `createProduct(data, userId)` | none | Returns full product row |
| `updateProduct(id, data, userId)` | creatorId = userId | Returns null if not found/unauthorized |
| `deleteProduct(id, userId)` | creatorId = userId | Returns `{ id }` or null |
| `createAsset(data)` | none | Default health=healthy, status=active |
| `updateAsset(id, data)` | none | Bumps `updatedAt` |
| `deleteAsset(id)` | none | Returns `{ id }` or null |
| `createCodePlan(data, userId)` | none | Forces `status='draft'` |
| `updateCodePlan(id, data)` | none | Bumps `updatedAt` |
| `deleteCodePlan(id, userId)` | creatorId = userId | Returns `{ id }` or null |
| `createTask(data)` | none | Default status=not_started |
| `updateTask(id, data)` | none | Bumps `updatedAt` |
| `updateTaskStatus(id, status)` | none | Narrow update, bumps `updatedAt` |
| `deleteTask(id)` | none | Returns `{ id }` or null |
| `createRelease(data, userId)` | none | Forces `status='planned'` |
| `updateRelease(id, data)` | none | Status → `shipped` sets `shippedAt`; any other status clears it |
| `deleteRelease(id)` | none | Plans are detached (FK set null), never deleted |
| `attachPlanToRelease` / `detachPlanFromRelease` | none | Sets/clears `code_plans.releaseId` |
| `setReleaseAsset(releaseId, assetId, data?)` | none | Upserts the per-asset version stamp |
| `removeReleaseAsset(releaseId, assetId)` | none | Returns `{ id }` or null |
| `createDesignNote(data)` / `updateDesignNote` / `deleteDesignNote` | none | `authorKind` defaults `user`; MCP sets `agent` |
| `graduateWorkItem(workItemId)` | none | Validates resolved + feature/enhancement + has asset; idempotent per work item; composes `originSummary` from item → first linked plan → that plan's release stamp |
| `updateCapability(id, data)` | none | Edits title/description/area; lineage untouched |
| `removeCapability(id, reason?)` | none | Tombstone: `status='removed'` + `removedAt`; reason appended to description as `**Removed:**` |

---

### Views / Routes

#### Auth Routes (`/(auth)`)
Centered layout with no sidebar.

| Route | Status | Notes |
|---|---|---|
| `/login` | Wired | Email+password form → `signIn` server action |
| `/signup` | Wired | Email+password+name → `signUp` server action |

Both redirect to `/` on success.

---

#### Dashboard Layout (`/(dashboard)`)
All routes share `AppShell`: 64px top header + 256px sidebar. Sidebar contains:
- Product switcher dropdown — **wired**: "All Products" + per-product options; selection persisted in a cookie (`lib/product-scope-cookie.ts`) and scopes Dashboard, Products, Code Plans, Tasks, and Analytics
- Primary nav: Dashboard, My Work, Products, Work Items, Code Plans, Tasks, Analytics
- Secondary nav: Team, Integrations, Billing (hidden if `BILLING_ENABLED=false`), Settings
- Org/user footer: org name + billing tier, links to Team/Billing/Settings

**Header:** Global search input (cosmetic — not wired), bell icon (cosmetic), user avatar dropdown with sign out.

---

#### `/` — Dashboard
| Component | Data source | Status |
|---|---|---|
| Greeting (time-based) | user profile | Wired |
| `StatCards` (4 cards) | `getDashboardStats` | Wired — real data |
| `VelocityChart` | `getAnalytics` | Wired — tasks completed vs created per week (8 weeks) |
| `PlansOverview` | `getCodePlans` | Wired — renders plan list |
| `ActivityFeed` | `getActivityFeed` | Wired — renders sync_log events (native mutations + sync runs) |

---

#### `/my-work` — My Work
Personal execution view (the Tasks page remains the comprehensive review surface): open tasks assigned to me sorted by end date (overdue in red), plans I own with progress bars, and open work items I own — all respecting the product scope switcher.

#### `/products` — Products List
- Grid of product cards with name, description (truncated), tags (max 3 shown), asset count, active plan count
- "New Product" button and "Add Product" card open the quick-create modal (`ProductCreateDialog`, also reachable from the sidebar switcher) → `createProductAction`
- Card dropdown: View Details, Edit Product (edit side panel → `updateProductAction`), Delete (confirm → `deleteProductAction`)

---

#### `/products/[slug]` — Product Detail
Two tabs: **Assets** and **Code Plans**.

**Assets tab** (`assets-section.tsx`):
- Assets grouped by type (app, service, library, datastore, platform)
- Each card shows: name, type label, health status with color-coded icon, description, tags, tech debt score bar (if present)
- Asset card click → **auto-save editor panel** (all fields incl. health + tech debt score; selects commit on change, inputs on blur) → `updateAssetAction`; delete with confirm → `deleteAssetAction`
- "Add Asset" button → create side panel → `createAssetAction`
- "Settings" button → product edit side panel (`product-edit-panel.tsx`)

**Plans tab:**
- Lists plans for this product: title (link to plan detail), description, status badge, task progress
- "Create Plan" button → plan create side panel (product preselected) → `createCodePlanAction`

**Dependencies tab** (`dependencies-section.tsx`):
- Add-edge form (source, type, target, description) → `addAssetDependencyAction`
- Adjacency view grouped by source asset with per-edge remove

---

#### `/assets/[id]` — Asset Detail (v0.3.25)
Header (type/health badges, current version chip from latest shipped release, repo/docs links, owners), summary cards (tech debt score with derived-vs-manual note, open work items, plan count), auto-save description + notes (ideation doc) cards, and tabs:
- **Work Items / Tech Debt / Code Plans / Dependencies** — the asset's slices of the existing views (plans with per-asset branch/PR chips)
- **History** (v0.4.0–v0.4.2) — reverse-chronological timeline projected from existing rows: shipped releases as version tick marks (with a sticky version ladder), completed plans, resolved work items, debt movement, and design-log entries (expandable markdown, agent badge for MCP-authored notes, "via plan" anchor chips). Filter chips per entry kind. "Add design note" side panel with optional release/plan anchors and (flagged) AI draft-from-plan.
- **Record** (v0.4.4) — the asset's current-state register: a candidates banner ("N resolved features can join this asset's record" with one-click graduation), capabilities list (lineage chip from `originSummary`, verification freshness dot, expandable markdown, edit dialog, remove-with-reason dialog), derived **Known issues** (open bug/ux) and **Debt register** (open tech_debt) cards, and a struck-through **Previously** card for tombstoned capabilities.

#### `/releases` & `/releases/[id]` — Releases (v0.4.1)
List: status tabs (All / In Progress / Shipped), rows with asset+version chips, plan counts, derived work-item type dots; create side panel. Detail mirrors plan-detail layout:
- **Assets & Versions** — one row per `release_assets` entry with inline version/note editing, per-asset PR chips rolled up from attached plans, and a suggestion banner for plan-targeted assets missing from the release
- **Plans** — attach/detach (a "ships in" picker also exists on plan detail); **Work Items** — derived through attached plans, grouped Features / Bugs & UX / Tech Debt (the release-notes structure)
- **Mark Shipped** confirm lists unversioned assets; shipped/abandoned releases render read-only. "Draft release notes" (flagged AI) opens an editable dialog; saving writes the description explicitly.

#### `/plans` — Code Plans List
Client component (`PlansClient`) with:
- Summary stats: Active / Draft / Completed counts
- Tab filter: All / Active / Draft / Completed (client-side)
- Product dropdown filter (client-side)
- Plan cards: title (link to detail), type badge, status badge, product name, deadline, assignee count, progress bar, tags
- "New Plan" button → plan create side panel (`plan-create-panel.tsx`; preselects the scoped product) → `createCodePlanAction`

---

#### `/plans/[id]` — Plan Detail
- Breadcrumb: Code Plans → plan title
- Header: title, type badge, status badge, description, product link, date range, deadline
- Action buttons (`plan-actions.tsx`): Edit (side panel → `updateCodePlanAction`), "Activate Plan" (draft only → `activatePlanAction`), "Mark Complete" (active only → `completePlanAction`), Delete → `deleteCodePlanAction`
- **Link Milestone** (`plan-sync-dialog.tsx`): binds the plan to a GitHub milestone via an org connection; milestone issues mirror as read-only plan tasks (mixed with native tasks); Unlink converts mirrored tasks to native. Sync also refreshes `code_plan_assets.prStatus` for PR URLs in the connection's repo
- Stats row: Overall Progress (% + progress bar + task count), Target Assets (count + names), Assignees (avatars)
- Tags row
- **Target Assets & PRs** (`plan-assets-section.tsx`): per-asset rows with branch, PR link, PR status badge; inline edit form; add/remove target assets → plan-asset actions
- **Impact Analysis**: assets depending on the plan's targets (via `asset_dependencies`), with dependency path and health badges
- **Linked Work Items**: items linked via `work_item_code_plans` with type/status badges
- Tasks section (`plan-tasks-section.tsx`): **list view by default** (paginated, 25/page) with a board toggle; quick-add row (title + Enter); selection checkboxes with a bulk bar (status/priority/assignee/**move to another plan**); wrapped titles with in-progress % shown; board = 3-column kanban by status
  - Done column capped at 5 shown (board view)
  - "Add Task" button → task create form → `createTaskAction`
  - Task cards: title (strikethrough if done), priority badge, effort hours

---

#### `/tasks` — Tasks
Client component (`TasksClient`) with:
- Summary stats: Total / Not Started / In Progress / Done
- Tab filter by status, plan dropdown filter (active plans only)
- View toggle: List view / Board view

**List view:** Table with wrapped task titles (+tags), code plan link, asset name, in-row priority + assignee dropdowns, effort, status. Paginated (25/page; resets on filter change). Review surface only — quick-add, selection, and bulk actions live on the plan-detail task list.

**Board view:** 3 kanban columns (up to 8 per column); task cards with priority badge, plan title, assignee avatar, effort.

**Task panel** (`task-panel.tsx`, Sheet-based, deep-linkable via `?task=<id>`):
- **Auto-save editor** (no view/edit split): status/priority/assignee selects commit on change, text/effort fields on blur, toast confirm → `updateTaskAction`; delete → `deleteTaskAction`; mirrored tasks disable tracker-owned fields
- "New Task" button opens the panel in create mode → `createTaskAction`
- List rows edit inline: status checkbox cycle, priority + assignee dropdowns in-row

---

#### `/work-items` — Work Items
Client component (`WorkItemsClient`) with:
- Stats: Open Items / In Progress / Resolved / Open Tech Debt
- Status tabs (All/Open/Planned/In Progress/Resolved), type filter dropdown, view toggle: **List** / **Debt Register**
- List: table with title (+ mirrored-source icon), type/severity badges, asset + area, linked plan links, status badge — paginated (25/page; resets on filter change)
- Debt Register: open `tech_debt` items grouped by asset with critical/high rollups
- Deep-linkable panel (`?item=<id>`): **auto-save editor** (selects commit on change, inputs on blur, toast confirm) — no view/edit mode split; link/unlink to plans; mirrored items disable tracker-owned fields (mutations also reject mirrored-field writes)

#### `/integrations` — Integrations
Client component (`IntegrationsClient`) with:
- Connection cards: provider icon, name, repo, mirrored count, last sync, status badge, surfaced `lastError`
- "Sync now" → `syncIntegrationAction` (runs the pull-only sync engine; shows created/updated/unchanged)
- "New Connection" dialog: provider select (GitHub / GitLab / Jira / Asana / Linear), name, provider scope (repo, project path, Jira project key + site URL, Asana project GID, Linear team key), target product, and the credential — paste a token (stored encrypted) or name a server env var → `createIntegrationAction`. Cards show credential status (token stored / env ✓ / env missing ⚠) and an edit dialog (rename, re-scope, re-target, replace token — blank keeps current)
- Delete with confirm (mirrored items are kept, stop syncing)

#### `/api/mcp/[transport]` — MCP server (no UI)
Streamable HTTP MCP endpoint (`mcp-handler`) with 41 tools wrapping the query/mutation layer (task assignees resolved by workspace-member email) — reads, plus management of products/assets/dependencies, plan lifecycle (activate/complete incl. write-back), plan targets, work items, tasks, releases (create/update/attach/version-stamp/ship — shipped releases reject mutation), `get_asset_history`, `record_design_note` (agent-attributed design-log entries), `get_asset_record`, and `graduate_work_item`; record deletes are deliberately excluded (link removals only) — see `docs/specs/mcp-server-spec.md`. Auth: `Authorization: Bearer cpk_…` resolved by `lib/mcp/auth.ts` to a user (scopes: read/write); 401 without a valid key. `proxy.ts` exempts this path from session redirects. Connect: `claude mcp add --transport http codeplans <base>/api/mcp/mcp --header "Authorization: Bearer <key>"`.

#### `/team` — Team Management
- Requires org membership; shows message if no org
- `TeamClient` renders:
  - Org info card: name, member count, billing tier, admins count, pending invites
  - Members table: avatar, name, email, role badge (with crown for owner), joined date, kebab menu per row
  - Kebab menu options: "Change Role" → `changeMemberRoleAction`, "Remove from Team" → `removeMemberAction`
- "Invite Member" button opens dialog with email + role select → `inviteMemberAction`

---

#### `/analytics` — Analytics
All charts are wired to `getAnalytics` (live data). Charts (Recharts):
- Team Velocity: area chart, tasks completed vs created per week (8 weeks)
- Tasks by Type: donut by parent plan type
- Effort Estimation Accuracy: estimated vs actual hours by month (done tasks, 6 months)
- Tech Debt by Product: average effective (manual ?? derived) asset scores
- Insights panel: computed observations (worst-debt asset, velocity trend, overdue active plans)
- Metric cards: velocity, completion rate, avg cycle time, estimation accuracy (within 20% variance)

---

#### `/settings` — Settings
Client component with 4 tabs:
- **Profile:** Name update → `updateProfileAction`; email change with verification flow → `requestEmailChangeAction` / `cancelEmailChangeAction`; photo upload button (not wired); org info card with billing tier
- **Notifications:** Email and in-app notification toggles (cosmetic — not persisted)
- **Features:** Feature flag toggles for AI Assistance / Beta / Alpha (reads from props but writes not wired)
- **Security:** Password change form → `changePasswordAction`; 2FA setup and Delete Account button (not wired)
- **API Keys** (`api-keys-panel.tsx`): create (name + read/write scope; plaintext shown once), list (prefix, scope, last-used), revoke → API key actions

---

#### `/billing` — Billing
Guarded by `BILLING_ENABLED` env flag (redirects to `/` if false). Shows:
- Current plan card with usage progress bars (hardcoded usage values)
- 4-column plan comparison grid (Free $0 / Pro $29 / Team $79 / Enterprise custom)
- Invoice history (3 hardcoded invoices)

**Wiring gap:** No actual Stripe/payment integration; all usage data is hardcoded.

---

### Infrastructure / Config

**Auth providers** (pluggable via `AUTH_PROVIDER` env):
- `local`: bcrypt password hash stored in DB, JWT session cookie, `adminCreateUser` for seeding
- `supabase`: delegates to Supabase client, session via cookies

**DB providers** (pluggable via `DB_PROVIDER` env):
- `sqlite`: `@libsql/client` + `drizzle-orm/libsql`, local file or `:memory:` (tests)
- `postgres`: `postgres` (postgres.js) + `drizzle-orm/postgres-js`

**Feature flags:**
- `BILLING_ENABLED=false` hides billing nav, billing page, and billing info throughout the shell
- **AI drafting** (`lib/ai.ts`, official Anthropic SDK): enabled only when `ANTHROPIC_API_KEY` is set and `AI_ENABLED` isn't `false`; model via `AI_MODEL` (default `claude-opus-5`). Powers "Draft release notes" and "Draft design note from plan" — drafts always land in an editor, never auto-published; refusals/empty outputs surface as errors

---

### Known Gaps & Unwired Features

Structural/roadmap gaps (work items, integrations, repo/PR layer, org cleanup) are
tracked in `docs/specs/design-spec-v3.md`; the list below covers implementation gaps
in the current feature set.

| Area | Gap |
|---|---|
| Billing | Hardcoded usage data; no payment integration |
| Analytics | No time-range filtering (fixed windows: 8 weeks / 6 months) |
| Search | Header search input is cosmetic only |
| Settings | Notifications + feature-flag toggles not persisted; photo upload, 2FA, Delete Account not wired |
| Integrations | GitHub + GitLab Issues; sync is manual ("Sync now") — no scheduler/webhooks; assignee mapping not implemented (provider login stored in externalData). Write-back is completion comments only |
| Scheduled sync | Sync remains manual ("Sync now" / link-time); no scheduler or webhooks |
| Notifications | All toggles cosmetic; no notification system exists |
