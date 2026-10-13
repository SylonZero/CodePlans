---
name: codeplans-capture
description: Read an existing docs folder (plans, specs, remediation backlogs, idea lists) and capture its ongoing state in CodePlans as code plans, tasks, work items and native specs. Use when the user wants to import or bootstrap CodePlans from the markdown docs in a repo. Safe to re-run.
---

# Capture a docs corpus into CodePlans

Uses the CodePlans MCP server. If its tools (such as `list_specs`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

Capture the *ongoing* state of the docs: plans in flight, parked remediation
items and unscheduled ideas. Each record links to a native, versioned spec
imported from its source markdown.

## 1. Find the product and what already exists

- `list_products` and `get_product` for the target product and its assets. If
  assets are missing, suggest `/codeplans-model` first.
- `list_specs(productId)`: index existing specs by `sourceUrl`.
- `list_code_plans` and `list_work_items` for the product, so you update
  records instead of duplicating them.

## 2. Map the docs

Adjust this table to the repo's own conventions; ask the user if the layout
is unclear.

| Docs pattern | CodePlans record |
|---|---|
| Active plan docs (e.g. `docs/codeplans/<domain>/*.md`) | Code plan targeting the domain's assets; ✅ sections become done tasks, unchecked ones open tasks |
| Completed plan docs (`.../completed/*.md`) | Skip by default (offer a historical backfill) |
| Remediation backlog (`docs/remediation-backlog/*.md`) | `tech_debt` work items (Parked means open), `area` from the module path |
| Idea lists (e.g. `code-notes.md`) | Open, unlinked `enhancement` items |
| Draft specs (`docs/draft-specs/*.md`) | Open `feature` work items: pure demand, unlinked, no tasks |
| Partially implemented specs | One item per unshipped section, planned or in progress, linked to its plan |
| Fully implemented specs (`docs/specs/`) | Native specs linked to delivered plans, items and assets |
| ADRs, release notes | Skip |

**Demand extraction.** Work items capture *demand*; plans capture *delivery*.
When a plan doc contains a demand statement distinct from the plan (a
motivation paragraph, a named capability outcome, deferred goals), create a
work item for it, titled as the outcome and never as the plan title restated,
and link it to the plan. Deferred or out-of-scope goals become open,
**unlinked** items. Plans that are pure mechanics with no independent demand
get no item.

## 3. Propose, then write

Propose the full delta with counts and WAIT for approval. When the delta
exceeds about 40 records, offer a load-bearing subset first.

On approval, for each document:

1. Reuse its spec if `sourceUrl` matches. Otherwise `create_spec` with
   `productId`, `title`, the full markdown `body`, `specType`, optional
   `area`, `sourceType: git_import` and `sourceUrl` (the blob URL).
   Imported specs start **in review** for a person to check. Don't activate
   them.
2. A re-run must not silently replace later edits made in CodePlans. Use
   `update_spec` with `expectedVersion` only for an intentional revision, or
   `supersede_spec` when the approach changed.
3. Create or update the plans (`create_code_plan`, `create_task`,
   `update_task_status`) and work items (`create_work_item`,
   `link_work_item_to_plan`).
4. `link_spec` to the relevant assets, work items and plans. Plan links
   declare `creates`, `revises` or `references`; asset and work item links
   take no relationship type. Never write `specUrl`; it is deprecated.

Finish with a summary of what was created, updated and skipped, with links.
