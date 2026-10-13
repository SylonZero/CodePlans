---
name: codeplans-spec
description: Read, create, revise or supersede a CodePlans spec and connect it to the assets, work items and plans it governs. Use when implementing against a spec, writing a new spec, or when the code has diverged from a spec and the spec needs updating.
---

# Work with CodePlans specs

Uses the CodePlans MCP server. If its tools (such as `get_spec`) aren't
available, stop and tell the user to connect CodePlans first: create a key
under **Settings → API Keys** and run
`claude mcp add --transport http codeplans https://<your-codeplans>/api/mcp/mcp --header "Authorization: Bearer cpk_…"`.

Specs are product-owned, versioned markdown documents. CodePlans owns the
body; a git URL is only provenance.

## Before implementing a spec

1. Find it: `list_specs(productId)` or `search` with `types: ["spec"]`.
2. `get_spec` for the current body, version, status, supersession pointers
   and associations. Implement against the current version, and note it.
3. If the spec is `draft` or `in_review`, tell the user: it may not be agreed
   yet.

## Writing a new spec

1. `create_spec` with `productId`, `title`, `body` (GitHub-flavoured
   markdown), `specType` (`feature`, `ux`, `api`, `schema`, `architecture`,
   `workflow`, `test`, `integration`, `ops` or the team's own label) and
   optional `area`. New specs start as `draft`. When importing a file from
   the repo, pass `sourceType: git_import` and `sourceUrl`; the spec then
   starts in review for a person to check.
2. `link_spec` to every asset, work item and plan it governs. Plan links
   declare a `relationshipType`: `creates` (the plan builds it), `revises`
   (the plan changes it) or `references`. Asset and work item links take
   none. Link a shared spec rather than copying its text into plan
   descriptions.

## Changing a spec

- **Revision** (same approach, updated details): `update_spec` with the new
  `body`, a `changeSummary`, and `expectedVersion` set to the version you
  read, so a concurrent edit is rejected rather than overwritten. Changing
  the title or body creates a new version, and approvals of the old text go
  stale.
- **New approach**: `supersede_spec` with `oldId` and `newBody`. It creates a
  new draft, carries the associations over, and marks the old spec
  superseded.
- **Status only**: `update_spec` with `status` saves in place without a new
  version. Don't activate a spec on the user's behalf unless they ask.
- If the change comes with finished work on an asset, prefer
  `record_design_note` with `revisesSpecId` and `revisedSpecBody` (see
  `/codeplans-close-plan`) so the note and the revision are linked.

Never write `specUrl` on a plan or work item; it is deprecated.
