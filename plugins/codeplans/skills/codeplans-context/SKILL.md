---
name: codeplans-context
description: Before changing code, read what CodePlans knows about the assets involved (owners, dependents, history, design notes, specs, known debt and open issues). Use when starting work on a package, service or area of the codebase, or when the user asks why something is the way it is.
---

# Load context from CodePlans before a change

Uses the CodePlans MCP server (read-only tools). If its tools aren't
available, say so and continue without it; suggest connecting CodePlans with
a key from **Settings → API Keys**.

1. **Identify the assets.** Match the folders you're about to change against
   asset `repoPath`s: `list_products`, then `get_product`. `search` finds an
   asset, plan or work item by name.
2. **Read each asset's story:**
   - `get_asset`: owners, dependency edges in both directions (who depends on
     it is your blast radius), and the plans touching it now.
   - `get_asset_history`: releases, delivered plans, design notes, debt
     movement, and spec arrivals and revisions.
   - `get_asset_record`: what the asset does today (capabilities with their
     delivery lineage), open known issues, and active specs.
   - `get_tech_debt_register` for the product: what's known to be rotten.
3. **Check for work in flight**: `list_code_plans` for the product. If an
   active plan already covers this change, use it rather than starting a
   parallel effort, and read it with `get_code_plan`.
4. **Read the specs** that govern the change with `get_spec`.

Summarise for the user before you start: who owns it and who depends on it,
the decisions recorded in design notes that constrain the change, the specs
that apply, debt and open issues you'll touch, and any overlapping plan. Keep
it short, and quote the design notes that matter.

Don't write anything. Recording the work afterwards is `/codeplans-log`'s
job.
