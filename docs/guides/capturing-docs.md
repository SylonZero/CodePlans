# Capturing a Docs Corpus into CodePlans

The third skill in the trio: `/codeplans-model` maps structure,
`/codeplans-log` records live session work, and **`/codeplans-capture`** reads
an existing `/docs` folder and captures its *ongoing state* — plans in flight,
parked remediation items, unscheduled ideas — as CodePlans records, each linked
to a native, versioned spec imported from its source markdown.

## Reconciliation and capture workflow

Use `list_specs(productId)` to index imported specs by `sourceUrl` within that
product. For each document, reuse its existing spec or call
`create_spec(productId, title, body, specType, area?, sourceType: git_import,
sourceUrl)` with the full Markdown body. `sourceUrl` is provenance; after import,
CodePlans owns the body. A rerun must not silently replace later native edits.
Use `update_spec` with `expectedVersion` for an intentional revision, or
`supersede_spec` if the approach changed.

Then call `link_spec` for the relevant assets, work items, and code plans.
Plan relationships declare `creates`, `revises`, or `references`. Work-item and
asset associations omit relationshipType. Read `get_spec` to reuse the linked
plan/item IDs and update those records instead of creating duplicates. Never
write `specUrl` on a plan or work item: those fields are deprecated/read-only.

For `/codeplans-capture` installations maintained outside this repository,
replace the previous “set specUrl” / “match records by specUrl” instructions
with this workflow. This repository carries the capture guide, not the
externally installed skill file. Existing legacy records should be migrated
with the [dry-run import script](using-specs.md#migrating-existing-urls) first.

## Mapping conventions

| Docs pattern | CodePlans record |
|---|---|
| `docs/codeplans/<domain>/*.md` (active) | Code plan targeting the domain's asset(s); ✅ sections → done tasks, unchecked → open tasks |
| `.../completed/*.md` | Skipped by default (ask for historical backfill) |
| `docs/remediation-backlog/*.md` | `tech_debt` work items (Status: Parked → open), `area` from module path |
| `code-notes.md` idea lists | Open, unlinked `enhancement` items |
| `docs/draft-specs/*.md` | Open `feature` work items (pure demand; unlinked until a plan picks them up; no tasks) |
| Partially implemented specs | One item per unshipped section, planned/in_progress, linked to its plan |
| Fully implemented `docs/specs/` | Native specs linked to delivered plans/items and assets; graduate only confirmed deliveries |
| `docs/adr/`, `docs/releases/` | Skipped |

**Demand extraction — the item/plan tension:** work items capture *demand*,
plans capture *delivery*; "technical" does not mean "not a work item". When a
plan doc contains a demand statement distinct from the plan — a motivation
("replaces X because Y") paragraph, a named capability outcome, or deferred
goals — the skill creates a work item for it (titled as the outcome, never the
plan title restated) and links the plan. Deferred/out-of-scope goals become
open, **unlinked** items: that is your backlog forming. Plans that are pure
mechanics with no independent demand statement get no item — mirror-image
items are noise.

Volume guard: the skill proposes the full delta with counts before writing,
and offers a load-bearing subset first when the delta exceeds ~40 records.

Save as `~/.claude/skills/codeplans-capture/SKILL.md` and run
`/codeplans-capture` in the repo (see the skill text in the
[modeling guide's](modeling-monorepos.md) companion repo, or copy from the
CodePlans README discussion). Adjust the folder mapping table in the skill to
your own docs conventions — the one above matches a
`codeplans/ + remediation-backlog/ + specs/` layout.
