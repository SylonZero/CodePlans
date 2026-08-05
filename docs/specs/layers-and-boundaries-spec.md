# Layers & Model Boundaries — Design Spec

> **Status: PROPOSED** (2026-08), targeting `v0.4.6`. Companion to
> `asset-atlas-spec.md` (this supplies the Atlas's second grouping axis) and
> the concepts guide (`docs/guides/concepts.md`, which states the boundary
> rule this spec operationalizes). Shifts asset-record reconciliation to
> `v0.4.7+` — and serves it: reconciliation agents will propose *structural*
> corrections too, and `move_asset` is the tool they need.

---

## 1. Problem

Between a product and its assets there is room for interpretation, and real
instances land on both sides of it. The demo dataset models a portfolio
(three products that genuinely ship separately); a production single-SaaS
instance correctly models **one product with ~40 assets** — and gets a
degenerate Atlas (one column), no vocabulary for internal structure, and no
supported way to refactor the model if the first pass drew a boundary wrong.

Three gaps, one tranche:

1. **Guidance** — the product-vs-asset rule exists in heads, not in the tool.
   For agent-driven modeling, guidance must live in the MCP tool layer.
2. **Structure** — single-product systems need a second axis (*layer*) that
   is an attribute of an asset, not a boundary around it.
3. **Mobility** — refining a model must be a supported operation with defined
   semantics, not a data migration.

## 2. Design rule (normative)

> **A product is something you ship, version, and grant access to as a
> unit. An asset is something you change. Layers describe where an asset
> sits inside its product. When in doubt, prefer fewer products with more
> assets — assets are movable; products are commitments.**

This rule is documented in the concepts guide, embedded in the MCP modeling
guide, and repeated in one-line form in the relevant tool descriptions.

---

## 3. The `layer` field

### 3.1 Schema

`assets.layer` — nullable text, both dialects. Free text by design (teams'
vocabularies differ), with a **conventional taxonomy** promoted everywhere
the field is surfaced:

`edge · frontend · backend · domain · data · infra · shared`

### 3.2 Effective layer (display-time default)

A null layer never renders as "unknown". The **effective layer** is derived
from asset type when unset:

| Asset type | Default layer |
|---|---|
| app | frontend |
| service | backend |
| datastore | data |
| platform | infra |
| library | shared |

Existing instances therefore get a sensible layered map with zero migration
or backfill. The default is computed at display/query time, never written to
the row — an explicit layer is a human (or agent) statement; a default is
not.

### 3.3 Where it surfaces

- **Asset edit** (product page dialog + MCP): a layer input offering the
  taxonomy plus free entry.
- **Asset detail header**: a small layer chip beside the type badge (only
  when explicitly set).
- **Atlas**: the grouping axis below.

## 4. Atlas: layer columns

- A **"Columns: Product | Layer"** toggle joins the Atlas toolbar.
- **Auto behavior**: when exactly one product is in scope (global product
  filter, `?product=`, or the org simply has one product), the map defaults
  to Layer columns; multi-product scope defaults to Product columns. The
  toggle always overrides.
- Layer columns order by the conventional taxonomy sequence (edge → frontend
  → backend → domain → data → infra → shared, unknown layers appended
  alphabetically) — which matches typical dependency flow, so most edges
  point one direction.
- In Layer mode, node sublabels show the product name when scope is
  multi-product (the inverse of Product mode, where the lens detail shows).
  Lenses, hover blast radius, filters, and the legend are unchanged.
- Grid gains a layer chip on cards; Table gains a Layer column (sortable,
  effective layer, explicit ones marked).

## 5. `moveAsset` — model refactoring with semantics

`moveAsset(assetId, targetProductId)` — mutation + MCP tool (`move_asset`,
write scope). Not an `update_asset` side effect: the guardrails need a home.

**Semantics:**

1. **Blocked by open plans.** If any *draft or active* plan in the current
   product targets the asset, the move fails with the list of blocking plans
   (`{ error, blockingPlans: [{id, title, status}] }`). Retarget or complete
   them first — silently detaching live work would falsify plans.
2. **Work items follow.** Work items with `assetId = asset` update their
   `productId` to the target. Demand belongs to the asset.
3. **History is history.** Completed-plan links (`code_plan_assets`),
   release version stamps (`release_assets`), sync-log entries, design-log
   entries, capabilities and their lineage are all left untouched. An
   asset's past does not change because its home does — same principle as
   `originSummary` surviving FK nulling. Cross-product historical stamps
   render as normal history entries.
4. **Access re-scopes automatically** — visibility follows the new product's
   org scope; the mutation validates the caller can see both products.
5. Owners, dependencies, notes, health, debt, layer ride along unchanged
   (dependency edges are asset-to-asset and product-agnostic).

UI: a "Move to product…" action in the asset edit dialog exposing the same
mutation and surfacing blocking plans. MCP is the primary interface — model
refactoring is agent work.

## 6. MCP changes

- `create_asset` / `update_asset`: add optional `layer` param (taxonomy
  named in the description, free text accepted).
- **New tool `move_asset`** (write): the §5 semantics, with the blocking-plan
  error shaped for agent recovery. Tool count 41 → **42**.
- `get_modeling_guide`: new **Boundaries** section — the §2 rule, the layer
  taxonomy with defaults table, the worked examples from the concepts guide
  (single SaaS / portfolio / monorepo / internal platform), and a
  "refining a model" recipe (audit → assign layers → `move_asset` where a
  boundary was wrong → re-check the Atlas).
- One-line boundary heuristics added to `create_product` and `create_asset`
  descriptions ("create a product only for something shipped, versioned,
  and access-controlled as a unit — subsystems are assets with layers").

## 7. Demo seed

Assign explicit layers to a representative subset of demo assets (leaving
some null to demonstrate effective-layer defaults), so a single-product
scope shows a credible layered map out of the box.

## 8. Testing

- Effective-layer derivation (explicit beats default; defaults per type).
- Inventory carries layers; Atlas grouping is pure client logic over it.
- `moveAsset`: blocks on draft/active plans with the correct list; moves
  work items' product; preserves stamps, completed-plan links, and
  capabilities; validates access on both ends; idempotent no-op when
  already in the target product.

## 9. Out of scope

- Layer-scoped access control, per-layer health rollups, or any mechanism
  hanging off layers — layers are *description*, not *boundary*. The moment
  layers carry permissions they become products with extra steps.
- Auto-assigning persisted layers by heuristic or agent without an explicit
  write — defaults stay display-time.
- Moving assets *across organizations*.
- Bulk/merge operations on products (merge two products = move assets one
  by one, deliberately).
