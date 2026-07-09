# Linking Design Specs to Plans & Work Items

CodePlans deliberately does **not** include a spec editor. Specs live in git,
next to the code they describe, and CodePlans links to and renders them
read-only. This gives you version history, PR review of spec changes alongside
implementation, and specs that agents (via MCP) can read in-repo — while
CodePlans stays the map, not the wiki.

## The three-layer model

| Layer | Lives in | Owned by |
|---|---|---|
| **Summary** — problem, approach, out-of-scope, in 2–5 paragraphs | Plan / work item *description* | CodePlans |
| **Spec** — the full design doc | `docs/specs/<slug>.md` in the asset's repo | git (reviewed via PRs) |
| **Link + rendering** — `Spec URL` field | Plan / work item | CodePlans displays, never edits |

## Recommended convention

1. Keep specs in your repository at `docs/specs/`, one markdown file per plan-sized
   design (this repo does exactly that — see its own `docs/specs/`).
2. Author and evolve the spec through pull requests, ideally the same PR as the
   code change it describes.
3. Paste the file's **blob URL** into the plan or work item's *Spec URL* field:
   - GitHub: `https://github.com/org/repo/blob/main/docs/specs/my-feature.md`
   - GitLab: `https://gitlab.com/group/project/-/blob/main/docs/specs/my-feature.md`

## In-app rendering

Plan detail pages render the linked markdown in a read-only **Design Spec** card:

- **Public GitHub** files render automatically.
- **Private repos** render when an [integration connection](../index.html#integrations)
  covers the repo — the connection's token fetches the file (GitHub and GitLab,
  including self-hosted GitLab). Nothing is stored; the file is fetched fresh
  from the default branch (or the ref in the URL) on each view.
- Anything else — Notion, Confluence, Google Docs — works as a plain link-out.
  The field takes any URL.

Work item panels render the linked markdown too (collapsible, read-only,
fetched through the same rules). A connection created **only** for spec
rendering is fine — nothing syncs until you press &ldquo;Sync now&rdquo;, and its card
shows &ldquo;serving as docs credential&rdquo; until it first syncs.

## Setting the spec from an agent (MCP)

The MCP tools accept `specUrl` on `create_code_plan`, `update_code_plan`,
`create_work_item`, and `update_work_item`, and `get_code_plan` returns it.
A typical Claude Code flow:

```
Write the design to docs/specs/goal-b-routing.md and open a PR for it. Then use
codeplans MCP: create a plan "Goal B: declarative routing" targeting the server
asset, and set specUrl to the file's blob URL on the feature branch.
```

The agent that writes the spec registers it — and any agent later assigned work
on the plan gets the spec's location from `get_code_plan` and reads it in-repo.

## Why not descriptions or a built-in editor?

Long specs in description fields can't be diffed, reviewed, or versioned, and
for items mirrored from external trackers the description is tracker-owned
(sync would overwrite it). A built-in editor would duplicate what git + your
docs tool already do better — see the scope fence in
[design-spec-v3](../specs/design-spec-v3.md) §4.6.
