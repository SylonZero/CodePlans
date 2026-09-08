# Product Wiki

Choose **Wiki ↗** in the main navigation to open a full-window reading workspace
in a new browser tab. The entry page follows your selected product, or offers a
product picker. After entry, the product lives in the wiki URL: changing it does
not change the product filter in your working CodePlans tab.

## Browse an asset's story

The left navigation groups assets by layer, using the existing type defaults
when no explicit layer is recorded. Product overview shows the architecture,
product-level documents, review queue, and recent evolution. Sparse assets
remain useful through their description, references, and dependencies.

Each asset page assembles:

- Recorded capabilities and their delivery receipts.
- Draft and active specs, with current versions and confirmed-version gaps.
- Asset notes and design decisions.
- Draft/active plans, known issues, and tech debt.
- Completed plans, releases, and recent history.

A spec can arrive through an asset association, a plan targeting the asset, or
a work item and its linked plans. Each document appears once per asset. Its
reader explains **Why this appears here**, retaining the association paths and
plan relationship types. Dependencies provide navigation to related assets;
they do not automatically import those assets' document collections.

## Read and follow documents

Specs, plan descriptions, work items, asset notes, design decisions,
capabilities, and release descriptions have full wiki readers. Their URLs are
permanent references, for example `/wiki/my-product?doc=spec%3A<id>`; asset
pages use `/wiki/my-product?asset=<id>`.

Readers support GFM tables, paragraphs, soft line breaks, task lists, fenced
code, and heading navigation. Section anchors use GitHub-style slugs, including
unique anchors for duplicate headings; headings inside code fences do not
appear in the contents. Wide tables and code scroll within the page. Small
screens have an expandable contents menu.

Relative links in imported specs resolve against their original source URL.
When the target URL matches another imported spec, the link opens that native
wiki page, preserving its section fragment. Other links retain the source
location. Raw HTML is not executed. Internal content links remain in the wiki;
**Open / edit in CodePlans** takes you to the existing operational interface.

## Search and review

Product search covers titles, body text, Markdown headings, areas, tags,
associated asset names, and repository paths. Technical identifiers such as
`MAX_FILE_SIZE_BYTES` retain their underscores. Title matches rank ahead of
heading and body matches; results include highlighted excerpts and are paginated
20 at a time. Filters cover asset, content type, status, area, and modified date.
Archived, superseded, removed, cancelled, abandoned, deprecated, and wont-do
records are hidden by default unless explicitly selected or included.

**Needs review** lists current specs carrying the review flag. Use the archive
filter to include older approaches. Review edits use the native spec editor,
which preserves optimistic version checks. Empty/placeholder bodies appear as
source references with an explicit explanation, not completed documents.
Product-level records without asset associations remain searchable.

All content and search use the same product visibility rules as CodePlans.
The wiki is authenticated; opening it in a separate tab does not make it public.

## Dates, people, and versions

Creator and last-editor metadata is recorded for new native edits to assets,
specs, plans, work items, releases, design notes, and capabilities. MCP changes
identify the responsible user and agent channel. Owners remain a separate
concept. Existing creator/reporter/design-note-author fields are used where
available; missing historical attribution stays **not recorded**. Updates with
no known actor clear last-editor attribution instead of reusing the prior editor.
Import timestamps describe arrival in CodePlans, not original authorship.

Times display in the reader's local timezone; hover to inspect the UTC time.
Asset notes share the asset record's timestamps and attribution. Metadata tracks
creation and the last record edit; it is not a full per-edit audit log or body
revision archive.

Only a **shipped release's explicit asset stamp** supplies the current shipped
asset version. Version numbers in document titles do not. Completed plans,
resolved work items, recorded capabilities, and shipped releases remain distinct.
An empty capability register means no capabilities have been recorded yet.
Spec receipts preserve the version confirmed for a capability, including
historical removed capabilities; they do not assert that every spec requirement
shipped. Historical spec bodies remain outside Native Spec v1.

Spec association/revision events are grouped by asset, day, and event kind in
expandable history summaries. The original events remain intact. Completion and
resolution entries use the existing record update timestamp and are labelled
accordingly; they are not fabricated transition timestamps.

## Upgrade and implementation

Apply the normal migrations before deploying the wiki application:

```sh
pnpm db:migrate
```

`0018_wiki_attribution` is additive and journaled for SQLite and PostgreSQL.
Both schemas add nullable creator/editor user references and actor kinds; user
deletion sets the references to null. Existing attribution is not guessed or
backfilled. The normal [legacy spec importer](using-specs.md#migrating-existing-urls)
is independent of this migration.

Wiki reads are batched per product, with permission checking before content
queries and no query per asset. Bodies stay on the server; only reader content
and list excerpts are rendered. Search currently ranks the authorized product
corpus in process, using the same behavior on SQLite and PostgreSQL. A provider-
specific full-text index can be introduced when corpus size warrants it.

The opt-in PostgreSQL verifier also exercises wiki access, association assembly,
and attribution against an **empty disposable database**:

```sh
SPEC_TEST_DATABASE_URL=postgres://localhost/codeplans_wiki_test \
  pnpm exec tsx scripts/verify-specs-postgres.ts
```
