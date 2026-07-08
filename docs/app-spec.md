## CodePlans App Spec

> **Status:** current implemented state as of **v0.1.5** (2026-07). For the target
> design and roadmap (work items, integrations, repo/PR layer), see
> `docs/specs/design-spec-v3.md`.

### Overview

CodePlans is a **code change coordination tool** for engineering teams. It organizes work around a three-level hierarchy: **Products → Assets → Code Plans → Tasks**. Users track technical debt, coordinate architectural changes, and measure team velocity. Deployed at `codeplans.ai`. Stack: Next.js 16 (App Router), Drizzle ORM, pluggable auth/DB (SQLite local / Supabase+Postgres cloud).

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

**Note:** This table exists in the schema but is **not yet used by any query or UI**.

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
| estimatedEffort | integer? | hours |
| actualEffort | integer? | hours |
| createdAt / updatedAt | timestamp | |

---

### Access Control Rules

**Product visibility** (used consistently across all queries):
- If the user has an `organizationId`: they see products they created **OR** products belonging to their organization.
- If no org: they only see products they created.

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
| `getCodePlan(id)` | `CodePlanDetail` \| `null` | No auth check; includes full `tasks[]`, `assignees[]`, `targetAssets[]`; `progress` = % done |
| `getTasks(userId, filters?)` | `TaskWithContext[]` | Org-aware; filters: `planId`, `assigneeId`, `status`; includes `planTitle`, `assetName`, `assigneeName` |
| `getOrganization(id)` | `Organization & { memberCount }` \| `null` | memberCount = joined members only |
| `getTeamMembers(orgId)` | `TeamMember[]` | Joined members only; includes nested `user` object |

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
- Primary nav: Dashboard, Products, Code Plans, Tasks, Analytics
- Secondary nav: Team, Billing (hidden if `BILLING_ENABLED=false`), Settings
- Org/user footer: org name + billing tier, links to Team/Billing/Settings

**Header:** Global search input (cosmetic — not wired), bell icon (cosmetic), user avatar dropdown with sign out.

---

#### `/` — Dashboard
| Component | Data source | Status |
|---|---|---|
| Greeting (time-based) | user profile | Wired |
| `StatCards` (4 cards) | `getDashboardStats` | Wired — real data |
| `VelocityChart` | none | **Stub** — hardcoded placeholder chart |
| `PlansOverview` | `getCodePlans` | Wired — renders plan list |
| `ActivityFeed` | none | **Stub** — always shows "No recent activity yet" (activities prop always `[]`) |

---

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
- Asset card click → view side panel; edit panel (all fields incl. health + tech debt score) → `updateAssetAction`; delete with confirm → `deleteAssetAction`
- "Add Asset" button → create side panel → `createAssetAction`
- "Settings" button → product edit side panel (`product-edit-panel.tsx`)

**Plans tab:**
- Lists plans for this product: title (link to plan detail), description, status badge, task progress
- "Create Plan" button → plan create side panel (product preselected) → `createCodePlanAction`

---

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
- Stats row: Overall Progress (% + progress bar + task count), Target Assets (count + names), Assignees (avatars)
- Tags row
- Tasks section: 3-column kanban by status (Not Started / In Progress / Done)
  - Done column capped at 5 shown
  - "Add Task" button → task create form → `createTaskAction`
  - Task cards: title (strikethrough if done), priority badge, effort hours

---

#### `/tasks` — Tasks
Client component (`TasksClient`) with:
- Summary stats: Total / Not Started / In Progress / Done
- Tab filter by status, plan dropdown filter (active plans only)
- View toggle: List view / Board view

**List view:** Table with columns: status checkbox (wired → `updateTaskStatusAction`), task title+tags, code plan link, asset name, priority badge, assignee avatar, effort, status.

**Board view:** 3 kanban columns (up to 8 per column); task cards with priority badge, plan title, assignee avatar, effort.

**Task panel** (`task-panel.tsx`, Sheet-based, deep-linkable via `?task=<id>`):
- View mode with full task context; edit mode with all fields incl. status, assignee, actual effort → `updateTaskAction`; delete → `deleteTaskAction`
- "New Task" button opens the panel in create mode → `createTaskAction`

---

#### `/team` — Team Management
- Requires org membership; shows message if no org
- `TeamClient` renders:
  - Org info card: name, member count, billing tier, admins count, pending invites
  - Members table: avatar, name, email, role badge (with crown for owner), joined date, kebab menu per row
  - Kebab menu options: "Change Role" → `changeMemberRoleAction`, "Remove from Team" → `removeMemberAction`
- "Invite Member" button opens dialog with email + role select → `inviteMemberAction`

---

#### `/analytics` — Analytics
All charts use **hardcoded static data** (not wired to real queries except `getDashboardStats` for the 4 metric cards at top). Charts (Recharts):
- Team Velocity: area chart (actual vs estimated, 8 weeks — fake data)
- Tasks by Type: donut chart (fake distribution)
- Effort Estimation Accuracy: grouped bar chart by month (fake data)
- Tech Debt by Product: bar-gauge list (fake data)
- AI Insights panel: 3 hardcoded recommendation cards

**Wiring gap:** All chart data is static placeholder.

---

#### `/settings` — Settings
Client component with 4 tabs:
- **Profile:** Name update → `updateProfileAction`; email change with verification flow → `requestEmailChangeAction` / `cancelEmailChangeAction`; photo upload button (not wired); org info card with billing tier
- **Notifications:** Email and in-app notification toggles (cosmetic — not persisted)
- **Features:** Feature flag toggles for AI Assistance / Beta / Alpha (reads from props but writes not wired)
- **Security:** Password change form → `changePasswordAction`; 2FA setup and Delete Account button (not wired)

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

---

### Known Gaps & Unwired Features

Structural/roadmap gaps (work items, integrations, repo/PR layer, org cleanup) are
tracked in `docs/specs/design-spec-v3.md`; the list below covers implementation gaps
in the current feature set.

| Area | Gap |
|---|---|
| Assets | `asset_dependencies` table unused — no dependency CRUD or visualization |
| Billing | Hardcoded usage data; no payment integration |
| Analytics | All charts use hardcoded data; no time-range filtering |
| Activity Feed | Always empty — no activity tracking system |
| Velocity Chart (dashboard) | Placeholder/stub |
| Search | Header search input is cosmetic only |
| Settings | Notifications + feature-flag toggles not persisted; photo upload, 2FA, Delete Account not wired |
| `getCodePlan` | No auth/ownership guard — any authenticated user can fetch any plan by ID (fix scheduled: design-spec-v3 Phase 1) |
| `asset.dependencies` | Always returns `[]` in `getProduct` — dependency resolution deferred |
| Notifications | All toggles cosmetic; no notification system exists |
