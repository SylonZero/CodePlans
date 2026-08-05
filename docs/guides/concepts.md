# How CodePlans Thinks

CodePlans has a small object model with strong opinions. Most questions about
"where should this go?" answer themselves once you know what each object is
*for* — not just what it's called. This guide is the conceptual map: the
objects, the boundaries between them, and the design principles the whole tool
keeps returning to.

## The object model in one pass

```
Product ──▶ Asset ──▶ (targeted by) Code Plan ──▶ Task
   │           │                        │
   │           │◀── Work Item (demand, linked many-to-many to plans)
   │           │
   └─ Release ─┴─ stamps asset versions; groups the plans that ship together

Per asset:  History (derived diary)  ·  Record (delivered reality)
```

| Object | What it is for | What it carries |
|---|---|---|
| **Product** | The unit you *ship, version, and grant access to* | Access control, code plans, releases, integrations targeting |
| **Asset** | The unit you *change* — the work surface | Health, tech debt, dependencies, owners, history, record |
| **Work item** | Demand — a feature, bug, UX issue, or debt someone wants addressed | Type, severity, status, target asset, links to plans |
| **Code plan** | A coordinated change — the bridge from demand to execution | Tasks, target assets (with branch/PR per asset), linked work items, its release |
| **Task** | The unit of execution | Status, assignee, effort, schedule |
| **Release** | What ships *together* — always an explicit human act | Attached plans, per-asset version stamps, derived release notes |
| **Record** | What an asset *is* today — delivered capabilities with receipts | Capabilities (with lineage), known issues, debt register |
| **History** | How the asset *got here* — a derived diary | Version stamps, delivered plans, resolved items, design notes |

Two of these are load-bearing in ways that are easy to miss, and they're where
modeling questions concentrate: **products** and **assets**.

## The boundary rule: products ship, assets change

> **A product is something you ship, version, and grant access to as a unit.
> An asset is something you change.**

Products aren't folders. Three mechanisms hang off the product boundary:

1. **Access** — visibility is scoped by product. Splitting one system into
   many products fragments who can see what.
2. **Plans** — every code plan belongs to one product, and can only target
   that product's assets. Split a real system across products and a
   cross-cutting change needs two plans where one is true.
3. **Releases** — a release is per-product, and its whole purpose is
   coordinating a revision *across* assets: "Platform v2.4.0 takes Auth to
   v1.8.0 and Search to v1.2.0." Products drawn too small make coordinated
   releases structurally impossible to express.

So the test for "should this be a product?" is not "does it have a clear
system boundary?" — most good *assets* have clear system boundaries. The test
is: **does it ship on its own cadence, under its own version, to its own
audience?**

### Worked examples

- **A single SaaS** (one app, one API, shared libraries, a datastore or
  three): **one product**, many assets. Even at 30–40 assets, this is a
  well-modeled instance, not an under-split one. Your releases coordinate
  the whole surface; that's the point.
- **A portfolio** (the demo dataset): a web platform, mobile apps with
  app-store release trains, and a public API with its own versioning
  contract — **three products**, because each genuinely ships on its own
  cadence to its own audience.
- **A monorepo** is orthogonal: one repo can host several products, and one
  product can span several repos. Model the shipping boundary, not the
  folder structure — assets carry `repoPath` for the folder mapping (see
  [Modeling Monorepos](modeling-monorepos.md)).
- **A shared internal platform** consumed by other teams *is* a product if
  it versions and publishes on its own contract — that's an audience.

When in doubt, prefer **fewer products with more assets**. Assets are cheap,
carry all the operational texture (health, debt, dependencies, history,
record), and — by design — can be moved and refined later. Products are
commitments.

### The second axis: layers

Deep single-product systems still want internal structure — a backend API,
a domain library, and a web app are different *kinds* of asset even though
they ship together. That structure is a **layer**, not a product: an
attribute of the asset (edge, frontend, backend, domain, data, infra,
shared…) rather than a boundary around it. Layers give the
[Asset Atlas](asset-atlas.md) its columns when the product axis degenerates
(one product = one column), and give agents a vocabulary for structural
modeling. The layer concept is specced in
[`layers-and-boundaries-spec.md`](../specs/layers-and-boundaries-spec.md).

## The design principles

Five rules explain most of CodePlans' behavior. They're worth knowing because
new features keep being judged against them.

**1. Derived, not maintained.** Anything that must be manually kept in sync
will rot — so wherever possible, views are *projections* of data the team
already maintains to run its work. Asset history is projected from plans,
work items, and releases. Release notes derive from the work items the
attached plans delivered. The Atlas map is drawn from the asset inventory and
dependency edges — there is deliberately no way to drag a node or pin a
layout, because stored layout would make the map a document again, and
documents rot.

**2. Reality, not intent.** The asset Record only ever contains *delivered or
verified* claims — a capability enters it by graduating from a resolved work
item (with full lineage: work item → plan → release) or by being verified
against code. Intent lives upstream in work items and PM tools and links out.
This one rule is what keeps the record from becoming a second backlog.

**3. Shipping is a human act.** Releases have an explicit lifecycle and an
explicit "Mark Shipped" — nothing infers shipping from merges or deploy
events. Shipped releases become read-only, because the record of what shipped
must stay trustworthy. Corrections reopen deliberately.

**4. Agents are first-class users.** Everything the UI can do to the model,
the MCP server exposes — currently 41 tools, with the same access rules and
guardrails enforced at the tool layer (shipped releases reject mutation,
mirrored items reject writes to tracker-owned fields). Modeling guidance
ships *inside* the tools (`get_modeling_guide`, and heuristics in tool
descriptions), because for agent-driven modeling, the tool description *is*
the UX. Agent-authored artifacts (design notes) are attributed and badged,
never disguised as human.

**5. Models are refinable.** Your first model of a system will be wrong
somewhere, and an agent's first pass more so. The tool is built so
refinement is cheap and history survives it: modeling operations are
idempotent (re-running a capture or modeling pass reconciles rather than
duplicates), records tombstone rather than delete, lineage text survives
foreign-key changes, and structural refactoring (moving an asset to the
right product, assigning layers) is a supported operation — not a data
migration.

## Where to go next

- [The Asset Atlas](asset-atlas.md) — the system map these boundaries feed
- [Releases & Versions](releases-and-versions.md) — the shipping boundary in practice
- [Asset History & the Design Log](asset-history.md) — the derived diary
- [Modeling Monorepos](modeling-monorepos.md) — repo structure vs model structure
- [Working with AI Agents](ai-agents.md) — the MCP tool catalog and agent workflows
- [`docs/app-spec.md`](../app-spec.md) — the authoritative current state
