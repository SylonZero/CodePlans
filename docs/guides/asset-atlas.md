# The Asset Atlas

Open **Assets** in the sidebar and you get the whole architecture on one
screen: every asset across your products (or one product, when the global
product filter is set), with three ways to look at it — a **Map**, a card
**Grid**, and a sortable **Table**. A stats strip totals health, open debt,
and active plan targets; search matches names and tags; type and health
filters apply to all three views.

The design principle is the same one that drives asset history and release
notes: **derived, not drawn.** The map is a projection of the asset inventory
and dependency edges your team already maintains to run its work — not a
diagram anyone has to keep in sync. Add an asset and it appears; record a
dependency and the edge draws itself; ship a release and the version chip
updates. It cannot rot, because it is not a document.

## The Map

Columns are **products or layers** — a toggle in the toolbar. With several
products in scope the map defaults to product columns; when the scope is a
single product (the global product filter, or an org with one product) it
automatically switches to **layer columns**, since one product would be one
column. Layers order edge → frontend → backend → domain → data → infra →
shared, which matches typical dependency flow. An asset's layer is set on
the asset (or over MCP); unset layers default sensibly from the asset type —
see the [concepts guide](concepts.md) for the boundary thinking.

Assets render as nodes. Each node carries its type icon,
name, and the version stamped by the latest shipped release. Dependency edges
draw as curves between nodes, with the line style telling you the
relationship:

| Style | Meaning |
|---|---|
| ─── solid | depends on |
| – – dashed | integrates with |
| ··· dotted | aggregates |

The arrowhead points at the asset being depended on.

### Lenses

One map, three questions. The lens pills recolor every node's accent:

- **Health** — the manually assessed health flag (healthy / warning /
  critical). *Where is the system hurting?*
- **Debt** — the effective tech-debt score (manual override, or
  severity-weighted from open tech-debt items). Green under 25, amber to 50,
  red beyond. *Where is the debt concentrated?*
- **Activity** — assets currently targeted by active code plans light up;
  quiet assets stay muted. *Where is work happening right now — and what is
  nobody touching?*

### Blast radius

Hover any asset: its dependency edges and direct neighbors stay lit while the
rest of the map dims. That is the question every change starts with — *what
does this touch?* — answered before you open a plan. Click through to land on
the asset's detail page, where the [Record](asset-history.md) says what it
does and History says how it got there.

## Grid & Table

The **Grid** shows each asset as a card: health dot, version chip, active
plan / open debt / capability counts, a debt-score bar, and owner avatars —
the browsing view. The **Table** is the dense view: sortable by name,
product, debt score, active plans, or last-shipped date. Sorting by debt
descending is the de-facto debt review; sorting by last shipped ascending
finds what has not moved in months.

## Where the data comes from

| On the map | Maintained in |
|---|---|
| Nodes | Assets, created on product pages or via MCP (`create_asset`) |
| Edges | Asset dependencies (asset detail → Dependencies, product pages, or `add_asset_dependency`) |
| Version chips | Release version stamps ([releases](releases-and-versions.md)) |
| Health colors | The asset `health` flag |
| Debt colors | Open tech-debt work items (or a manual score override) |
| Activity | Active code plans targeting the asset |

A sparse map is a prompt, not a failure: if the Atlas looks emptier than your
real system, the fastest fix is an agent-driven modeling pass — see
[Modeling Monorepos](modeling-monorepos.md) and the MCP
[modeling tools](ai-agents.md).

## What's next

The map is a picture today; the
[Asset Atlas spec](../specs/asset-atlas-spec.md) lays out its path to an
instrument: lens thresholds that focus the map on what matters (Phase B),
transitive blast radius with a "who to notify" rail (Phase C), and starting a
plan directly from the map with its impact visible before the first task is
written (Phase D).
