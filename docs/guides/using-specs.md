# Native, versioned specs

Specs are product-owned design documents, authored in CodePlans with the same
TipTap editor as descriptions and notes. The stored body is GFM Markdown.
Git is an import source: `sourceUrl` remains a citation, while the imported body
is independent of future branch changes.

## Linking and editing

Use the **Specs** tab on an asset, the Specs panel on a plan or work item, or the
picker/creator in new-plan and new-work-item forms. A spec may be linked to many
assets, work items, and plans in the same product. Plan links declare `creates`,
`revises`, or `references`; asset and work-item links are plain associations.
The picker defaults a plan association to `references`.

`specType` is an open string. Suggested values are `feature`, `ux`, `test`,
`workflow`, `schema`, `api`, `architecture`, `integration`, and `ops`. Optional
`area` identifies a narrower scope, such as “chat file resource model.”

New specs start as draft at v1. **Only content creates a version:** changing
the title or body increments it and keeps the previous text in history.
Status, specType and area change in place on the current version,
so activating, archiving or reclassifying a spec never produces a version whose
text is identical to the last, and never outdates an approval. A save that
changes nothing is ignored. `expectedVersion` rejects stale edits either way.
Supported statuses are draft, in review (set by requesting a review), active
and archived. Use `supersede_spec` when the approach changes: it creates a new
draft at v1, retains provenance and associations, links both documents, and
marks the old one superseded/read-only. Existing delivery receipts stay on the
old spec.

Every version's title, body, type, area and status (as of that version) is
kept in `spec_revisions`, written in the same transaction that creates it,
with an optional `changeSummary`. The spec page lists the history, shows any
past version read-only (`/specs/<id>?v=2`) and a line diff against the
previous one (`?v=2&diff=1`). Agents read a pinned version with
`get_spec_revision` and the list with `list_spec_revisions`. Specs that
existed before history was retained start at their version at that time;
earlier bodies were never stored and cannot be recovered. Workspaces from
before this change may have versions created by a status edit; reviews look
past them, since only the title and body count.

## On the spec page

The bar at the top says where the spec stands and offers only what fits its
state and your permissions:

| Status | Actions |
|---|---|
| Draft | Request review · Activate · Revise content |
| In review | Activate (asks first under a guided workflow while unapproved; becomes **Activate v*n*** once approved) · Revise content |
| Active | Revise content · Archive · Supersede |
| Archived | Restore to draft |

None of these create a version except **Revise content**, which opens the
editor: saving a changed title or text creates the next version and asks
earlier approvers to look again. **Details** (type and area) save on the
current version. Viewers see the status and explanation without
actions, and can still comment.

## Delivery and history

`graduate_work_item` captures the version of the work item's linked spec as a
permanent delivery receipt. If multiple specs are linked, supply
`sourceSpecId` explicitly (the UI prompts for a choice). Re-graduation returns
the existing receipt. Graduation does not change spec status.

Asset Record keeps `activeSpecs` structurally separate from `capabilities`.
The former includes draft and active intent, with `currentVersion` and
`deliveredThroughVersion`. A null delivery version means no capability has
confirmed this spec; a lower version identifies an unconfirmed revision.
The highest pinned version includes historical/tombstoned capabilities as a
record of delivery, not a claim that a removed feature still exists.

History includes `spec_linked` and `spec_updated` snapshots with version and
plan/work-item anchors. Unlinking does not erase those events. To revise a spec
while recording a design note, supply both `revisesSpecId` and
`revisedSpecBody`, optionally `expectedSpecVersion`. The note remains
retrospective prose. The note and spec change commit together and appear as two
separate events carrying each other's IDs.

## MCP flow

1. `create_spec(productId, title, body, specType, area?)`.
2. `link_spec(specId, targetType, targetId, relationshipType?)` for each association.
3. `get_spec(id)` or `list_specs(productId?, targetType?, targetId?, specType?)`
   to inspect; target filters must be supplied together.
4. `update_spec(id, body?, title?, status?, specType?, area?, expectedVersion?)`
   for edits (only a title or body change creates a version), or
   `supersede_spec(oldId, newBody, title?)` for a replacement approach.
5. Resolve the work item, then `graduate_work_item(workItemId, sourceSpecId?)`
   after checking what was delivered.

Read tools use the caller's product visibility. Mutations require an MCP write
key and enforce the same product boundary. Native forms and MCP no longer
write `specUrl`; existing values remain readable as legacy citations.

## Markdown rendering

All existing Markdown readers (plans, specs, work-item side panels, asset
content, design notes, capabilities, and release descriptions) share one GFM
renderer. It preserves paragraphs and soft line breaks, supports tables,
task lists, strikethrough, and fenced code, and scrolls wide tables/code inside
narrow panels. TipTap uses the same document typography and break handling.
Raw HTML execution is disabled.

## Migrating existing URLs

Apply the normal Drizzle migrations for the configured database first:

```sh
pnpm db:migrate
pnpm specs:migrate --product=<product-id> --dry-run
```

Review the JSON report, then apply explicitly:

```sh
pnpm specs:migrate --product=<product-id> --apply
```

The script loads `.env.local` like the existing seed scripts. Dry-run is the
default and writes no rows. It reports source counts, unique URLs, duplicate
collapse, inferred types, targets, and placeholders. It tries the existing git
fetcher; inaccessible, malformed, or unsupported URLs become placeholder specs
and never block import. The fetcher supports branch names containing slashes and keeps the full
original URL as provenance.

URLs deduplicate within a product, never across products. Every import
starts **in review**, so someone checks its content and classification before
activating it or asking for a formal review; the original URL is preserved. Re-runs reuse specs and
existing associations without replacing curated bodies or delivery receipts.
The script leaves original `specUrl` columns intact.

The migrations are additive `0017_native_specs` entries under both
`lib/db/migrations/sqlite` and `lib/db/migrations/postgres`. Both schema files
and the runtime barrel include the new tables. PostgreSQL uses UUIDs,
timestamptz, booleans and foreign keys; SQLite uses its existing text/integer
conventions. To verify Postgres against an **empty disposable** database:

```sh
SPEC_TEST_DATABASE_URL=postgres://localhost/codeplans_spec_test \
  pnpm exec tsx scripts/verify-specs-postgres.ts
```

The verifier refuses a database with existing public tables, runs the complete
Drizzle migration chain twice, and checks concurrent edits, note rollback,
version pinning, supersession, import idempotency, and foreign-key cleanup.
