# Asset History & the Design Log

Open any asset and the **History** tab shows its story, newest first: releases
that shipped it (with version tick marks), plans delivered to it (with their
branch/PR chips), work items resolved against it, tech-debt opened and paid
down, and design notes recorded along the way. A sticky **version ladder**
anchors into the timeline; the asset header shows the current version from the
latest shipped release.

The design principle: **history that must be manually maintained will rot;
history projected from work already recorded cannot.** Almost everything on
the timeline is derived from data you were already entering — plans, work
items, releases. The one authored layer is the design log.

## What appears automatically

| Entry | Source |
|---|---|
| 🚀 Version stamp | A shipped [release](releases-and-versions.md) that versioned this asset |
| 📋 Plan delivered | A completed plan that targeted the asset (`code_plan_assets`), with branch/PR chips |
| ✅ Work item resolved | A resolved feature/bug/UX item with this asset set |
| ↑ / ↓ Debt movement | Tech-debt items opened or resolved on the asset; each version segment shows its net debt delta |

Anything not yet shipped in a release accrues under an **Unreleased** segment
at the top — visible drift is the nudge to cut the next release.

## The design log

Derived history says *what changed*; the design log says *what it meant*. A
design note is a short, durable entry — "moved retry logic behind the outbox,
because…" — anchored optionally to the release and/or plan that motivated it.

- **Add design note** on the History tab: title, markdown body, optional
  release/plan anchors.
- Notes render inline in the timeline with an expandable body and full
  attribution. Notes recorded by coding agents carry an **agent badge** plus
  the API key owner's name — machine-drafted, human-verifiable.
- The asset's freeform *Notes* document is unchanged and complementary: it's
  the forward-looking scratchpad; the design log is the backward-looking
  record.

## Let your agents keep it

The highest-leverage habit: the coding agent that just implemented a plan is
the best-informed author of "what this changed about the asset's design," at
exactly the moment it knows. The MCP `record_design_note` tool exists for
this, and its description prompts agents to record one note per significantly
changed asset after completing a plan. Before starting new work, agents can
call `get_asset_history` to read the asset's whole story in one call.

With [AI drafting](ai-agents.md#ai-drafting) enabled, the design-note panel
can also draft a note from a completed plan's context — into the editor, for
your review, never auto-saved.

## Where this is heading

History is the diary. The next step —
[the Asset Record](../specs/asset-record-spec.md) — is the current-state
document: a capabilities register graduated from delivered work, kept honest
by agent-driven reconciliation against the code itself.
