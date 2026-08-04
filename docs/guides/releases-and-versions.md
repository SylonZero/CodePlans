# Releases & Versions

A **release** groups the code plans that ship together — a version of one asset
(*Admin App v1.2.0*) or a coordinated revision of several assets that work with
each other. It's the layer above plans: plans coordinate the PRs; the release
records what shipped, at which versions, and why.

Releases are deliberately **not** sprints or roadmap items. There are no target
dates, no ranking, no burndown — just a name, a status
(`planned → in progress → shipped`), and the facts of delivery. Prioritization
ceremony belongs in your PM tool; CodePlans records what actually happened.

## The workflow

1. **Create a release** (`Releases → New Release`): name it after what ships —
   `Admin App v1.2.0`, `Auth revamp — spring drop`.
2. **Attach plans.** A plan belongs to at most one release; attach from the
   release's *Plans* tab or via the "ships in" picker on the plan itself. The
   plans' linked work items automatically become the release's derived rollup.
3. **Stamp asset versions.** The *Assets & Versions* tab suggests every asset
   targeted by the attached plans; give each the version this release takes it
   to. A release can also version an asset no plan touched (a docs-only bump)
   or exclude an incidentally-touched one.
4. **Ship it.** *Mark Shipped* confirms — listing any assets still missing a
   version stamp — then freezes the release read-only. Shipping is a human
   act: it never happens automatically, and shipped releases only reopen via
   an explicit action.

## What you get for free

- **Release notes, derived.** The *Work Items* tab groups everything the
  attached plans delivered — Features / Bugs & UX / Tech Debt — which *is* the
  release-notes structure. *Copy release notes* renders it as markdown; with
  [AI drafting](ai-agents.md#ai-drafting) enabled, *Draft release notes*
  writes prose from the same facts, into an editor you control.
- **Version history on every asset.** Each shipped release stamps version tick
  marks into its assets' [History timelines](asset-history.md) — the release
  is one chapter across many assets; the asset history is one asset across
  many chapters.
- **PR context.** Per-asset branch/PR chips from the attached plans roll up
  onto the release's asset rows, so "what delivered this version" is one click
  deep.

## Conventions that work well

- **Version strings are yours.** CodePlans orders history by time and never
  parses versions — semver, dates, build numbers all work. Pick one convention
  per asset and stay with it.
- **One release per logical drop.** If two plans genuinely ship independently,
  give them separate releases; the value of the record is that "shipped
  together" means something.
- **Work items link to plans, not releases.** There's no direct work-item ↔
  release link by design — the plan link is the single source of truth for how
  demand reached delivery, and the release derives from it.

## Via MCP

Agents can run the whole lifecycle: `create_release`,
`attach_plan_to_release`, `set_release_asset` (version stamps),
`ship_release` (warns on unversioned assets), and `get_release` for the full
derived rollup. Shipped releases are read-only at the tool layer too — the
record stays trustworthy. See [Working with AI Agents](ai-agents.md).
