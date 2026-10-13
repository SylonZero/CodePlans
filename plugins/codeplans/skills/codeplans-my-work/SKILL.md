---
name: codeplans-my-work
description: Show what is waiting on the user in CodePlans (reviews to give, tasks in flight, work assigned to them, unread notifications) and help pick the next thing to do. Use when the user asks what they should work on, what's on their plate, or to catch up on CodePlans.
---

# What's on my plate in CodePlans

Uses the CodePlans MCP server. If its tools (such as `get_my_work`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

1. `get_my_work` (optionally for one `productId`). It returns the same bands
   as the My Work page: `needsYou` (each with a verb, the reason it's theirs
   and a link), `inFlight` (tasks grouped by plan, plans they own, specs
   they're writing) and `watching`.
2. `list_notifications` for anything unread that isn't already covered.
3. Summarise briefly, most urgent first: what needs them (reviews, decisions,
   blocked tasks), then what's in flight. Include links. Don't dump raw
   lists.
4. Suggest the next thing to pick up and offer to start it. When they choose
   a task or plan, read it with `get_code_plan` and, for the assets involved,
   follow `/codeplans-context`.
5. Only call `mark_notifications_done` for the notifications the user says
   they've dealt with.
