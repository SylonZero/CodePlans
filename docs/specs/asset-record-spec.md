# Asset Record & Round-Trip Engineering — Design Spec

> **Status: PROPOSED** (2026-08). The follow-on signposted in
> `releases-and-asset-history-spec.md` §11, all four phases of which are now
> shipped. Targets the v0.5.x line. Companion to `design-spec-v3.md`; reuses the
> existing data layer, access model, and MCP conventions unchanged.

---

## 1. Purpose & Positioning

The releases-and-asset-history work made CodePlans *remember* what was delivered:
every asset now carries a version-structured diary — releases shipped, plans
delivered, work items resolved, design notes recorded. This spec makes CodePlans
*assert* what an asset currently **is**, and keep that assertion honest against
the code.

The claim worth staking out: **CodePlans becomes the system of record for an
asset's features, defects, and tech debt** — without overlapping product
management or feature-management tools. The difference is direction. PM and
feature-management systems record *intent*: what someone planned, prioritized, or
requested. CodePlans records *reality*: an entry exists in the record only once
work is **delivered** (graduated from a resolved work item with full lineage) or
**verified in the code** (confirmed by a reconciliation pass). Intent lives
upstream and links out; reality lives here. That one rule is what keeps this from
becoming a second backlog.

Three moves, in order of increasing ambition — each a phase below:

1. **The Record** — a durable capabilities register per asset, populated by
   graduating resolved feature work, sitting beside the History tab. History is
   the diary; the Record is the current-state document.
2. **Reconciliation (read direction)** — a coding agent with the repo open diffs
   the record against the actual code and files **proposals**, never direct
   edits. Humans accept; the record converges on reality.
3. **Round-trip (write direction)** — release notes written back to the code
   host, and specs audited against the record ("the spec promises X; the record
   shows X was never delivered").

### Litmus test

Two years into using CodePlans, a new engineer opens the auth library's page and
reads, in one screen: what the asset *does* (capabilities, each linked to the
work item → plan → PR → release that delivered it), what's *known broken* (open
defects), what's *rotting* (debt register), and how it *got here* (History). An
agent asked to modify the library reads the same record over MCP first — and
after a repo scan, files a proposal: "rate-limit middleware exists in code but
isn't in the record; the `session-pinning` capability was removed in March." A
maintainer accepts both in two clicks. The record never rots, because keeping it
honest is cheaper than letting it drift.

---

## 2. Gap Analysis (v0.4.x → target)

| # | Gap | Consequence today |
|---|---|---|
| 1 | Resolved work items exit every view | A shipped feature's information dies at resolution; "what does this asset do?" has no answer — the system-of-record gap |
| 2 | No current-state document per asset | History says what *changed*; nothing says what *is*. New team members and agents re-derive the asset's shape from code every time |
| 3 | No reconciliation surface | The record (once it exists) can drift from code with no mechanism to detect or correct it; drift silently destroys trust |
| 4 | Release notes stay inside CodePlans | The derived rollup (shipped in Phase B) is copy-paste only; the code host's Releases page stays empty or hand-written |
| 5 | Linked specs are read-only references | `specUrl` (v0.3.4) renders a spec but nothing checks delivery against it |

---

## 3. Conceptual Model (additions in bold)

```
Asset
 ├── History (diary — shipped)          ├── **Record (current state — new)**
 │    releases · plans · work items     │    **asset_capabilities**
 │    debt movement · design notes      │    known issues   (derived: open bugs/ux)
 │                                      │    debt register  (derived: open tech_debt)
 │                                      │    **record_proposals** (review queue)
 │                                      │
 └────────── lineage ───────────────────┘
      capability.originWorkItemId → work_item → plan → PR → release/version
```

- A **capability** is a claim: "this asset does X." Every claim carries either
  delivery lineage (graduated) or verification provenance (reconciled) — never
  neither.
- **Known issues and the debt register are derived, not stored** — they are the
  asset's open `bug`/`ux` and `tech_debt` work items, which already exist. The
  Record tab *presents* them beside capabilities; it does not duplicate them.
  The only new stored content is capabilities and proposals.
- A **proposal** is a suggested change to the record that a human hasn't
  accepted yet. Agents (and reconcile passes) file proposals; only accepted
  proposals touch the record. This mirrors the import / link-existing pattern
  from the connector work: machine suggests, human commits.

---

## 4. Design Principles

### 4.1 Delivered or verified — never intended

An entry enters the record two ways only: **graduation** (a resolved work item
with an asset is promoted, carrying its lineage) or **acceptance** (a
reconciliation proposal is approved, carrying scan provenance). There is no
"add a planned capability." If a team wants to record intent, that's a work
item — upstream, where intent belongs. This is the §4.6 scope fence of
design-spec-v3 applied to the record: prioritization ceremony stays out.

### 4.2 The record is claims with receipts

Every capability displays its lineage chain. A claim without a receipt is
exactly the kind of stale documentation this feature exists to replace, so the
schema makes receipts structural (origin FKs + provenance fields), not
prose. When lineage rows are later deleted, the FK goes null but the captured
`originSummary` text survives — the receipt outlives its source rows.

### 4.3 Agents propose, humans accept

Reconciliation output lands in a review queue, never directly in the record —
including capability *removals*, which are the most damaging kind of silent
drift correction to get wrong. Accepting is deliberately cheap (one click,
bulk-accept for a clean scan); the asymmetry is the point: trust accrues to a
record whose every entry a human vouched for. The one exception is graduation
at resolve time by the resolving user — that's a human act already.

### 4.4 Derived beats stored (again)

Known issues and debt are projections of `work_items` — same principle that made
asset history cheap and rot-proof. Capabilities are stored only because nothing
else durably represents "delivered and still present"; everything else on the
Record tab is a query.

### 4.5 The record is regenerable, then editable

A capability's initial title/description are drafted from its origin work item
(and, when AI is enabled, refined by the same flagged drafting path as Phase D).
After that it's an ordinary editable document — reality's phrasing improves with
editing, but edits never detach lineage.

### 4.6 Reconciliation is a workflow, not a subsystem

CodePlans ships no code scanner. The reconcile loop is: an MCP-connected coding
agent (which already has the repo open) calls `get_asset_record`, inspects the
code, and files `propose_record_change` calls. CodePlans provides the record,
the proposal queue, and the review UX — the intelligence lives in the agent,
guided by tool descriptions (the pattern proven by `record_design_note`).

---

## 5. Target Schema (deltas from v0.4.x)

Types shown PG-style; SQLite variants follow `schema.sqlite.ts` conventions.
PG migrations are hand-written (snapshots predate the hand-written 0004+ series);
SQLite via drizzle-kit with FK actions verified (the `ON DELETE SET NULL`
lesson from migration 0013).

### 5.1 `asset_capabilities` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| assetId | uuid | FK → assets (cascade) |
| title | text | the claim, e.g. "Bulk CSV export with resumable jobs" |
| description | text | markdown; drafted from origin, editable |
| area | text? | free-text locus, same convention as `work_items.area` |
| status | `active \| removed` | removed capabilities stay as tombstones — "used to do X" is record too |
| source | `graduated \| reconciled` | how the entry earned its place (§4.1) |
| originWorkItemId | uuid? | FK → work_items (set null) |
| originCodePlanId | uuid? | FK → code_plans (set null) |
| originReleaseId | uuid? | FK → releases (set null) |
| originSummary | text | captured lineage text ("WI: Bulk export · Plan: Export overhaul · v2.0.0") — survives FK nulling (§4.2) |
| verifiedAt | timestamp? | last time a reconcile pass confirmed this capability in code |
| removedAt | timestamp? | set when status → removed |
| createdAt / updatedAt | timestamp | |

Index on `assetId`. No provenance columns — capabilities are never mirrored
from external systems; they are CodePlans' own value-add.

### 5.2 `record_proposals` (new)

| Field | Type | Notes |
|---|---|---|
| id | uuid | PK |
| assetId | uuid | FK → assets (cascade) |
| kind | `add_capability \| remove_capability \| update_capability \| verify_capability` | |
| capabilityId | uuid? | FK → asset_capabilities (cascade) — for remove/update/verify |
| title | text | proposed claim (add/update) or reason (remove) |
| body | text | markdown: proposed description + the agent's evidence ("found in `src/export/`, added <commit>") |
| status | `pending \| accepted \| rejected` | |
| proposedByKind | `agent \| user` | same attribution convention as `asset_design_log` |
| proposedById | uuid? | FK → users (set null) — the key owner for agents |
| reviewedById | uuid? | FK → users (set null) |
| reviewedAt | timestamp? | |
| createdAt | timestamp | |

Accepting an `add_capability` creates the capability with `source: 'reconciled'`;
`remove_capability` sets the tombstone; `verify_capability` stamps `verifiedAt`.
Rejection keeps the row (with status) so a repeat scan can be deduped against
prior rejections — the loop must converge, not nag.

### 5.3 Graduation (no new table)

Graduation is a mutation, not a schema object: `graduateWorkItem(workItemId)`
creates a capability from a **resolved** `feature`/`enhancement` work item with
an `assetId`, wiring `originWorkItemId`, the item's first linked plan, that
plan's release, and composing `originSummary`. Idempotent per work item (a
unique partial index on `originWorkItemId` where not null).

### 5.4 `sync_log` additions

Events: `capability_graduated`, `capability_removed`, `proposal_filed`,
`proposal_accepted`, `proposal_rejected` (entityType `asset`). The Activity Feed
picks these up through the existing presentation mapping.

---

## 6. UX Spec — The Record Tab

### 6.1 Placement & layout

Asset detail gains **Record** immediately after History:
`Work Items · Tech Debt · Code Plans · Dependencies · History · Record`.
(Longer term, Record likely deserves the first position; land it last-tab first
and promote once teams populate it.)

Three stacked sections, one page — the "one screen" of the litmus test:

1. **Capabilities** — the stored register. Each row: title, area chip, lineage
   chip ("v2.0.0 · via Bulk export"), `verifiedAt` freshness dot (green ≤ 90
   days, gray otherwise, tooltip with date), expandable markdown description.
   Removed capabilities collapse into a "Previously" group at the bottom —
   struck-through titles, removal date. Edit/remove inline (editors+); remove
   asks for a one-line reason that becomes the tombstone body.
2. **Known issues** *(derived)* — open `bug`/`ux` work items on this asset,
   severity-sorted, linking to the work-item panel. Read-only here.
3. **Debt register** *(derived)* — open `tech_debt` items grouped by area, same
   presentation as the existing debt views. Read-only here.

### 6.2 The proposals queue

When pending proposals exist, a banner sits above the sections: "3 proposed
record changes from a reconcile pass" → expands to a review list. Each proposal
row: kind badge (`+ add` / `− remove` / `~ update` / `✓ verify`), title, agent
badge + key-owner attribution, expandable evidence body, **Accept** / **Reject**
buttons, and **Accept all** for the common clean-scan case. Accepted/rejected
rows leave the queue; the Activity Feed carries the audit trail.

### 6.3 Graduation touchpoints

- **Resolve-time prompt**: resolving a `feature`/`enhancement` work item that
  has an `assetId` adds one optional step to the existing flow: "Add to
  <asset>'s record?" with the drafted title editable inline. One click to
  accept, one to skip — never a gate (same contract as the design-note prompt).
- **Backfill**: the Capabilities section's empty state offers "Review resolved
  features" — a checklist of this asset's already-resolved feature items, so a
  team adopting the record can graduate its history in one sitting rather than
  entry by entry.
- **Work-item panel**: resolved feature items with an asset show a "Graduated ✓"
  chip (linking to the capability) or an "Add to record" action.

### 6.4 History ↔ Record interplay

Graduation writes a `capability_graduated` event, which renders in the History
timeline — the diary records the moment a change became part of the asset's
identity. Conversely, each capability's lineage chip deep-links into History at
its release segment. Diary and document stay two views of one chain.

### 6.5 What the Record must never grow

No priority, no status beyond active/removed, no assignees, no dates-as-plans,
no capability-level sub-items. The moment a capability needs workflow, it's a
work item — send it upstream. (§4.1's fence, stated as UX.)

---

## 7. MCP Surface (additions)

Read tools on read-scope keys; mutations on write-scope. Same access rules as
the UI. Tool descriptions carry the workflow — that's where the reconcile loop
actually lives (§4.6).

| Tool | Scope | Notes |
|---|---|---|
| `get_asset_record` | read | Capabilities (active + removed), derived known issues and debt, pending proposal count. Description: *"The asset's current-state record. Read this before modifying the asset — then verify claims against the code you see, and file propose_record_change for any drift."* |
| `graduate_work_item` | write | Promote a resolved feature/enhancement item into its asset's record. Idempotent. |
| `propose_record_change` | write | File an add/remove/update/verify proposal with evidence. Description instructs: *"After scanning an asset's code, compare against get_asset_record: propose add for capabilities present in code but missing from the record, remove for recorded capabilities no longer present, verify for confirmed ones. Cite files/commits as evidence. Proposals are reviewed by a human — file freely, never re-file rejected drift."* |
| `list_record_proposals` | read | Pending proposals for an asset (agents dedupe against these + their own rejections). |
| `resolve_record_proposal` | write | Accept/reject. Gated to admin-owned keys by default — the human-accepts principle (§4.3) extends to key scoping; a standing agent shouldn't self-accept. |

The reconcile pass itself ships as **documentation, not code**: a guide
(`docs/guides/reconcile-asset-record.md`) giving the agent prompt pattern —
read record → scan repo (`repositoryUrl` + `repoPath` scope it) → file
proposals — in the same voice as the existing monorepo modeling guide (v0.3.5).

---

## 8. Round-Trip (write direction)

The final move closes the loop with two narrow, explicit actions — consistent
with the write-back phasing rule from design-spec-v3 §6 (never field sync):

1. **Publish release notes.** A shipped release gains "Publish to GitHub
   Releases" (when a GitHub connection exists): creates a tag/release on the
   repo of the release's primary asset via the existing connector auth, body =
   the derived rollup (or the AI-drafted, human-edited description). Explicit
   button, provenance-stamped in `sync_log`, never automatic on ship.
2. **Spec audit (MCP guidance, no new tools).** `get_code_plan` already returns
   `specUrl`; the reconcile guide gains a section: after delivery, diff the
   spec's promises against the record and linked work items, and file work items
   (not capabilities) for anything promised-but-undelivered. Intent gaps become
   demand — upstream, where they belong.

At steady state the cycle is: intent (PM tool / spec) → delivery (plans,
releases) → reality (record, reconciled against code) → back to intent (gap
work items). Every arrow is traversable by an agent over MCP.

---

## 9. Access Control

- Existing role gates: `viewer` reads the record; `editor` graduates, edits
  capabilities, files and reviews proposals in the UI; `admin/owner` — no
  additional gates beyond MCP `resolve_record_proposal` key scoping (§7).
- Capabilities and proposals inherit product visibility via the asset (org
  membership), enforced in the same query-layer guard as `getAssetDetail`.

---

## 10. Roadmap

Each phase ships migrations for both PG and SQLite, seed updates, tests, and
`docs/app-spec.md` updates.

### Phase A — The Record `v0.5.0`
`asset_capabilities` + graduation mutation; Record tab (capabilities + derived
known issues/debt); resolve-time graduation prompt + backfill checklist;
`graduate_work_item` + `get_asset_record` MCP tools; sync_log events.
*Exit criteria: a team can build and browse a receipted capabilities register
with zero agent involvement.*

### Phase B — Reconciliation `v0.5.1`
`record_proposals` + review queue UI; `propose_record_change`,
`list_record_proposals`, `resolve_record_proposal` MCP tools; the reconcile
guide; AI-drafted capability descriptions on graduation (flagged, Phase D
plumbing). *Exit criteria: an agent-run reconcile pass on this repo files
sensible proposals end-to-end.*

### Phase C — Round-trip `v0.5.2`
Publish-to-GitHub-Releases action on shipped releases; spec-audit section in the
reconcile guide; Record freshness surfaced on the asset header (oldest
`verifiedAt` drives a "record last verified" hint). *Exit criteria: the litmus
test (§1) passes on CodePlans' own record.*

### Backward compatibility
All additive; no existing table changes. Assets with no capabilities show
derived sections only — the Record tab is useful on day one and empty-state
honest about the rest.

---

## 11. The Step After (future, deliberately unspecified)

Once records exist and stay verified, two directions open — noted, not designed:
**capability-level impact analysis** (dependency edges between capabilities, not
just assets: "session-pinning depends on the auth library's token-refresh") and
**asset scorecards** (record freshness + debt trend + delivery cadence as a
single health view replacing the manual `health` enum). Both need months of real
record data first; neither should be built speculatively.

---

## 12. Explicitly Out of Scope

- Recording intent: planned/roadmap capabilities, priority, or workflow on
  record entries (§4.1, §6.5)
- A built-in code scanner or repo indexing — reconciliation intelligence lives
  in the connected agent (§4.6)
- Auto-accepting proposals, including "trusted agent" modes (§4.3)
- Bidirectional spec sync; spec audit files work items only (§8)
- Mirroring capabilities from or to external systems (no provenance columns by
  design, §5.1)
