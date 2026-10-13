---
name: codeplans-model
description: Inventory this repository or monorepo and model it in CodePlans as a product, assets and dependency edges. Use when the user wants to set up CodePlans for a repo, or when packages were added, moved or removed and the model needs reconciling. Safe to re-run.
---

# Model this repo in CodePlans

Uses the CodePlans MCP server (tools such as `get_modeling_guide`). If those
tools aren't available, stop and tell the user to connect CodePlans first (see
"Connecting" at the end).

1. Call `get_modeling_guide` and follow it strictly.
2. Inventory this repository: read the workspace config (pnpm-workspace.yaml,
   nx.json, turbo.json, or the package layout) and identify apps, services and
   libraries. Classify libraries as keystone (high fan-out or high churn) or
   long tail, and group the long tail into 2-4 domain clusters.
3. Reconcile before proposing: call `list_products`, and if the target product
   exists, call `get_product` and diff the inventory against its assets and
   dependency edges. The proposal must contain ONLY the delta:
   - new assets (or a note that a new package belongs inside an existing
     cluster, which needs no asset change)
   - keystone promotions: a clustered library that has grown high fan-out or
     high churn
   - missing coordination-risk edges, and `repoPath` corrections for moved
     folders
   - assets whose folders no longer exist: FLAG these for manual review in the
     UI. Never attempt deletion.
   On a first run against an empty or absent product, the delta is everything.
4. Propose the delta to the user and WAIT for approval. Apply their
   corrections.
5. On approval: `create_product` if needed, then `create_asset`,
   `update_asset` and `add_asset_dependency` as approved. `create_asset` is
   idempotent by (product, name), so a re-run cannot create duplicates.
6. Verify with `get_product` and show the resulting asset list and dependency
   count.

Structural change (new packages, moved folders) belongs here. Engineering work
(features shipped, PRs opened, debt found) belongs to `/codeplans-log`.

## Connecting

Create an API key in CodePlans under **Settings → API Keys** (read/write
scope to make changes), then:

```sh
claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp \
  --header "Authorization: Bearer cpk_your_key"
```

Installing the `codeplans` Claude Code plugin sets this up for you.
