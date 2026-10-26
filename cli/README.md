# @codeplans/cli

[CodePlans](https://github.com/SylonZero/CodePlans) from your terminal. Check what's waiting on you, script workspace setups, and drive plans, tasks and work items from shell scripts and CI.

```bash
npm install -g @codeplans/cli
codeplans login --url https://acme.codeplans.app --key cpk_…   # key from Settings → API Keys
codeplans me
```

```text
codeplans products                       # products with counts
codeplans plans --status active          # plans with progress
codeplans items --product web --type bug # work items
codeplans search billing retry           # search everything
codeplans plan create --product web --title "Retry payouts" --asset "Payments API"
codeplans task add <planId> "Add retry queue" --priority high
codeplans apply workspace.json --dry-run # set up products, assets, dependencies, people
codeplans call <any MCP tool> --arg key=value
```

Every command takes `--json`. In CI, set `CODEPLANS_URL` and `CODEPLANS_API_KEY` instead of logging in. Exit codes: `0` success, `1` failed, `2` usage, `3` not connected or key refused.

Node.js 20 or later; no other dependencies. The full guide, including the `apply` manifest format, is [docs/guides/cli.md](https://github.com/SylonZero/CodePlans/blob/master/docs/guides/cli.md).

MIT licensed.
