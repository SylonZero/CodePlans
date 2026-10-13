---
name: codeplans-log
description: Record the engineering work from this session or branch in CodePlans (code plan, tasks, branch and PR status, work items for debt and follow-ups). Use at the end of a coding session, after opening a PR, or whenever the user asks to log, document or track the work in CodePlans. Safe to re-run.
---

# Log this work in CodePlans

Uses the CodePlans MCP server. If its tools (such as `list_code_plans`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

Document the work discussed in this session. If there is none, inspect the
current branch: its log, the diff against the default branch, and any open
PR/MR. Then:

1. **Find the product and assets**: `list_products`, then `get_product`. If an
   asset that was clearly worked on is missing, tell the user. Don't create
   assets here; that's `/codeplans-model`'s job.
2. **Find or create the code plan**: call `list_code_plans` first, and update
   a matching plan rather than creating a duplicate. For a new plan
   (`create_code_plan`): a type that fits the change; a description of 2-5
   paragraphs (problem, approach, out of scope); `targetAssetIds` for every
   asset the change touches. If the repo holds a spec document for the change,
   store it with `create_spec` and connect it with `link_spec`
   (`relationshipType` `creates`, `revises` or `references`). Never write a
   plan's `specUrl`; it is deprecated.
3. **Record delivery**: `update_plan_asset` for each targeted asset with the
   branch, PR/MR URL, `prStatus` and a short note. In a monorepo, put the PR
   URL on the primary asset and use `notes` on the others. Call
   `activate_plan` if work is underway.
4. **Tasks**: `create_task` for each completed or planned piece of work
   (assign by email where known), then `update_task_status` to `done` for
   what has landed.
5. **Work items**: `create_work_item` for anything discovered but not done:
   `tech_debt` (with `assetId` and `area`) for known gaps, `bug` for defects,
   `feature` or `enhancement` for follow-ups. Link the ones this plan
   addresses with `link_work_item_to_plan`. Leave explicit non-goals unlinked
   and open.
6. If the plan's work is fully shipped and merged, ASK before calling
   `complete_plan`: it posts comments to linked tracker issues. After
   completion, `/codeplans-close-plan` records design notes.
7. Finish with `get_code_plan` and show the user the result to verify.
