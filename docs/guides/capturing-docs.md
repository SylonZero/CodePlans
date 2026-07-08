# Capturing a Docs Corpus into CodePlans

The third skill in the trio: `/codeplans-model` maps structure,
`/codeplans-log` records live session work, and **`/codeplans-capture`** reads
an existing `/docs` folder and captures its *ongoing state* — plans in flight,
parked remediation items, unscheduled ideas — as CodePlans records, each linked
back to its source markdown via `specUrl`.

## The reconciliation key

Every record created from a doc gets that doc's blob URL as its **`specUrl`**.
Re-runs index existing plans and work items by specUrl and **update matched
records instead of duplicating** — your docs folder stays the source of truth
and CodePlans tracks it. Server-side guards back this up: `create_asset` is
idempotent by (product, name) and `create_task` by (plan, title).

## Mapping conventions

| Docs pattern | CodePlans record |
|---|---|
| `docs/codeplans/<domain>/*.md` (active) | Code plan targeting the domain's asset(s); ✅ sections → done tasks, unchecked → open tasks |
| `.../completed/*.md` | Skipped by default (ask for historical backfill) |
| `docs/remediation-backlog/*.md` | `tech_debt` work items (Status: Parked → open), `area` from module path |
| `code-notes.md` idea lists | Open, unlinked `enhancement` items |
| `docs/specs/`, `docs/draft-specs/` | Not records — `specUrl` targets for the plans that implement them |
| `docs/adr/`, `docs/releases/` | Skipped |

Volume guard: the skill proposes the full delta with counts before writing,
and offers a load-bearing subset first when the delta exceeds ~40 records.

Save as `~/.claude/skills/codeplans-capture/SKILL.md` and run
`/codeplans-capture` in the repo (see the skill text in the
[modeling guide's](modeling-monorepos.md) companion repo, or copy from the
CodePlans README discussion). Adjust the folder mapping table in the skill to
your own docs conventions — the one above matches a
`codeplans/ + remediation-backlog/ + specs/` layout.
