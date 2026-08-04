# Releases & Asset History — Design Spec

> **Status: PROPOSED** (2026-08). Companion to `docs/specs/design-spec-v3.md`; extends
> its data layer and access model without changing existing semantics. Targets the
> v0.4.x line. The implemented state of the app remains documented in
> `docs/app-spec.md`.

---

## 1. Purpose & Positioning

CodePlans today ends at the **code plan** — "one PR, or a set of related PRs." Two
capabilities are missing above and behind that unit:

1. **Releases** — a grouping above code plans for work that ships together: either a
   version of a single asset (*Admin App v1.2.0*) or a coordinated revision of several
   assets that work with each other (a mixed bag of features, defects, and tech debt
   delivered as one logical change to the system).
2. **Asset history** — a representation of an asset as the *evolution of the work
   delivered to it*: what changed, in which version, resolving which demand. The more
   the system is used, the more complete a picture of each asset forms.

These are one design problem in two phases: releases give asset history its structure
(version tick marks); asset history is the payoff that makes releases worth recording.

### The longer arc: system of record for what's actually there

PM and feature-management tools record *intent* — what someone planned or requested.
CodePlans sits downstream, at the point where change actually lands in assets, which
positions it to become the **system of record for an asset's delivered features,
defects, and tech debt** — a record of *reality*, continuously reconciled against the
codebase (round-trip engineering, §11). This spec builds the substrate for that:
releases give delivery a durable identity; asset history accumulates it. It does so
without overlapping PM tools — prioritization and stakeholder ceremony still live
upstream and link out (design-spec-v3 §4.6 scope fence is unchanged).

### Litmus test

A team maintains an Admin App, a shared auth library, and two services. They must be
able to:

- Cut *Admin App v1.2.0* as a release: three plans, eleven work items (5 features,
  4 bugs, 2 debt items), and see release notes derived from that — not hand-written.
- Ship a coordinated revision — auth library v3.0.0 + both services bumped to
  consume it — as **one** release recording each asset's new version.
- Open the auth library's page two years later and read its lineage: every version,
  what each delivered, which debt was paid down, and design notes recorded by the
  humans and coding agents that did the work.

---

## 2. Gap Analysis (v0.3.29 → target)

| # | Gap | Consequence today |
|---|---|---|
| 1 | No grouping above code plans | "What ships together" has no identity; release notes are assembled by hand outside the tool |
| 2 | Assets have no version concept | "v1.2.0 of the Admin App" cannot be recorded; `tags` on plans fake it without integrity or rollups |
| 3 | Asset change history is implicit | The data exists (`code_plan_assets`, `work_items.assetId`, `sync_log`) but no view composes it; an asset's past is invisible |
| 4 | Asset knowledge is a single `notes` doc | The ideation doc (v0.3.25) captures current thinking but nothing anchors knowledge to *when/why* — design rationale evaporates after plans complete |
| 5 | Delivered scope is never consolidated | Once a work item is `resolved` it leaves every view; there is no register of what an asset *now does* — the system-of-record gap (§11) |

---

## 3. Conceptual Model (additions in bold)

```
Organization
└── Product
    ├── **Releases** ─────────── **release_assets** (asset + version delivered)
    │        │ 1 ── many
    │        ▼
    ├── Code Plans ◄──────────── code_plan_assets (per-asset branch + PR)
    │        │  ▲ many-to-many
    │        │  └── Work Items (demand: features, bugs, ux, tech debt)
    │        └── Tasks
    │
    └── Assets
         ├── asset_dependencies (impact analysis)
         ├── **history (derived)**: plans delivered + items resolved + versions
         └── **asset_design_log** (curated entries, anchored to release/plan)
```

- A **release** is a *delivery grouping*: a named set of code plans that ship
  together, optionally stamping a version onto each asset it touches.
- **Work items roll up through their plans** — no direct work-item↔release link.
  One source of truth for "how demand reached delivery" (the plan link) keeps the
  model cheap and un-gameable.
- **Asset history** is primarily a *projection* of existing rows, not a new
  bookkeeping surface. Only the design log adds authored content.

---

## 4. Design Principles

### 4.1 Derive, don't duplicate

History that must be manually maintained will rot; history projected from work
already recorded cannot. The asset timeline, release work-item rollups, and release
notes are all **derived views** over `code_plan_assets`, `work_item_code_plans`,
`work_items`, and `sync_log`. The only new authored artifacts are the release row
itself, the per-asset version stamp, and design-log entries.

### 4.2 A release is a delivery grouping, not a planning ceremony

The design-spec-v3 §4.6 scope fence holds. Releases have a name, a status, and a
shipped date — **no** target dates as commitments, no timeline/Gantt view, no
ranking, no sprint semantics. If a team needs "what's slated for Q3," that's the PM
tool's job; CodePlans answers "what shipped in v1.2.0 and what is shipping next."
`plannedAt`-style fields are deliberately absent.

### 4.3 Versions belong to assets, releases record them

A version string is a fact *about an asset* ("auth-lib reached 3.0.0"), recorded *by
a release* (`release_assets.version`). One multi-asset release stamps different
version strings on different assets. Version format is free text (semver, dates,
build numbers) — CodePlans orders history by time, not by parsing versions.

### 4.4 History is append-only

Shipped releases and their `release_assets` rows are immutable in the UI (editable
only while `planned`/`in_progress`; admin-level unlock for corrections). Design-log
entries are never silently overwritten — edits update `updatedAt` and the log shows
attribution. The value of a system of record is that the record can be trusted.

### 4.5 Provenance from day one

`releases` carries the standard provenance columns (design-spec-v3 §4.1) even though
phase 1 is native-only. GitHub Releases / GitLab milestone mirroring is a plausible
later connector payoff, and retrofitting provenance is far more expensive than
shipping unused columns (lesson already banked in v3 Phase 1).

### 4.6 Agents are first-class historians

The MCP server is how coding agents already work inside CodePlans. The agent that
just implemented a plan is the best-informed author of "what this changed about the
asset's design," at exactly the moment it knows. Design-log entries therefore record
`authorKind` (`user | agent`) and surface it honestly in the UI — machine-drafted,
human-trusted-but-verifiable.

---

## 5. Target Schema (deltas from v0.3.29)

Types shown PG-style; SQLite variants follow existing `schema.sqlite.ts` conventions
(text IDs, JSON-as-text arrays, integer timestamps).

### 5.1 `releases` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| productId | uuid | FK → products (cascade) |
| name | text | e.g. "Admin App v1.2.0", "Auth revamp — spring drop" |
| description | text | markdown (TipTap), default `''` |
| status | `planned \| in_progress \| shipped \| abandoned` | default `planned` |
| shippedAt | timestamp? | set when status → `shipped` |
| creatorId | uuid | FK → users |
| tags | text[] | |
| *provenance columns* | | §4.5; `source` default `native` |
| createdAt / updatedAt | timestamp | |

Status is **explicit, not derived** — shipping is a human act. The UI *prompts* when
all attached plans are completed ("all plans complete — mark shipped?") but never
flips status automatically. Unique `(connection_id, external_id)` as elsewhere.

### 5.2 `code_plans.releaseId` (new column)

| Field | Type | Notes |
|---|---|---|
| releaseId | uuid? | FK → releases (**set null** on release delete) |

A plan belongs to **at most one release** — a 1-many FK, not a join table. If a plan
genuinely serves two releases, it should be two plans (they'd have distinct PR sets
anyway). Deleting a release detaches its plans; it never cascades into them.

### 5.3 `release_assets` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| releaseId | uuid | FK → releases (cascade) |
| assetId | uuid | FK → assets (cascade) |
| version | text? | the version this release stamps on this asset |
| notes | text? | one-line "what this release means for this asset" |
| createdAt / updatedAt | timestamp | |

Unique `(releaseId, assetId)`. Rows are seeded by "add all assets targeted by
attached plans" (derived suggestion) but remain explicitly managed — a release may
version an asset no plan touched (docs-only bump) or exclude an incidentally-touched
one.

### 5.4 `asset_design_log` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| assetId | uuid | FK → assets (cascade) |
| releaseId | uuid? | FK → releases (set null) — anchors entry to a version |
| codePlanId | uuid? | FK → code_plans (set null) — anchors entry to a change |
| title | text | |
| body | text | markdown (TipTap) |
| authorKind | `user \| agent` | §4.6 |
| authorId | uuid? | FK → users — the acting user, or the key owner for agents |
| createdAt / updatedAt | timestamp | |

The existing `assets.notes` ideation doc is untouched — it stays the *forward-looking*
scratchpad; the design log is the *backward-looking* record. Entries are ordinary rows
in the asset's timeline, interleaved by date with releases and plans.

### 5.5 `sync_log` additions

`entityType` gains `'release'`. Native mutations on releases (created, plan attached,
asset versioned, shipped) and design-log writes append events, so the Activity Feed
covers the new surface with zero new plumbing.

### 5.6 Derivations (queries, not columns)

- **Release work items**: `work_items ⋈ work_item_code_plans ⋈ code_plans WHERE
  code_plans.releaseId = :id`, grouped by `type` — the release-notes payload.
- **Release progress**: reuse the existing plan progress rollup, averaged over
  attached plans (weighted by task count).
- **Asset timeline**: union of (a) completed/active plans via `code_plan_assets`,
  (b) resolved work items via `work_items.assetId`, (c) `release_assets` version
  stamps, (d) design-log entries — ordered by timestamp, newest first.
- **Asset current version**: `release_assets.version` from the latest *shipped*
  release touching the asset. Display-only; never a join key.

---

## 6. UX Spec — Releases

### 6.1 Navigation & placement

- **`/releases`** joins the primary nav between **Plans** and **Work Items**, scoped
  by the existing workspace product switcher like every other page.
- Releases are **optional**: teams that never create one see no change anywhere else
  (no empty columns, no nag states). The nav item shows a one-time empty-state
  explainer ("Group plans that ship together…") until the first release exists.

### 6.2 Releases list (`/releases`)

Follows the Plans page pattern (list + persisted view preference, paginated):

- **Row**: name · status badge (`planned` gray / `in_progress` blue / `shipped`
  green / `abandoned` muted) · asset chips with versions ("Admin App v1.2.0",
  "auth-lib v3.0.0", overflow "+2") · plan count · derived work-item counts as
  small type-colored dots (5 ● features, 4 ● bugs, 2 ● debt) · shipped date.
- **Tabs**: All / In Progress / Shipped. Sort: recency (default), shipped date.
- **Create** via the standard side-panel pattern: name, product (pre-filled from
  workspace), description (rich text), then "Attach plans" (searchable multi-select
  of the product's unattached, non-cancelled plans).

### 6.3 Release detail (`/releases/[id]`)

Mirrors the redesigned plan detail layout (v0.3.21 pattern — description card +
context tabs):

- **Header**: name, status badge, shipped date, tags; actions: Edit,
  **Mark shipped** (primary when in progress), Abandon. Marking shipped requires
  every `release_assets.version` either filled or explicitly cleared ("no version
  bump") — the confirm dialog lists any blanks.
- **Description card**: markdown, auto-save (v0.3.10 behavior).
- **Assets & Versions tab**: one row per `release_assets` entry — asset name/type
  chip, **version** (inline-editable while unshipped), note, and per-asset PR
  status chips rolled up from attached plans' `code_plan_assets` rows. A derived
  suggestion banner offers "3 assets targeted by attached plans aren't in this
  release — add?".
- **Plans tab**: attached plans with the standard plan-row treatment (status,
  progress, assignees); Attach/Detach actions. Detaching never deletes the plan.
- **Work Items tab** (derived, read-only rows linking out to the item panel):
  grouped by type — Features / Bugs & UX / Tech Debt — each with count badges.
  This grouping **is** the release-notes structure.
- **Release notes action**: "Copy release notes" renders the derived work-item
  rollup + assets/versions as markdown to the clipboard. Deliberately a copy, not a
  publishing feature — write-back to GitHub Releases is a later connector action
  (§11).
- **Shipped releases render read-only** (§4.4): inline editors disabled, an
  "Unlock to correct" action for org admins.

### 6.4 Touchpoints on existing surfaces

- **Plan detail / plan create panel**: a "Release" picker chip in the header context
  area (searchable, shows status; create-new inline). On the Plans list, an optional
  release column/filter.
- **Work item panel**: a derived, read-only "Ships in" chip (via its linked plans'
  releases) linking to the release. No release picker on work items — the plan link
  is the only path (§3).
- **Dashboard**: "Recent releases" card (last 3 shipped, with asset/version chips)
  slots into the existing card grid.
- **Activity feed**: release events render from `sync_log` like everything else.

### 6.5 What the Releases UX must never grow

Per §4.2: no timeline/roadmap visualization, no target-date fields, no
drag-to-reorder, no burndown. The status enum plus `shippedAt` is the entire
lifecycle surface.

---

## 7. UX Spec — Asset History

### 7.1 History tab on asset detail

The asset detail page (v0.3.25) gains a **History** tab after Dependencies:
`Work Items · Tech Debt · Code Plans · Dependencies · History`.

Layout: a single reverse-chronological timeline with a version-aware left rail.

- **Version ladder (left rail, sticky)**: the asset's versions from `release_assets`
  on shipped releases, newest at top — `v3.0.0 · Mar 2026`, `v2.4.1 · Jan 2026`,
  `pre-history` for everything before the first release. Clicking a version scrolls
  to and highlights that segment. The current version also appears as a chip in the
  asset header (next to health/status), linking to this tab.
- **Timeline segments**: entries grouped under the version (release) they shipped
  in; unreleased activity accrues under an **"Unreleased"** segment at top —
  making visible drift the *feature* that nudges teams toward cutting releases.
- **Entry types**, each with a distinct icon + color, consistent with existing
  type/status colors:
  - **Release stamp** — "v3.0.0 shipped · Auth revamp" (links to release detail)
  - **Plan delivered** — plan title, its PR chips for *this* asset from
    `code_plan_assets` (branch, PR status), completed date
  - **Work item resolved** — type-colored chip (feature/bug/ux/debt), title,
    severity for debt; links to the item panel
  - **Debt movement** — debt item opened (↑) or resolved (↓); the segment header
    shows net debt delta for that version ("−2 debt items")
  - **Design note** — title + collapsed body (expand in place), author avatar or
    **agent badge** (§4.6), "via <plan>" anchor chip when `codePlanId` is set
- **Filters**: chip row — All / Releases / Plans / Work items / Debt / Design
  notes; persisted per the v0.3.23 view-preference pattern.
- **Empty state**: "History builds itself as plans complete and releases ship —
  nothing to record here." with a link to the docs. Never an entry form; the
  timeline is not hand-fed (§4.1) except for design notes.

### 7.2 Authoring design notes

- **Add design note** button on the History tab (editors+): side panel with title,
  rich-text body, optional anchors (release, plan — searchable, scoped to this
  asset's plans). Auto-save per v0.3.10.
- **Plan completion prompt**: when a plan completes, the confirm dialog adds an
  optional "Record a design note on affected assets?" step — one shared note
  fan-out or per-asset, pre-anchored to the plan. Skippable in one click; never a
  gate.
- **Agent-authored notes** (via MCP, §8) appear with an `agent` badge and the key
  owner's name ("recorded by Claude Code · key: sai@…"). Editable by editors like
  any entry; edits by a human clear neither the badge nor attribution — the edit
  history is the `updatedAt` + activity feed trail.

### 7.3 Release ↔ history interplay

Release detail's Assets & Versions rows deep-link into each asset's History tab at
that version's segment, and vice versa — the two features cross-navigate so the
"chapters" metaphor is tangible: *release page = one chapter across many assets;
asset history = one asset across many chapters.*

---

## 8. MCP Surface (additions)

Follows `mcp-server-spec.md` conventions; read tools on read-scope keys, mutations
on write-scope. Same access rules as the UI.

| Tool | Scope | Notes |
|---|---|---|
| `list_releases` / `get_release` | read | includes derived work-item rollup + assets/versions |
| `create_release` | write | name, productId, description, plan ids |
| `update_release` | write | rejects mutation of shipped releases (except by admin-owned keys) |
| `set_release_asset` | write | upsert `release_assets` row (assetId, version, notes) |
| `attach_plan_to_release` / `detach_plan_from_release` | write | |
| `ship_release` | write | enforces the version-completeness check (§6.3) |
| `get_asset_history` | read | the composed timeline (§5.6), paginated — the agent-facing "tell me this asset's story" call |
| `record_design_note` | write | assetId, title, body, optional releaseId/codePlanId; sets `authorKind='agent'` automatically for API-key actors |

Tool descriptions carry modeling guidance in the established style (v0.3.5):
*"After completing a plan, consider `record_design_note` on each significantly
changed asset — one paragraph on what changed structurally and why."* This is the
highest-leverage line in the whole feature: it turns every agent-driven plan into
accumulated asset documentation.

---

## 9. Access Control

- Existing role gates apply: `viewer` read-only; `editor` creates/edits releases,
  versions, design notes; `admin/owner` additionally unlock shipped releases and
  delete releases.
- Releases inherit product visibility (org membership) — no new checks.
- Mirrored-field immutability (future connector) enforced in the mutation layer as
  elsewhere.

---

## 10. Roadmap

Each phase ships migrations for **both** PG and SQLite, seed updates, tests, and
`docs/app-spec.md` updates.

### Phase A — Derived asset history (no schema change) `v0.4.0` ✅ SHIPPED
History tab composing existing data: plans via `code_plan_assets`, resolved work
items, debt movement, sync-log events. Ships first because it is cheap, immediately
useful, and validates the timeline UX before any new tables exist. (No version rail
yet — flat timeline.)

### Phase B — Releases `v0.4.1` ✅ SHIPPED (core; plan-detail release picker + MCP release tools follow with Phase C)
`releases` + `release_assets` + `code_plans.releaseId`; releases list/detail UX
(§6); plan-detail release picker; derived work-item rollups + copy-release-notes;
`sync_log` events; MCP release tools.

### Phase C — Version-structured history + design log `v0.4.2` ✅ SHIPPED (incl. the Phase-B deferrals: plan-detail release picker + MCP release tools; the plan-completion note prompt remains open)
Version ladder and segments on the History tab (from Phase B data);
`asset_design_log` + authoring UX (§7.2); `record_design_note` +
`get_asset_history` MCP tools; plan-completion note prompt.

### Phase D — AI drafting (flagged) `v0.4.3` ✅ SHIPPED (draft release notes + draft design note from plan; `ANTHROPIC_API_KEY` + `AI_ENABLED` flag, drafts always land in an editor, never auto-published)
"Draft release notes" and "Draft design note from this plan" actions: AI-generated
from the derived rollup (plan description, work items, PR titles), inserted as
*editable draft* content — never auto-published. Feature-flagged (`AI_ENABLED`
pattern), keys configurable per install; also the first stone on the path to §11
reconciliation.

### Backward compatibility
- All additive; no existing table changes beyond the nullable `code_plans.releaseId`.
- Releases are optional everywhere — no view degrades when none exist.
- `source='native'` defaults keep every existing row valid.

---

## 11. The Next Step (future spec): System of Record & Round-Trip Engineering

This spec makes CodePlans *remember* what was delivered. The follow-on capability —
sketched here as a signpost, to be specified in `asset-record-spec.md` when the
time comes — makes it *assert* what an asset currently is, and keep that assertion
honest against the code. Three moves, in order of increasing ambition:

1. **The asset record (capabilities register).** Today a resolved work item exits
   every view; its information dies. Instead, resolving a `feature` work item
   against an asset can *graduate* it into a durable **capability** on that asset's
   record — "what this asset does," each entry carrying its lineage (work item →
   plan → PR → release/version). The asset page gains a **Record** tab beside
   History: History is the diary, Record is the current-state document — always
   regenerable from the diary, editable on top. Defects and debt get the same
   treatment as *known-issues* and *debt registers* already do — the delta is
   features. This is the "system of record for asset features, defects and tech
   debt" — and it stays clear of PM/feature-management tools because entries exist
   only once work is *delivered*, never as intent.

2. **Reconciliation (read direction).** The record is only trustworthy if checked
   against reality. Via MCP, a coding agent with the repo open runs a *reconcile*
   pass: read the asset's record, scan the code, report drift — capabilities present
   in code but unrecorded, recorded but removed, debt visibly paid or newly
   accrued. Drift arrives as *proposed* record changes (a review queue, mirroring
   the existing import/link-existing pattern) — humans accept, the record converges.
   The v0.3.6 reconcile/dedup groundwork and the modeling guides are the seeds of
   this loop.

3. **Round-trip (write direction).** Closing the loop: release notes written back
   to GitHub Releases via the existing connector write-back pattern (narrow,
   explicit actions only); spec-linked plans (`specUrl`, v0.3.4) diffed against the
   record so an agent can flag "the spec promises X; the record shows X was never
   delivered." At steady state, intent (PM tool) → delivery (CodePlans) → reality
   (code) form a cycle any agent can traverse and audit.

The dependency chain is strict: **capabilities need lineage → lineage needs
releases and history → which is this spec.** Ship §5–§10, let the record accrete,
then specify the reconcile loop against real usage.

---

## 12. Explicitly Out of Scope (this spec)

- Sprint/iteration semantics, target dates, roadmap timelines on releases (§4.2)
- Direct work-item↔release links (always via plans)
- Auto-shipping releases or auto-generated *published* content (drafts only, §Phase D)
- Version parsing/semver ordering (versions are display strings)
- GitHub Releases / milestone mirroring for `releases` (provenance columns wait for
  a connector payoff, as `repoPath` did)
- The asset Record tab, reconciliation, and write-back (§11 — next spec)
