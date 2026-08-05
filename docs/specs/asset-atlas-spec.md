# Asset Atlas — Design Spec

> **Status: PHASE A SHIPPED `v0.4.5`; Phases B–D PROPOSED** (2026-08).
> Companion to `asset-record-spec.md` (the record is what a node *is*; the
> Atlas is where it *sits*) and `design-spec-v3.md`. Reuses the existing data
> layer, access model, and MCP conventions unchanged.

---

## 1. Purpose & Positioning

Assets are the main work surface of CodePlans — work items target them, plans
change them, releases version them, records describe them — yet until v0.4.5
they were only reachable by drilling through a product. The Atlas gives assets
a first-class home, and stakes out a claim no tracker makes:

**The architecture diagram that cannot rot.** Every team has a system diagram
somewhere — a whiteboard photo, a Miro board, a wiki page — and every one of
them is wrong within a quarter, because diagrams are *documents* maintained
beside the system. The Atlas is not a document. It is a *projection* of the
asset inventory and dependency edges the team already maintains to run its
work. Add an asset, it appears; record a dependency, the edge draws; stamp a
release, the version chip updates. The map is correct for the same reason the
release notes are correct: it is derived, not drawn.

The design direction across all phases: evolve the map from a **picture**
(Phase A: see the system) into an **instrument** (Phase B: interrogate it)
into a **planning surface** (Phases C–D: act on it). Each phase keeps the
derived-not-drawn rule — the map never stores layout, annotations, or state of
its own beyond ephemeral view preferences.

### Litmus test

An engineer new to the team opens `/assets`, and within one minute can answer:
*what services exist, which ones are in trouble, what would break if I changed
this one* — then click once more and read what that asset actually does (its
Record). When planning a change, the same map is where the plan starts, with
its blast radius visible before the first task is written.

---

## 2. Phase A — The Atlas `v0.4.5` ✅ SHIPPED

Summarized for reference; see `docs/app-spec.md` (`/assets`) for the
authoritative current state.

- **Route & nav**: `/assets`, sidebar entry between Products and Work Items.
  Respects the global product scope and `?product=`.
- **Three views**: Map (default), Grid (cards), Table (sortable). Shared
  stats strip, name/tag search, type + health filters.
- **Map**: products as columns, assets as nodes (type icon, name, latest
  shipped-version chip), `asset_dependencies` edges as curves — solid
  *depends_on*, dashed *integrates_with*, dotted *aggregates*, arrowhead at
  the target. **Lenses** recolor node accents by Health, Debt (effective
  score, thresholds 25/50), or Activity (active plan targets). Hovering an
  asset highlights its edges + direct neighbors and dims the rest; click
  navigates to the asset.
- **Layout**: deterministic, hand-rolled — barycenter-ordered columns, HTML
  nodes over an SVG underlay. No graph library, no stored positions.
- **Data**: `getAssetInventory(userId, { productId? })` — org-scoped assets
  with effective debt score, open item/debt counts, active plan targets,
  capability count, latest shipped version stamp, owners, plus the dependency
  edges among them (edges leaving the scope are dropped so the map always
  matches the node set).

---

## 3. Phase B — Focus mode: lens thresholds & map filtering (PROPOSED)

A lens currently *colors* every node; focus mode lets it *select*. The
question changes from "where is the debt?" to "show me only what matters and
its context."

### UX

- Each lens gains an optional **threshold control** rendered beside the lens
  pills when that lens is active:
  - Health: `all · warning+ · critical`
  - Debt: `all · ≥25 · ≥50`
  - Activity: `all · active · quiet` (quiet inverts — find the unmaintained)
- With a threshold set, the map enters **focus mode**: matching nodes render
  full-strength, their direct neighbors render half-dimmed (context), and
  everything else collapses to small dots so column shape is preserved
  without noise. Edges not touching a matching node fade to near-invisible.
- The stats strip re-counts to the focused set (`4 of 15 assets in focus`).
  Grid and Table honor the same threshold as a plain filter — focus mode is
  a map rendering, not a separate data path.
- Search composes: a search query in focus mode intersects.

### Non-goals

No saved "views", no per-user map state beyond the existing persisted view
preferences mechanism. Focus is a transient question, not a dashboard.

---

## 4. Phase C — Transitive blast radius (PROPOSED)

Hover today shows direct neighbors — depth 1. Real incidents propagate.

### UX

- **Click-to-pin** an asset (hover stays as-is): the map enters **radius
  mode** with the pinned asset marked. A depth control appears:
  `direct · +2 · full closure`.
- Downstream (dependents — who breaks) renders in the warning hue; upstream
  (dependencies — who I lean on) renders muted; depth is shown on each edge
  ring. The two directions are visually distinct because the questions are
  different: *who do I hurt* vs *who can hurt me*.
- A side rail lists the closure grouped by depth with owner avatars — the
  "who to notify" list, copyable. Rows link to the asset; each row shows the
  path (`Atlas → BFF → Mobile App`) on hover, since the *route* of the
  impact is the reviewable claim.
- Pinning composes with lenses (radius selects, lens colors) but suspends
  Phase B focus mode — one selection mechanism at a time.
- `Esc` or clicking the canvas unpins.

### Data

Transitive closure is computed client-side by BFS over the already-shipped
edge list — no new queries. Cycles are handled by visited-set; depth is the
shortest path. The existing `getImpactedAssets` (plan impact, depth 1) is
unchanged; if plan detail later wants transitive impact, it reuses this
traversal, not a new endpoint.

---

## 5. Phase D — The map as planning surface (PROPOSED)

The Atlas closes the loop back into the core object model: plans start where
their blast radius is visible.

### UX

- A **"Plan a change"** affordance on the map toggles target-selection mode:
  clicking nodes multi-selects them as prospective plan targets (selection
  chips accumulate in a floating bar).
- The bar live-renders the union blast radius of the selection (Phase C
  traversal, depth configurable) — *before a plan exists*, the cost of the
  change is on screen.
- **"Create plan"** opens the existing plan-create side panel pre-filled:
  target assets = selection; product inferred when the selection is
  single-product (multi-product selections offer the plan-per-product split
  the model requires); the impact list is included in the description
  scaffold as a checklist of assets to review, each with owners.
- After creation, the map renders the new plan's targets with the standard
  Activity-lens treatment. No plan geometry is stored — the plan is the
  record; the map re-derives.

### MCP

One new read tool when Phase C/D land (not before):
`get_asset_map(productId?)` returning the same shape the Atlas consumes —
nodes with stats plus edges — so agents can answer "what breaks if X
changes" and scaffold plans with the same blast-radius reasoning the UI
shows humans. Write flows stay on the existing `create_code_plan` /
`add_plan_asset` tools.

---

## 6. Explicitly Out of Scope

- **Stored layout or annotations** — no dragging nodes, no sticky notes, no
  saved positions. The moment layout is stored, the map is a document again
  and starts rotting. (Deterministic layout is also what keeps two teammates'
  maps identical.)
- **A general graph editor** — edges are created where they are owned today
  (asset detail / product dependency views / MCP), not by drawing on the map.
- **Runtime topology** (service mesh, tracing, live traffic) — the Atlas maps
  the *declared* architecture. Reconciling declared vs observed topology is
  agent territory, and belongs beside the record's reconciliation phases
  (`asset-record-spec.md` Phase B), not here.
- **Cross-org or public sharing** of maps.

---

## 7. Sequencing

Phases B–D are deliberately unversioned: they slot into the 4.x line as
capacity allows, interleaved with the asset-record reconciliation work
(`v0.4.6+`), which remains the strategic priority. B is small and can ride
along with any release; C unlocks D and should precede it; D touches the
plan-create flow and deserves its own release.
