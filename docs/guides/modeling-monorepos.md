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

Save this as a Claude Code skill at `~/.claude/skills/codeplans-model/SKILL.md`,
then run `/codeplans-model` inside any repo. It is **safe to re-run** as the
repo grows: it diffs the inventory against the existing product and proposes
only the delta (new assets, keystone promotions, missing edges, moved
folders) — and `create_asset` is idempotent by (product, name) server-side,
so duplicates can't happen even outside the skill:

```markdown
---
name: codeplans-model
description: Inventory this repo/monorepo and model it in CodePlans (products, assets, dependency edges) via the codeplans MCP server.
---

Using the codeplans MCP server:

1. Call get_modeling_guide and follow it strictly.
2. Inventory this repository: read the workspace config (pnpm-workspace.yaml,
   nx.json, turbo.json, or package layout) and identify apps, services, and
   libraries. Classify libraries into keystone (high-fanout/high-churn) vs
   long-tail, and group the long tail into 2-4 domain clusters.
3. Reconcile before proposing: call list_products, and if the target product
   exists, call get_product and diff the inventory against its existing assets
   and dependency edges. The proposal must contain ONLY the delta:
   - new assets (or note when a new package belongs inside an existing cluster
     — that needs no asset change)
   - keystone promotions: a clustered lib that has grown high-fanout/high-churn
   - missing coordination-risk edges; repoPath corrections for moved folders
   - assets whose folders no longer exist — FLAG these for manual review in the
     UI (never attempt deletion; deletes are UI-only)
   On a first run against an empty/absent product, the delta is everything.
4. Propose the delta to me and WAIT for approval; apply corrections.
5. On approval: create the product if needed, then create_asset /
   update_asset / add_asset_dependency as approved.
6. Verify by calling get_product and show me the resulting asset list and
   dependency count.
```

**Model vs. log:** structural change (new packages, moved folders) is this
skill's job. *Engineering work* — features shipped, PRs opened, debt found —
belongs to its companion, [`/codeplans-log`](logging-work.md), which runs at a
different cadence: reconcile the model occasionally, log work constantly.

The proposal step (3) is the important one — you approve the model before the
agent writes anything.
