# Working with AI Agents

CodePlans ships an MCP (Model Context Protocol) server inside the app —
`/api/mcp/mcp` — so AI coding agents can read and update your planning record
directly: pull the active plan while coding, mark tasks done, file tech debt
as they find it, record design notes, and manage releases end to end.

Because agents act through your API key, **org access rules, role gates, and
mirrored-field protections apply unchanged**. There is no separate agent
permission model to configure.

## Connecting

Generate a key in **Settings → API Keys** (read-only or read/write scope).
The page shows copy-paste connection snippets for Claude Code, Claude
Desktop, Cursor, Codex CLI, GitHub Copilot (CLI + VS Code), and Antigravity.
For Claude Code:

```sh
claude mcp add --transport http codeplans http://localhost:3000/api/mcp/mcp \
  --header "Authorization: Bearer cpk_your_key"
```

Works identically against a local SQLite instance or a hosted deployment —
the server lives inside the Next.js app.

## The tool catalog (49 tools)

**Read** (any key):

| Area | Tools |
|---|---|
| Products & assets | `list_products` · `get_product` · `get_asset` · `get_modeling_guide` |
| Demand & debt | `list_work_items` · `get_tech_debt_register` |
| Plans & tasks | `list_code_plans` · `get_code_plan` |
| Releases & history | `list_releases` · `get_release` · `get_asset_history` |
| Asset record | `get_asset_record` |
| Specs | `get_spec` · `list_specs` |

**Write** (write-scope key):

| Area | Tools |
|---|---|
| Model the graph | `create_product` · `update_product` · `create_asset` · `update_asset` · `move_asset` · `add_asset_dependency` · `remove_asset_dependency` |
| Demand | `create_work_item` · `update_work_item` · `update_work_item_status` · `link_work_item_to_plan` · `unlink_work_item_from_plan` |
| Plans | `create_code_plan` · `update_code_plan` · `activate_plan` · `complete_plan` · `add_plan_asset` · `remove_plan_asset` · `update_plan_asset` |
| Tasks | `create_task` · `update_task` · `update_task_status` |
| Releases | `create_release` · `update_release` · `attach_plan_to_release` · `detach_plan_from_release` · `set_release_asset` · `ship_release` |
| History | `record_design_note` |
| Asset record | `graduate_work_item` |
| Specs | `create_spec` · `update_spec` · `supersede_spec` · `link_spec` · `unlink_spec` |

Guardrails are enforced at the tool layer, not just the UI: mirrored items
reject writes to tracker-owned fields, shipped releases reject mutation,
`move_asset` is blocked while open plans target the asset (the error lists
them), and `create_asset` / `create_task` are idempotent so agent re-runs
can't duplicate records.

**Modeling boundaries** — before bulk-creating anything, call
`get_modeling_guide`: it carries the boundary rule (*products ship, assets
change*), the layer taxonomy (`edge / frontend / backend / domain / data /
infra / shared`), and a refining recipe (assign layers with `update_asset`,
relocate mis-homed assets with `move_asset` — work items follow, history is
preserved).

## Recommended agent workflows

**Before changing an asset** — read its story:
`get_asset` → `get_asset_history` (releases, delivered plans, debt movement,
design notes, spec arrivals and revisions) → `get_tech_debt_register` for what's known-rotten. The agent
starts with the context a senior teammate would have.

**Before implementing a spec** — use `list_specs` / `get_spec` to read the
current document and associations. `create_spec` stores a new document;
`link_spec` connects it to assets, work items, and plans within the product.
For a plan, declare `creates`, `revises`, or `references`. Use `update_spec`
with `expectedVersion` for an edit, or `supersede_spec` for a new approach.
Imported git URLs are provenance; never replace native edits on a capture rerun.

**While delivering a plan** — keep the record live: `update_task_status` as
work lands, `update_plan_asset` to record branch/PR status, `create_work_item`
(type `tech_debt`) for debt discovered along the way.

**After completing a plan** — close the loop: `complete_plan`, then
`record_design_note` on each significantly changed asset — one paragraph on
what changed structurally and why, anchored to the plan so the note carries
lineage. To revise a linked spec at the same time, provide `revisesSpecId`,
`revisedSpecBody`, and optionally `expectedSpecVersion`; the note and revision
commit together with cross-linked History events. Notes show an agent badge
in the UI, attributed to the key's owner.

**Learning what an asset does today** — `get_asset_record` returns the
capabilities register (each claim carrying its delivery lineage), open known
issues, the debt register, graduation candidates, and a separate `activeSpecs`
collection. After resolving a feature or enhancement, `graduate_work_item`
promotes it into the capabilities register and pins its linked spec's current
version. Supply `sourceSpecId` when several specs are linked. Re-graduation
returns the original receipt. Compare each active spec's `currentVersion`
with `deliveredThroughVersion` to see revisions not yet confirmed by delivery;
null means no delivery receipt exists. Specs remain design intent and never
become capabilities merely because they were linked. See the
[native specs guide](using-specs.md).

**At release time** — `create_release`, `attach_plan_to_release`,
`set_release_asset` to stamp versions, `ship_release` (it warns if assets
lack version stamps). The release notes derive themselves from the work items
the plans delivered.

Two companion skills automate the bootstrap cases: `/codeplans-capture`
(turn an existing docs folder into plans and work items — see
[Capturing a Docs Corpus](capturing-docs.md)) and `/codeplans-log`
(record a finished coding session — see
[Logging Work via Claude](logging-work.md)).

## AI drafting

Separately from MCP, the app itself can draft content with Claude — off by
default and enabled only when a key is configured:

| Variable | Default | Effect |
|---|---|---|
| `ANTHROPIC_API_KEY` | — | Enables AI drafting; without it every AI feature is hidden |
| `AI_ENABLED` | `true` | Set `false` to force drafting off even with a key |
| `AI_MODEL` | `claude-opus-5` | Claude model used for drafting |

Two actions exist today: **Draft release notes** (from a release's derived
rollup) and **Draft design note from plan** (in the design-note panel).
Drafts are grounded in recorded facts only and always land in an editor —
nothing is saved or published until you confirm.

## What's next

The [Asset Record spec](../specs/asset-record-spec.md) extends this loop:
agents will reconcile each asset's recorded capabilities against the actual
code and file proposals a human accepts — CodePlans as a system of record
that stays honest because keeping it honest is cheaper than letting it
drift.
