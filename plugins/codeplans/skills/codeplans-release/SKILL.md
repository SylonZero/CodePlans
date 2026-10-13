---
name: codeplans-release
description: Create or ship a CodePlans release, attach the code plans it delivers and stamp asset versions. Use when the user is cutting a release, tagging versions, or asks what is going out in the next release.
---

# Manage a release in CodePlans

Uses the CodePlans MCP server. If its tools (such as `list_releases`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

1. **Find or create the release**: `list_releases` for the product. Reuse an
   open (planned or in progress) release with the right name; otherwise
   `create_release` with `productId`, `name` and an optional `description`.
2. **Attach plans**: `list_code_plans` for the product, then
   `attach_plan_to_release` for each plan this release delivers. A plan
   ships in at most one release. Confirm the list with the user when it isn't
   obvious.
3. **Stamp versions**: for each asset the release changes,
   `set_release_asset` with `releaseId`, `assetId` and `version` (read it from
   the package manifest, tag or changelog), plus optional `notes`.
4. **Review**: `get_release` shows the attached plans and the work items they
   deliver; the release notes derive from those. Show the user and point out
   assets without a version stamp or plans that aren't completed.
5. **Ship**: ASK before calling `ship_release`. It records the release in
   each stamped asset's history, and a shipped release is read-only.
