# Logging Engineering Work from Claude Code

The companion to [modeling monorepos](modeling-monorepos.md): once your
products and assets exist, `/codeplans-log` turns "document what we just did"
into a one-liner at the end of any Claude Code session. It maps a session's
work onto CodePlans concepts:

| Session artifact | CodePlans record |
|---|---|
| The overall change / goal | Code plan (summary description, spec URL, target assets) |
| Branch + PR/MR | `update_plan_asset` — branch, PR URL, status per asset |
| Pieces implemented | Tasks, marked done (assigned by email) |
| Gaps, debt, follow-ups discovered | Work items — linked to the plan if it addresses them, left open if explicitly out of scope |

Save as `~/.claude/skills/codeplans-log/SKILL.md`:

```markdown
---
name: codeplans-log
description: Document the engineering work from this session/branch in CodePlans (plans, tasks, PRs, work items) via the codeplans MCP server.
---

Using the codeplans MCP server, document the work we've been discussing (or,
if none, inspect the current branch: log, diff vs the default branch, and any
open PR/MR). Then:

1. Find the product and assets: list_products + get_product. If an asset that
   was clearly worked on is missing, tell me — do not create assets here
   (that's /codeplans-model's job).
2. Find or create the code plan: list_code_plans first — update an existing
   matching plan rather than duplicating. For a new plan: type that fits the
   change, description = 2-5 paragraph summary (problem, approach, out of
   scope), targetAssetIds for every asset the change touches, and specUrl if
   a spec markdown exists in the repo (blob URL).
3. Record delivery: update_plan_asset per targeted asset with branch, PR/MR
   URL, prStatus, and a short note. activate_plan if work is underway.
4. Tasks: create_task per completed or planned piece of work (assign by email
   where known); update_task_status to done for what's shipped.
5. Work items: create_work_item for anything discovered but not done —
   tech_debt (with assetId + area) for known gaps, bug for defects,
   feature/enhancement for follow-ups. Link the ones this plan addresses via
   link_work_item_to_plan; leave explicit non-goals unlinked and open.
6. If the plan's work is fully shipped and merged, ask me before calling
   complete_plan (it posts write-back comments to linked tracker issues).
7. Finish with get_code_plan and show me the result so I can verify.
```

Notes:

- **Idempotent by design**: it looks for an existing plan before creating, so
  running it across multiple sessions of the same effort keeps enriching one
  plan rather than spawning duplicates.
- **`complete_plan` asks first** because completion triggers write-back
  comments on any mirrored tracker issues linked to the plan.
- Pair it with a GitHub/GitLab connection and the PR statuses you log here
  keep themselves current on every sync.
