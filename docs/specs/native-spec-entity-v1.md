# Native Spec Entity v1 — Specs as First-Class, Versioned, Asset-Linked Documents

## TL;DR

Replace the single `specUrl` string field on `code_plans` and `work_items` with a native `specs` entity: TipTap-authored, versioned, many-to-many linked to assets/plans/work items via a typed `spec_links` table, with a `specType`/`area` taxonomy (schema, feature, ux, test, workflow, api, architecture, integration, ops — open, not enum). Git becomes an *import source* (`sourceType: git_import`), not the permanent home. Deliveries pin to a specific spec **version**, so capabilities never silently drift when a spec is later revised. Asset History gains `spec_linked`/`spec_updated` event kinds; Asset Record gains a version-aware `activeSpecs` section, kept structurally separate from `capabilities` because the record's existing contract — "never contains intent, only delivered or verified work" — must not be violated.

## Source / Context

Surveyed live MindStaq production data via the CodePlans MCP server (list_code_plans, get_asset_history, get_asset_record against the MindStaq product, 2eabf76f-5a3b-45fc-8501-c02544417ea1):

- **~32 code plans carry a `specUrl`**, each a raw string pointing at a GitLab blob on a specific branch (`sai/feat/...`, `develop`, `main`). No versioning, no back-link from asset to spec, no queryability.
- **At least 2 of those URLs are malformed** — e.g. `.../streamcloud/StreamServer/docs/specs/password-reset-workspace-routing-v1.md`, missing the GitLab `-/blob/<branch>/` path segment entirely. Dead links sitting in production data today.
- **Several plans have the entire spec pasted into the plan `description` field** instead of linked at all (e.g. "Password Reset Workspace Routing Fix v1", "Update AI credit limits for a workspace's users when its subscription plan changes") — thousands of words duplicated by hand because linking to a git blob isn't a good enough reading experience inside CodePlans.
- **One plan ("Meetings Library & App: Migrate to Company-DB Backend") carries a prepended `CORRECTION` note** admitting the original assessment was done against the wrong branch state — a live example of spec drift causing a real planning mistake.
- **One spec URL is reused verbatim across two separate plans** ("Meetings: Company-DB-Native Design for Multi-Project Support" and "Program, Team, and General workspace-scoped meetings") with no structural relationship between them — CodePlans has no way to know these two plans share a spec.
- **Morpheus App's asset record shows `capabilities: []`** despite ~20 completed plans against it, because 11 resolved feature/enhancement work items sit ungraduated in `candidates` — and even once graduated, lineage stops at work item → plan → release, never reaching back to *why* (the spec).
- **CodePlans' own product has 0 code plans and 2 unspecced assets**, despite the GitHub repo linking real specs under `docs/specs/*.md` for every recent release (`asset-atlas-spec.md`, `layers-and-boundaries-spec.md`, `asset-record-spec.md`). Not dogfooding this yet.

## Approach

### Conceptual model

- An asset has **one or more specs**, each describing a different *aspect* of its design: schema, feature behavior, UX, test plan, workflow, API contract, architecture, etc. `(assetId, specType, area)` is the natural addressing key — many specs can coexist on one asset without collision.
- A **code plan** creates or revises specs as part of doing work — the plan declares this via a typed link (`creates | revises | references`), not just a loose association.
- **Notes** (`record_design_note`) can trigger a spec revision as an explicit, visible activity of its own — not folded silently into note prose.
- **Graduation** (`graduate_work_item`) pins a capability to the specific spec **version** current at time of delivery, so later spec revisions don't retroactively (and incorrectly) imply an old capability matches new intent.
- **Asset Record** shows the gap between a spec's current version and the highest version any capability has confirmed delivered — that gap is the answer to "what's specified but not yet verified shipped."

### `specType` / `area` — open taxonomy, not an enum

Follows the same convention already used for `assets.layer` and `work_items.area`: a recommended starter set, documented in the modeling guide, not a hard-coded enum.

Starter set: `feature`, `ux`, `test`, `workflow`, `schema`, `api`, `architecture`, `integration`, `ops`.

`area` (optional, free string) gives sub-scope within a type — e.g. `specType: schema, area: "chat file resource model"` vs `specType: schema, area: "AI quota limits"` on the same asset.

## Data Model

### `specs`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `productId` | FK → products | ownership boundary, matches every other entity |
| `title` | text | |
| `body` | text (TipTap/GFM) | same editor as plan descriptions, design notes, release notes |
| `specType` | text | open taxonomy, see above |
| `area` | text? | optional fine-grained scope within specType |
| `status` | `draft \| active \| superseded \| archived` | |
| `version` | integer, auto-incremented on `update_spec` | full diff history is a stretch goal, not v1 |
| `supersedes` / `supersededBy` | FK → specs, nullable | set only via `supersede_spec`, not `update_spec` (see Decisions) |
| `sourceType` | `native \| git_import` | provenance stays visible forever |
| `sourceUrl` | text? | for `git_import`: original blob URL, kept as citation, not a live dependency |
| `authorType` | `user \| agent` | mirrors design notes |
| `createdAt` / `updatedAt` | timestamp | |

### `spec_links`

| Field | Type | Notes |
|---|---|---|
| `id` | UUID | PK |
| `specId` | FK → specs | |
| `targetType` | `asset \| work_item \| code_plan` | |
| `targetId` | UUID | |
| `relationshipType` | `creates \| revises \| references` | only meaningful when targetType = code_plan; asset/work_item links are plain association |
| `createdAt` | timestamp | |

### `code_plans` / `work_items`

- `specUrl` field deprecated, retained read-only through v1 for backward compatibility, removed in a later release once migration (below) completes.

### `asset_record` capability shape — extended

- `capability.sourceSpecId` — FK → specs, nullable
- `capability.sourceSpecVersion` — integer, nullable — **the version at time of graduation**, not "current version." This is the field that prevents drift.

## MCP Tool Surface

Mirrors the existing `record_design_note` / `get_asset_history` pattern rather than inventing new conventions.

| Tool | Behavior |
|---|---|
| `create_spec(productId, title, body, specType, area?, sourceType?, sourceUrl?)` | New spec, `version: 1`, `status: draft` |
| `update_spec(id, body?, status?)` | In-place edit, bumps `version`. Use for wording/clarity changes. |
| `supersede_spec(oldId, newBody, title?)` | Creates a new spec row, sets `supersedes`/`supersededBy` links, sets old spec `status: superseded`. Use when the *approach* changed, not just the wording. |
| `link_spec(specId, targetType, targetId, relationshipType?)` | |
| `unlink_spec(specLinkId)` | |
| `get_spec(id)` | Full body + everywhere it's linked |
| `list_specs(productId?, targetType?, targetId?, specType?)` | |

### Existing tools, extended

- **`record_design_note`** gains optional `revisesSpecId`. When present: records the note as today, *and* calls `update_spec` on the target — but emits **two separate, cross-linked timeline entries** (`design_note` and `spec_updated`, each carrying the other's id), not one merged entry. The note stays a note; the spec revision is its own visible activity.
- **`graduate_work_item`** looks up any spec linked to the work item (via `spec_links`, any relationshipType) and populates `capability.sourceSpecId` + `capability.sourceSpecVersion` (the spec's version *at the moment of graduation*).

## Asset History Integration

Two new event kinds, same shape as existing `design_note`/`plan_completed` entries:

- `spec_linked` — a spec attached to this asset (direct link, or via a plan/work item link that resolves to this asset). Carries `specId`, `specTitle`, `specType`, `version`, and the anchor (planId/workItemId) it arrived through.
- `spec_updated` — a version bump on a spec already linked here. Carries `specId`, `specTitle`, `fromVersion`, `toVersion`, and — when triggered by a note — the `noteId` it's cross-linked to.

This makes the asset's story bidirectional: *spec attached → plan completed → design note describing what actually shipped* becomes one coherent, readable feed, instead of specs being invisible to History entirely (current state).

## Asset Record Integration

New top-level section, **structurally separate from `capabilities`** — this separation is load-bearing, not cosmetic, because the record's contract explicitly excludes intent:

```
activeSpecs: [
  {
    specId, specTitle, specType, area,
    currentVersion,
    deliveredThroughVersion,   // highest version any graduated capability has confirmed
    status
  },
  ...
]
```

A gap between `currentVersion` and `deliveredThroughVersion` is directly meaningful without any extra computation on the reader's part — e.g. "schema spec is at v4, delivery confirmed only through v3" means the latest schema understanding hasn't been verified as shipped.

## Migration

Existing `code_plans.specUrl` / `work_items.specUrl` values become `specs` rows on first touch (or a one-time backfill script):

- `sourceType: git_import`, `sourceUrl: <the original specUrl>`
- `body`: fetched-and-converted from the git blob where reachable; left as a placeholder ("content not yet imported — see sourceUrl") where the link is dead (e.g. the two malformed URLs found above), so migration never blocks on broken links
- `specType`: inferred heuristically from path/title keywords where possible (`schema`, `test`, etc.), defaulted to `feature` otherwise, flagged `needsReview: true` for a manual pass
- Linked back to the plan/work item that carried the original `specUrl`, `relationshipType: creates`
- **Duplicate URLs collapse to one spec row**, linked from every plan/work item that referenced it (fixes the "Meetings: Company-DB-Native Design" / "Program, Team, and General workspace-scoped meetings" duplication found above)

## Steps

1. Schema: `specs` + `spec_links` tables, `capability.sourceSpecId`/`sourceSpecVersion` columns.
2. MCP tools: `create_spec`, `update_spec`, `supersede_spec`, `link_spec`, `unlink_spec`, `get_spec`, `list_specs`.
3. Extend `record_design_note` (`revisesSpecId`) and `graduate_work_item` (spec lineage lookup).
4. Asset History: `spec_linked`, `spec_updated` event kinds in `get_asset_history`.
5. Asset Record: `activeSpecs` section in `get_asset_record`.
6. Migration script for existing `specUrl` data (dry-run mode first — report what it would create/collapse/flag before writing).
7. UI: spec panel on asset detail page (list by specType, version history, linked plans/work items); `specUrl` field on plan/work-item forms replaced with a spec picker/creator.
8. `/codeplans-capture` updated to call `create_spec`/`link_spec` instead of populating `specUrl`.
9. Deprecate `specUrl` fields (read-only), remove in a subsequent release once migration is verified complete.

## Testing / Verification

- Migration dry-run against MindStaq's real ~32 `specUrl` plans before any write; confirm the known duplicate collapses to one row and the two malformed URLs land as placeholder specs rather than failing the run.
- `graduate_work_item` on a work item with a linked spec correctly captures the spec's version *at graduation time*, not the spec's current version, verified by graduating, then revising the spec, then re-reading the already-graduated capability and confirming `sourceSpecVersion` is unchanged.
- `activeSpecs` gap computation on an asset with a spec revised after its last graduation (e.g. re-run against Morpheus App once migrated) shows a non-zero gap.

## Rollout

No feature flag needed for the schema/MCP layer — additive, `specUrl` stays functional throughout. UI work (spec panel, form changes) can ship in a follow-up release once the underlying entity is stable. Migration script is safe to re-run (idempotent on `sourceUrl`).

## Decisions

| Decision | Choice | Why |
|---|---|---|
| specType as enum vs open string | Open string, documented starter set | Matches existing `layer`/`area` convention; avoids schema changes for new spec kinds |
| In-place edit vs supersede | Both exist; `update_spec` always bumps version in place, `supersede_spec` is a separate explicit call | A typo fix and a redesign are different weights of change; forcing every edit through supersede would make the version history unreadable, but silently overwriting a real redesign loses the old approach entirely |
| Auto-transition spec status on graduation | **Not automatic** — left as an open decision, resolved manually | A spec can outlive many partial graduations (e.g. a living schema doc); auto-marking it "delivered" on the first graduation risks falsely implying full delivery |
| Design notes vs specs — same entity? | Kept separate | Design notes are short, retrospective, timeline-native prose; specs are long-form, versioned, revisable planning documents. Conflating them would make the History feed unreadable and blur Record's intent/delivered boundary |
| `activeSpecs` folded into `capabilities`? | No — separate section | Record's existing contract is explicit: "never contains intent, only delivered or verified work." Folding specs in would violate that contract |

## Out of Scope (v1)

- Full diff/character-level version history (v1 keeps only version *number* + current body; a stretch goal, not required to unblock the core loop)
- Live sync back to git (git stays an import source; no round-trip write-back to repos)
- Automatic spec-status transition on graduation (see Decisions)
- Cross-product spec sharing (a spec belongs to one product, matching every other entity's ownership model)
## Implementation notes

- The implementation is based on v0.4.6/current master, which already contains
  Asset History, Asset Record, graduation, layers, and TipTap.
- `record_design_note` requires `revisedSpecBody` alongside `revisesSpecId`;
  `expectedSpecVersion` can reject stale revisions. Note prose is never used
  implicitly as a replacement for a spec. Both writes and timeline snapshots
  commit in one transaction.
- With multiple work-item specs, graduation requires `sourceSpecId`; the UI
  prompts for the choice. This makes the singular receipt unambiguous.
- `update_spec` also accepts title, specType, area and needsReview so imported
  metadata can be corrected and review completed; those edits bump version.
  `expectedVersion` protects against stale writes.
- Draft/active specs appear in `activeSpecs`; no delivery is represented by
  null. Superseded/archived specs stay accessible through their original links
  and receipts. Supersession copies associations onto the new draft and
  preserves all old associations.
- `spec_events` stores immutable asset timeline snapshots. Events survive
  unlinking. Plan/item targeting an asset after a spec link records its arrival.
- Both database providers have an additive, journaled `0017_native_specs`
  migration. PostgreSQL follows the existing named-FK conventions and uses
  UUIDs/timestamptz. The legacy URL columns are retained and read-only in native
  forms/MCP. The migration utility defaults to dry-run.
- The shared Markdown renderer supports GFM and soft line breaks, including
  table scrolling inside panels. TipTap uses matching typography.
- Validation: 222 tests passed; production webpack build passed. Real Postgres
  verified the complete Drizzle chain twice, concurrency, rollback, pinned
  delivery gaps, supersession, import idempotency, and FK cleanup. Browser
  checks covered the spec reader/editor, work-item panel, and Record gap.
- Standalone TypeScript checking still reports the same five errors reproduced
  on untouched master: local-auth passwordHash vs the PG type anchor (four),
  and the existing CodePlan.productName test assertion (one).
- MindStaq's production URL corpus has not been accessed or migrated in this
  implementation session. Run the documented product-scoped dry-run against
  that environment before applying its content backfill. The externally
  installed `/codeplans-capture` skill is not in this repository; its capture
  guide has been updated with the new create_spec/link_spec workflow.
