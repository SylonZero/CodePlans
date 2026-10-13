# Modeling a Monorepo in CodePlans

How to break a large codebase — especially a monorepo with many shared
libraries — into products, assets, and dependency edges without drowning in
over-modeling.

## The asset test

Model something as an asset **only** if:
- code plans will target it, or
- tech debt will be registered against it, or
- it needs to appear in blast-radius (impact analysis) reports.

Assets are *coordination units*, not a folder inventory.

## Tiered breakdown

| Tier | Rule | Example |
|---|---|---|
| Apps | always an asset | `repoPath: apps/web` |
| Services | always an asset (deployable units, incl. internal/MCP services) | `repoPath: services/mcp` |
| Keystone libraries | own asset **only** for high-fanout / high-churn libs — typically 5–8 | UI kit, data-access, auth, shared schema |
| Long-tail libraries | cluster into 2–4 domain-group assets | "Shared Libs — Domain Utils", `repoPath: packages/` |

A ~40-package monorepo should land at **12–15 assets**. Inside a cluster, use
the work item **`area`** field (e.g. `packages/date-helpers`) for lib-level
precision — the tech debt register stays exact without a permanent graph node.

**Promote on signal:** when one clustered lib keeps accumulating debt items or
becomes a plan target, split it out then. Promoting later is cheap; pruning 25
stale assets is not.

## Dependency edges: coordination risk, not the import graph

Your build tool already knows every import. In CodePlans, add an edge only
where a change **forces cross-asset coordination** — "every app depends on UI
Kit", "MCP service depends on data-access". Twenty curated edges beat two
hundred stale ones; impact analysis is only trusted when it's curated.

## Products are planning boundaries

Not repo boundaries. A monorepo hosting several products is fine; shared
platform libraries serving multiple products belong in a dedicated **Platform
product** — cross-product dependency edges and impact analysis work.

## One monorepo caveat

PRs are per-repo, so a cross-library plan inside one monorepo shares a single
PR across its plan-asset rows. Put the PR URL on the primary target and use
`notes` on the others. This argues for *fewer* assets, not more.

## Let Claude do it (MCP)

The MCP server embeds this guidance: agents get the short form in the
`create_asset` / `add_asset_dependency` tool descriptions and the full
heuristic from the **`get_modeling_guide`** tool.

Install the `/codeplans-model` skill with the other
[CodePlans agent skills](agent-skills.md):

```sh
npx skills add SylonZero/CodePlans --skill codeplans-model
```

or, in Claude Code, `/plugin marketplace add SylonZero/CodePlans` then
`/plugin install codeplans@codeplans`. Run `/codeplans-model` inside any repo.
It is **safe to re-run** as the repo grows: it diffs the inventory against the
existing product and proposes only the delta (new assets, keystone
promotions, missing edges, moved folders) — and `create_asset` is idempotent
by (product, name) server-side, so duplicates can't happen even outside the
skill. The skill text is in
[`plugins/codeplans/skills/codeplans-model/SKILL.md`](../../plugins/codeplans/skills/codeplans-model/SKILL.md).

**Model vs. log:** structural change (new packages, moved folders) is this
skill's job. *Engineering work* — features shipped, PRs opened, debt found —
belongs to its companion, [`/codeplans-log`](logging-work.md), which runs at a
different cadence: reconcile the model occasionally, log work constantly.

The proposal step (3) is the important one — you approve the model before the
agent writes anything.

## Specs as asset aspects

An asset can have multiple product-owned specs. Use an open `specType`
(`feature`, `ux`, `test`, `workflow`, `schema`, `api`, `architecture`,
`integration`, `ops`, or your own label) and optional `area` for finer scope.
Link a shared spec to every applicable asset, work item, and plan; do not copy
its body into plan descriptions. Plan links declare creates/revises/references.
See [native specs](using-specs.md) for versioning and delivery receipts.
