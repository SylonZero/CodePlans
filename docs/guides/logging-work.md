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

Install it with the other [CodePlans agent skills](agent-skills.md):

```sh
npx skills add SylonZero/CodePlans --skill codeplans-log
```

or, in Claude Code, `/plugin marketplace add SylonZero/CodePlans` then
`/plugin install codeplans@codeplans`. The skill text is in
[`plugins/codeplans/skills/codeplans-log/SKILL.md`](../../plugins/codeplans/skills/codeplans-log/SKILL.md).

Notes:

- **Idempotent by design**: it looks for an existing plan before creating, so
  running it across multiple sessions of the same effort keeps enriching one
  plan rather than spawning duplicates.
- **`complete_plan` asks first** because completion triggers write-back
  comments on any mirrored tracker issues linked to the plan.
- Pair it with a GitHub/GitLab connection and the PR statuses you log here
  keep themselves current on every sync.
