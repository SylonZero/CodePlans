---
name: codeplans-close-plan
description: Close out a finished CodePlans code plan. Confirms delivery, completes the plan, records a design note on each significantly changed asset (revising linked specs), and graduates resolved features into the asset record. Use when a plan's PRs have merged and the user wants to wrap it up.
---

# Close out a code plan

Uses the CodePlans MCP server. If its tools (such as `get_code_plan`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

1. **Find the plan**: the one discussed, or `list_code_plans` with status
   `active`. Read it with `get_code_plan`.
2. **Check it's really done.** Every target asset should have a merged PR
   (`update_plan_asset` with `prStatus: merged` where you can confirm it) and
   every task should be `done` or deliberately dropped. Report anything open
   and ask how to proceed. Unfinished pieces can become work items
   (`create_work_item`) rather than blocking completion.
3. **Resolve delivered work items**: `update_work_item_status` to `resolved`
   for the linked items this plan delivered.
4. **Complete**: ASK before calling `complete_plan`, because it posts
   completion comments to linked tracker issues.
5. **Design notes**: for each significantly changed asset,
   `record_design_note` with `assetId`, `codePlanId`, a `title`, and a one
   paragraph `body` on what changed structurally and why. Skip assets with
   only trivial changes. If the work changed what a linked spec says, pass
   `revisesSpecId`, `revisedSpecBody` (the full updated markdown) and
   `expectedSpecVersion` (read with `get_spec`), so the note and the spec
   revision are saved together.
6. **Graduate capabilities**: for each resolved `feature` or `enhancement`
   item, `graduate_work_item` puts it in the asset's capabilities register
   with its delivery lineage. When the item has several linked specs, pass
   `sourceSpecId`. Graduating again is harmless; it returns the original
   record.
7. Show the user the closed plan and the notes recorded. If the plan belongs
   in a release, suggest `/codeplans-release`.
