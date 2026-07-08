# CodePlans v3 — Target Design & Roadmap

> **Status: Canonical spec — Phases 1 through 4 shipped** (2026-07, v0.5.0).
> Describes the target data model, integration architecture, and the phased
> roadmap. Phases 1, 1.5, 2, 3, and 4 are implemented; Phases 5–6 remain.
> Supersedes `functional-spec-v2.md` and `data-model-enhancement-plan.md`.
> The current implemented state is documented in `docs/app-spec.md`.

---

## 1. Purpose & Positioning

CodePlans is a **code change coordination tool**. It sits between the issue tracker and
the architecture diagram:

- **Product management tools** (Jira, Asana, Linear) own *what and when* — prioritization,
  sprints, stakeholder communication.
- **CodePlans** owns *where in the system and how it gets built* — assets, cross-asset
  code plans, PR-level change coordination, and technical debt.
- **Code hosts** (GitHub/GitLab) own the code itself — repos, branches, PRs.

A **code plan** models the unit of engineering change delivery: one PR, or a set of
related PRs across repos/assets when a change is cross-cutting (the typical case in
enterprise systems).

CodePlans must also work **standalone as a lightweight planning tool** for small teams
that don't run a separate PM system. This is not a second mode — it falls out of the
provenance design (§4.1).

### Litmus test

The design target is a sophisticated SaaS/AI company with:

- A monorepo containing multiple apps and shared libraries
- Separate repos for cloud APIs and services
- Cloud datastores (MongoDB, Postgres) and multiple ORMs (Drizzle, Mongoose)
- A product backlog (features) and an issue stream (bugs, enhancements, UX issues)
  living in an external PM tool
- Technical debt accumulating in identifiable areas of specific assets

The team must be able to: map features/backlog and issues to code plans; plan a
cross-repo change as one plan with per-asset PRs; and keep a live register of tech debt
by asset and area.

---

## 2. Gap Analysis (v0.1.5 → target)

| # | Gap | Consequence today |
|---|---|---|
| 1 | No backlog/issue entity upstream of code plans | Feature→plan and issue→plan mapping cannot be recorded; no link point for external trackers |
| 2 | Tech debt is a single `techDebtScore` integer per asset | Cannot record *what* the debt is, *where* within an asset, or whether a plan addresses it |
| 3 | No repo/PR layer | `repositoryUrl` only; no monorepo paths, no branch/PR links on plans or tasks — the "plan = set of PRs" concept has no home |
| 4 | `targetAssetIds` / `assigneeIds` are bare uuid arrays | No referential integrity; "all plans touching asset X" (the core query) is awkward in PG and worse in SQLite |
| 5 | Assets locked to one product (`productId` FK, cascade delete) | Shared libraries/platform services serving multiple products force duplication or a fake "Platform" product |
| 6 | `asset_dependencies` table unused | No impact analysis ("this plan touches the auth library; six services depend on it") |
| 7 | Multi-tenant org model entangled with OSS single-team use | `users.organizationId` (single org per user), nullable `products.organizationId`, creator-OR-org visibility |
| 8 | No external integration surface | No provenance, no connector layer, no sync engine |

---

## 3. Target Conceptual Model

```
Organization
└── Product ──────────────┐ (product_assets, many-to-many in later phase)
    │                     │
    ├── Work Items        Assets ──── asset_dependencies (impact analysis)
    │   (demand side:       │  └── repository / repoPath (monorepo-aware)
    │    features, bugs,    │
    │    UX, tech debt)     │
    │        │ many-to-many │
    │        ▼              │
    ├── Code Plans ◄────────┘ (code_plan_assets: per-asset branch + PR)
    │        │
    │        └── Tasks (execution side; optional per-asset scope)
    │
    └── Integrations (connections to Jira/Asana/Linear/GitHub…)
         └── sync_log (item-level change events → activity feed)
```

- **Work Items** are the *demand* side: features, bugs, enhancements, UX issues, and
  tech debt items. Natively lightweight, or mirrored from a PM tool.
- **Code Plans** remain the center of the product: the coordination container that only
  CodePlans has. Work items link to plans many-to-many (one feature → several plans,
  one per repo; one refactor plan → several issues resolved).
- **Tasks** are the *execution* side: natively lightweight, or mirrored from a project
  management tool.
- **Tech debt** is not a separate subsystem: a debt item is a work item of type
  `tech_debt` with an asset and optional area/path, resolvable by a code plan. The
  asset's `techDebtScore` becomes derivable from open debt items (manual override kept).

---

## 4. Design Principles

### 4.1 Provenance, not integration

Every syncable entity (`work_items`, `tasks`, `code_plans`) is **native by default**
with an optional external origin:

| Field | Type | Notes |
|---|---|---|
| source | `native \| jira \| asana \| linear \| github \| ...` | default `native` |
| connectionId | uuid? | FK → integrations |
| externalId | text? | provider's stable ID |
| externalKey | text? | human-readable key (e.g. `PROJ-123`) |
| externalUrl | text? | deep link |
| externalData | jsonb | unmapped provider fields (raw status, etc.) |
| syncedAt | timestamp? | last successful sync |

Unique constraint on `(connection_id, external_id)` — sync upserts are idempotent.

A native item (`source = 'native'`) has full CRUD — this **is** the lightweight-PM mode
for small teams. Same tables, same views; the only behavioral difference anywhere in
the app is whether a row is editable here or in the external tool.

### 4.2 Field ownership rule

For mirrored items (`source ≠ native`):

- **Mirrored fields** — title, description, status, priority, assignee, labels — the
  external system is the system of record. Read-only in CodePlans UI (provenance badge +
  link out). Sync overwrites them freely; no conflict resolution exists because none is
  needed.
- **Native annotation fields** — asset mapping, area/path, code plan links, tech-debt
  classification, actual effort — CodePlans always owns; sync never touches them.
  These are the engineering-mapping value-add the PM tool knows nothing about.

### 4.3 Status mapping layer

Internal status enums stay small and canonical. Each connection carries a
per-connection mapping (`external status → canonical status`) in its config; the raw
external status string is preserved in `externalData` for display. External workflow
states never leak into schema enums.

### 4.4 Join tables over arrays

`code_plans.targetAssetIds` and `code_plans.assigneeIds` are replaced by join tables
(§5.3, §5.4). This restores referential integrity, makes "all plans touching asset X"
a plain indexed join on both PG and SQLite, and — critically — gives per-asset plan
rows a home for `branch`/`prUrl`/`prStatus`, directly modeling "cross-asset plan = set
of related PRs."

### 4.5 One schema for OSS and hosted

No schema fork. OSS/single-team mode auto-creates a **default organization** on first
run and hides team-management, invitation, and billing UI behind feature flags
(pattern already established by `BILLING_ENABLED`). Hosted mode enables them.
`users.organizationId` is retired as the membership source of truth — membership lives
only in `organization_members` (allows multi-org users in hosted mode). Org-level
roles are the default access model; product-level membership is deferred as a possible
hosted-tier feature (the `product_members` proposal from the v2-era enhancement plan
is **not** adopted now).

### 4.6 Scope fence — what CodePlans refuses to become

**No**: sprints/iterations, story points, backlog ranking/ordering ceremony, roadmap
timelines, custom-fields engine, per-item comment threads (link out for discussion).
`tags` + `metadata`/`externalData` jsonb absorb "just one more field" pressure.

**Yes**: type/status/priority/assignee on work items, simple list and board views, one
optional `parentId` on work items for feature → sub-item grouping. That is the ceiling.

Heuristic: prioritization or stakeholder ceremony → belongs to the connector (link
out). Where in the system and how it gets built → belongs in CodePlans.

---

## 5. Target Schema (deltas from v0.1.5)

Types shown PG-style; SQLite variants follow existing `schema.sqlite.ts` conventions
(text IDs, JSON-as-text arrays).

### 5.1 `work_items` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| productId | uuid | FK → products (cascade) |
| assetId | uuid? | FK → assets (set null) — primary asset for bugs/debt |
| area | text? | free-text locus within the asset (module, path, domain) |
| parentId | uuid? | FK → work_items — one level of feature → sub-item grouping |
| type | `feature \| bug \| enhancement \| ux \| tech_debt` | |
| title / description | text | mirrored fields when external |
| status | `open \| planned \| in_progress \| resolved \| wont_do` | canonical; external states map onto this |
| severity | `low \| medium \| high \| critical` | doubles as debt severity |
| tags | text[] | |
| reporterId | uuid? | FK → users |
| *provenance columns* | | §4.1 |
| createdAt / updatedAt | timestamp | |

The **tech debt register** is `work_items WHERE type = 'tech_debt'`, grouped by
asset/area. `assets.techDebtScore` becomes derived from open debt items (weighted by
severity), with the existing manual value kept as an override.

### 5.2 `work_item_code_plans` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| workItemId | uuid | FK → work_items (cascade) |
| codePlanId | uuid | FK → code_plans (cascade) |
| createdAt | timestamp | |

Unique `(workItemId, codePlanId)`. Resolving a plan can prompt resolving linked items
(never automatic for mirrored items — write-back is an explicit action, §6).

### 5.3 `code_plan_assets` (new — replaces `code_plans.targetAssetIds`)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| codePlanId | uuid | FK → code_plans (cascade) |
| assetId | uuid | FK → assets (cascade) |
| branch | text? | working branch for this asset's change |
| prUrl | text? | the PR delivering this asset's slice of the plan |
| prStatus | `none \| draft \| open \| merged \| closed`? | manual now; connector-updated later |
| notes | text? | |
| createdAt / updatedAt | timestamp | |

Unique `(codePlanId, assetId)`. This is the table that makes "a code plan = a set of
related PRs" literal.

### 5.4 `code_plan_assignees` (new — replaces `code_plans.assigneeIds`)

| Field | Type | Notes |
|---|---|---|
| codePlanId | uuid | FK → code_plans (cascade) |
| userId | uuid | FK → users (cascade) |
| createdAt | timestamp | |

PK `(codePlanId, userId)`.

### 5.5 Repo awareness on `assets` (columns first; `repositories` table later)

Phase 1 (cheap, unblocks monorepo):

| Field | Type | Notes |
|---|---|---|
| repositoryUrl | text? | *(exists)* |
| repoPath | text? | **new** — path within the repo (e.g. `apps/web`, `packages/ui`) |

Later phase (when GitHub integration lands): a `repositories` table
(`id, organizationId, provider, url, defaultBranch, externalId`) with
`assets.repositoryId + repoPath` replacing the raw URL. Deferred until a connector
gives it a payoff.

### 5.6 Provenance columns on `work_items`, `tasks`, `code_plans`

As §4.1. On `code_plans`, provenance means "this plan is backed by an external
epic/project," enabling mirrored-task plans (§7 tier 2/3).

### 5.7 `integrations` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organizationId | uuid | FK → organizations (cascade) |
| provider | `jira \| asana \| linear \| github \| ...` | |
| name | text | display label |
| authRef | text? | reference to credential (env var name / secret id — never the secret itself) |
| config | jsonb | scope (project/JQL filter), status map, user-mapping overrides, target productId |
| status | `active \| paused \| error` | |
| lastSyncAt / lastError | timestamp? / text? | |
| createdAt / updatedAt | timestamp | |

Each connection maps a **bounded external scope → one CodePlans product**. Never
mirror a whole instance.

### 5.8 `sync_log` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| organizationId | uuid | FK → organizations |
| connectionId | uuid? | FK → integrations — null for native events |
| entityType | `work_item \| task \| code_plan \| asset \| product` | |
| entityId | uuid | |
| event | `created \| updated \| linked \| status_changed \| external_deleted \| ...` | |
| actorId | uuid? | FK → users — null when a connection is the actor |
| payload | jsonb | change summary |
| createdAt | timestamp | |

Serves double duty: sync audit trail **and** the event stream behind the (currently
empty) Activity Feed. Native mutations write to it too.

### 5.9 Organization cleanup

- Bootstrap: on first run with zero orgs, create a default org; all users auto-join.
- Membership source of truth: `organization_members` only. `users.organizationId`
  demoted to a "current org" pointer (hosted multi-org), then dropped from access checks.
- Product visibility simplifies to: member of the product's org (creator-only fallback
  removed once backfill assigns every product an org).
- OSS mode: `TEAMS_ENABLED=false` hides team/invite UI; org becomes invisible plumbing.

### 5.10 Soft external deletes

When a mirrored item disappears upstream, set `externalDeleted = true` (or a status)
— never cascade. Plans and debt classifications hanging off it must survive.

---

## 6. Connector Architecture

Follows the existing provider pattern (`AUTH_PROVIDER`, `DB_PROVIDER`): a small
interface, provider implementations behind it, generic engine on top.

```ts
interface Connector {
  provider: string
  // discovery
  listScopes(auth): ExternalScope[]            // projects / boards the connection can bind to
  statusVocabulary(scope): ExternalStatus[]    // feeds the per-connection status map UI
  // sync (phase 1: pull only)
  listItems(scope, since?): ExternalItem[]     // cursor/incremental
  getItem(scope, externalId): ExternalItem
  // write-back (later phase; narrow actions, never field sync)
  postLink?(externalId, url, text): void       // e.g. comment the code plan link
  transition?(externalId, canonicalStatus): void
}
```

**Sync engine** (provider-agnostic): incremental pull per connection → map fields +
status via connection config → upsert by `(connectionId, externalId)` → mirrored
fields overwritten, native annotation fields untouched → deletes handled softly →
every change appended to `sync_log`. Assignees matched by email where a CodePlans user
exists, else stored as `externalAssignee` display text (sync must never require every
external user to have an account).

**Phasing rule**: one-way pull + manual "import" / "link existing item" actions ship
first. Write-back is a later, separate phase and consists only of explicit narrow
actions (post a link, transition a status) — never bidirectional field sync.

---

## 7. Task-System Tiers

One schema, three usage tiers:

1. **Native-only** (small teams): tasks created and worked entirely in CodePlans —
   the current lightweight system, unchanged.
2. **Linked plan**: a code plan is linked (via its provenance columns) to an external
   epic/project; its tasks mirror the epic's children. Progress roll-up works
   unchanged because mirrored tasks are ordinary `tasks` rows; the kanban renders them
   read-only with link-outs.
3. **Mixed**: a plan holds mirrored tasks *plus* native ones (engineering adds "update
   the Drizzle migration" locally without polluting the PM tool). PM's tool stays
   untouched; engineering sees the full picture. This is the expected steady state for
   mid-size teams.

---

## 8. UI Implications (summary)

- **Work Items page** (new top-level nav): list/board by type & status; product- and
  asset-scoped filters; provenance badges + link-outs; "create plan from item" and
  "link to plan" actions.
- **Tech Debt view**: work items of type `tech_debt` grouped by asset/area with
  severity rollups; asset detail shows its debt register; `techDebtScore` bar becomes
  derived-with-override.
- **Plan detail**: target assets become rows with branch/PR chips (from
  `code_plan_assets`); linked work items section; impact panel once dependencies are
  wired ("assets depending on this plan's targets").
- **Provenance treatment** (global): mirrored items get a source badge, read-only
  mirrored fields, and a deep link; native items are fully editable. No other UI
  divergence.
- **Activity feed**: renders `sync_log`.

---

## 9. Access Control

- Queries move from creator-OR-org checks to org-membership checks as §5.9 lands.
- Role gates (existing enum): `viewer` read-only; `editor` CRUD on work items, plans,
  tasks, assets; `admin/owner` additionally manage integrations, team, product deletes.
- Mutations currently lacking ownership checks (`updateAsset`, `updateCodePlan`,
  `createTask`, …) adopt org-membership + role checks in the same phase.
- Mirrored-field immutability is enforced in the mutation layer (reject writes to
  mirrored fields when `source ≠ native`), not just hidden in the UI.

---

## 10. Roadmap

Phases are sequential but 1.5 (org cleanup) can slot anywhere after Phase 1.
Each phase ships migrations for **both** PG and SQLite, seed updates, and tests.

### Phase 1 — Schema foundations (v0.2) ✅ SHIPPED
1. `work_items` + `work_item_code_plans` (with provenance columns from day one —
   retrofitting provenance is far more expensive than shipping unused columns).
2. `code_plan_assets` + `code_plan_assignees`; backfill from `targetAssetIds` /
   `assigneeIds`; queries/mutations move to the join tables; array columns kept one
   release for rollback, then dropped.
3. `assets.repoPath`; provenance columns on `tasks` and `code_plans`; `sync_log` table.
4. `getCodePlan` gains the org-scope guard (closes the known auth gap).

*Exit criteria*: cross-asset plan queries run on joins; work items creatable via API
(no UI yet); all existing UI works unchanged.

### Phase 1.5 — Org cleanup for OSS (v0.2.x) ✅ SHIPPED
Default-org bootstrap; membership via `organization_members` only; product visibility
= org membership; `TEAMS_ENABLED` flag; backfill org onto org-less products.

### Phase 2 — Work items & debt UI (v0.3) ✅ SHIPPED
Work Items nav page (list/board, filters); create/link-to-plan flows; tech debt
register view + derived `techDebtScore`; plan detail shows linked items and per-asset
branch/PR fields (manually entered); `sync_log` writes on native mutations → Activity
Feed goes live.

### Phase 3 — Dependency graph & impact analysis (v0.4) ✅ SHIPPED
CRUD + visualization for `asset_dependencies`; impact panel on plan detail; dependency
data folded into analytics (which also moves off hardcoded chart data this phase).

### Phase 4 — Integrations framework + first connector (v0.5) ✅ SHIPPED (GitHub Issues)
`integrations` table + connector interface + sync engine (pull-only); status-mapping
config UI; first connector (**GitHub Issues** recommended first: OAuth simplicity,
engineering-adjacent, doubles as groundwork for PR auto-linking; Jira second, Asana
third); import + link-existing flows; provenance badges/read-only treatment
everywhere.

### Phase 5 — Task-level sync & mixed plans (v0.6)
Plan ↔ external epic linking; mirrored tasks inside plans (tiers 2/3 of §7);
`repositories` table + PR auto-link from the GitHub connector (updates
`code_plan_assets.prStatus`).

### Phase 6 — Write-back & hosted polish (v0.7+)
Narrow write-back actions (post plan link as comment; optional status transition on
plan completion); multi-org users; billing enforcement for hosted tiers.

### Backward compatibility rules
- Additive migrations first; destructive drops (array columns, `users.organizationId`)
  trail by one release with backfill verified.
- `source = 'native'` defaults mean every existing row is valid without data changes.
- OSS installs never require an org-aware config step — bootstrap handles it.

---

## 11. Explicitly Out of Scope

- Sprint/iteration planning, story points, ranked backlogs, roadmap timelines
- Custom fields engine; per-item comment threads
- Bidirectional field-level sync with external tools
- Building a general-purpose issue tracker (work items link out for ceremony)
- CI/CD, deployments, environments modeling (revisit only if impact analysis demands it)
