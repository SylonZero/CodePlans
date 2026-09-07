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

New specs start as draft at v1. Every `update_spec` increments the version;
`expectedVersion` rejects stale edits. Title, specType, area and needsReview
can also be updated (and versioned), so imported classifications can be
reviewed and the review flag cleared. Supported statuses are draft, active,
and archived. Use `supersede_spec` when the approach changes: it creates a new
draft at v1, retains provenance and associations, links both documents, and
marks the old one superseded/read-only. Existing delivery receipts stay on the
old spec. V1 stores the current body and version number; historical body
snapshots and character-level diffs are outside its scope.

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
4. `update_spec(id, body?, status?, expectedVersion?)` for edits, or
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

URLs deduplicate within a product, never across products. Every import is
flagged `needsReview`; the original URL is preserved. Re-runs reuse specs and
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
