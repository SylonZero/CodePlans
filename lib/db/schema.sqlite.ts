import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'
import { sql } from 'drizzle-orm'

// ---------------------------------------------------------------------------
// Type aliases (SQLite has no native enum; TypeScript enforces the union)
// ---------------------------------------------------------------------------

export type UserRole = 'owner' | 'admin' | 'editor' | 'viewer'
export type BillingTier = 'free' | 'pro' | 'team' | 'enterprise'
export type AssetType = 'app' | 'service' | 'library' | 'datastore' | 'platform'
export type AssetHealth = 'healthy' | 'warning' | 'critical'
export type AssetStatus = 'active' | 'deprecated' | 'planned'
export type DependencyType = 'depends_on' | 'integrates_with' | 'aggregates'
export type CodePlanStatus = 'draft' | 'active' | 'completed' | 'cancelled'
export type CodePlanType = 'refactor' | 'feature' | 'improvement' | 'bugfix'
export type TaskStatus = 'not_started' | 'in_progress' | 'done'
export type TaskPriority = 'low' | 'medium' | 'high' | 'critical'
export type WorkItemType = 'feature' | 'bug' | 'enhancement' | 'ux' | 'tech_debt'
export type WorkItemStatus = 'open' | 'planned' | 'in_progress' | 'resolved' | 'wont_do'
export type WorkItemSeverity = 'low' | 'medium' | 'high' | 'critical'
export type PrStatus = 'none' | 'draft' | 'open' | 'merged' | 'closed'
// Provider list is intentionally text (not enum) — new connectors must not need a migration.
export type ItemSource = 'native' | 'github' | 'gitlab' | 'jira' | 'asana' | 'linear'
export type IntegrationStatus = 'active' | 'paused' | 'error'
export type SyncEntityType = 'work_item' | 'task' | 'code_plan' | 'asset' | 'product' | 'release' | 'asset_dependency' | 'integration' | 'spec'
export type ActorKind = 'user' | 'agent' | 'connector'
export type ProductResponsibility = 'eng_manager' | 'architect' | 'contributor'
export type CommentSubjectType = 'spec' | 'code_plan' | 'work_item' | 'release' | 'asset'
export type CommentKind = 'comment' | 'suggestion' | 'question'
export type CommentAnchor = { quote: string; prefix?: string; suffix?: string }
export type ReviewSubjectType = 'spec' | 'code_plan'
export type ReviewState = 'open' | 'changes_requested' | 'approved' | 'withdrawn' | 'stale'
export type ReviewReason = 'architect' | 'code_owner' | 'eng_manager' | 'requested'
export type ReviewDecision = 'pending' | 'approved' | 'changes_requested' | 'commented'
// Community levels are open and guided; 'gated' is recognized so an extension can enforce it.
export type WorkflowLevel = 'open' | 'guided' | 'gated'
export type ReleaseStatus = 'planned' | 'in_progress' | 'shipped' | 'abandoned'

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

export const users = sqliteTable('users', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  billingTier: text('billing_tier').$type<BillingTier>().notNull().default('free'),
  role: text('role').$type<UserRole>().notNull().default('viewer'),
  organizationId: text('organization_id'),
  featureFlags: text('feature_flags', { mode: 'json' }).$type<Record<string, boolean>>().notNull().default({}),
  passwordHash: text('password_hash'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const organizations = sqliteTable('organizations', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  billingTier: text('billing_tier').$type<BillingTier>().notNull().default('free'),
  productLimit: integer('product_limit').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const organizationMembers = sqliteTable('organization_members', {
  // Explicit attribution; who added this member. No updatedBy — the row is
  // replaced (role edits are in-place, but membership itself isn't "edited").
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: text('role').$type<UserRole>().notNull().default('viewer'),
  invitedBy: text('invited_by').references(() => users.id),
  joinedAt: integer('joined_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const integrations = sqliteTable('integrations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').$type<Exclude<ItemSource, 'native'>>().notNull(),
  name: text('name').notNull(),
  // Reference to a credential (env var name / secret id) — never the secret itself.
  authRef: text('auth_ref'),
  // AES-256-GCM (key derived from AUTH_SECRET); preferred over authRef when set.
  tokenEncrypted: text('token_encrypted'),
  // Scope (project/repo/JQL filter), status map, user-mapping overrides, target productId.
  config: text('config', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').$type<IntegrationStatus>().notNull().default('active'),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp' }),
  lastError: text('last_error'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const products = sqliteTable('products', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  creatorId: text('creator_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  // Soft-delete tombstone (spec "Deletion & Cascade Design for Core Entities", Phase 4) —
  // archived means archivedAt IS NOT NULL. Highest blast radius in the schema: nothing
  // beneath a product (assets, plans, releases, work items, specs) is touched or cascaded,
  // it just becomes unreachable through the normal access-check path. Never hard-deleted
  // by the normal UI/MCP path; deleteProduct remains for a possible future admin-only purge.
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  archivedById: text('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  archivedByKind: text('archived_by_kind'),
})

export const assets = sqliteTable('assets', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<AssetType>().notNull(),
  description: text('description').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  health: text('health').$type<AssetHealth>().notNull().default('healthy'),
  status: text('status').$type<AssetStatus>().notNull().default('active'),
  techDebtScore: integer('tech_debt_score'),
  // Freeform ideation/notes doc (markdown) — design thinking, migration ideas, known quirks.
  notes: text('notes'),
  repositoryUrl: text('repository_url'),
  // Path within the repository for monorepo assets (e.g. apps/web, packages/ui).
  repoPath: text('repo_path'),
  layer: text('layer'),
  documentationUrl: text('documentation_url'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  // Soft-delete tombstone (spec "Deletion & Cascade Design for Core Entities",
  // Phase 3) — archived means archivedAt IS NOT NULL. Never hard-deleted by
  // the normal UI/MCP path; deleteAsset remains for a possible future
  // admin-only purge of genuinely empty/orphaned assets.
  archivedAt: integer('archived_at', { mode: 'timestamp' }),
  archivedById: text('archived_by_id').references(() => users.id, { onDelete: 'set null' }),
  archivedByKind: text('archived_by_kind'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Declared responsibility (like code owners) — routing and visibility, not an ACL.
// Explicit rather than derived: unlike plan assignees, there is no activity to derive it from.
export const assetOwners = sqliteTable('asset_owners', {
  // Who declared this ownership. No updatedBy — the row is deleted, not edited.
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('asset_owners_asset_user_idx').on(t.assetId, t.userId),
  index('asset_owners_user_idx').on(t.userId),
])

// Scoped engineering responsibilities on a product. These route reviews,
// notifications and My Work; they never grant permissions (org role does).
// Code owners live in asset_owners; developers follow from task assignment.
// area '' means the whole product (kept non-null so the unique index holds).
export const productMembers = sqliteTable('product_members', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  responsibility: text('responsibility').$type<ProductResponsibility>().notNull(),
  area: text('area').notNull().default(''),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('product_members_unique_idx').on(t.productId, t.userId, t.responsibility, t.area),
  index('product_members_user_idx').on(t.userId),
])

export const assetDependencies = sqliteTable('asset_dependencies', {
  // Who recorded this edge. No updatedBy — the row is deleted, not edited.
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceAssetId: text('source_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  targetAssetId: text('target_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  dependencyType: text('dependency_type').$type<DependencyType>().notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const codePlans = sqliteTable('code_plans', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  type: text('type').$type<CodePlanType>().notNull(),
  status: text('status').$type<CodePlanStatus>().notNull().default('draft'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  startDate: text('start_date'),
  endDate: text('end_date'),
  deadline: text('deadline'),
  creatorId: text('creator_id').notNull().references(() => users.id),
  // Steers the plan; distinct from creator and assignees.
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // Link to the design spec (markdown in the repo, or any doc URL).
  // Deprecated, read-only legacy citation. New associations live in spec_links.
  specUrl: text('spec_url'),
  // A plan ships in at most one release; detaching a release never touches its plans.
  releaseId: text('release_id').references((): AnySQLiteColumn => releases.id, { onDelete: 'set null' }),
  // Bumped when scope (targets, addressed work items), linked specs or the description change.
  // Plan reviews pin to it the way spec reviews pin to specs.version.
  revision: integer('revision').notNull().default(1),
  source: text('source').$type<ItemSource>().notNull().default('native'),
  connectionId: text('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: text('external_data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  externalDeleted: integer('external_deleted', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('code_plans_connection_external_idx').on(t.connectionId, t.externalId),
])

export const codePlanAssets = sqliteTable('code_plan_assets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  codePlanId: text('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  branch: text('branch'),
  prUrl: text('pr_url'),
  prStatus: text('pr_status').$type<PrStatus>().notNull().default('none'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('code_plan_assets_plan_asset_idx').on(t.codePlanId, t.assetId),
])

// Delivery grouping above code plans: what ships together, stamping per-asset
// versions via release_assets. Status is explicit — shipping is a human act.
export const releases = sqliteTable('releases', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<ReleaseStatus>().notNull().default('planned'),
  shippedAt: integer('shipped_at', { mode: 'timestamp' }),
  creatorId: text('creator_id').notNull().references(() => users.id),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  source: text('source').$type<ItemSource>().notNull().default('native'),
  connectionId: text('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: text('external_data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  externalDeleted: integer('external_deleted', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('releases_connection_external_idx').on(t.connectionId, t.externalId),
  index('releases_product_idx').on(t.productId),
])

// The version stamp: "this release took this asset to this version".
// Explicitly managed — a release may version an asset no plan touched, or
// exclude an incidentally-touched one.
export const releaseAssets = sqliteTable('release_assets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  releaseId: text('release_id').notNull().references(() => releases.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  version: text('version'),
  notes: text('notes'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('release_assets_release_asset_idx').on(t.releaseId, t.assetId),
  index('release_assets_asset_idx').on(t.assetId),
])

// The asset's current-state record: capability claims with delivery receipts
// (asset-record-spec.md §5.1). Entries enter only by graduating a resolved work
// item or by an accepted reconciliation proposal — never as intent.
export const assetCapabilities = sqliteTable('asset_capabilities', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  area: text('area'),
  status: text('status').$type<'active' | 'removed'>().notNull().default('active'),
  source: text('source').$type<'graduated' | 'reconciled'>().notNull().default('graduated'),
  originWorkItemId: text('origin_work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
  originCodePlanId: text('origin_code_plan_id').references(() => codePlans.id, { onDelete: 'set null' }),
  originReleaseId: text('origin_release_id').references(() => releases.id, { onDelete: 'set null' }),
  // Captured lineage text — the receipt outlives its source rows.
  sourceSpecId: text('source_spec_id').references(() => specs.id, { onDelete: 'set null' }),
  sourceSpecVersion: integer('source_spec_version'),
  originSummary: text('origin_summary').notNull().default(''),
  verifiedAt: integer('verified_at', { mode: 'timestamp' }),
  removedAt: integer('removed_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('asset_capabilities_asset_idx').on(t.assetId),
  // A work item graduates at most once.
  uniqueIndex('asset_capabilities_origin_item_idx').on(t.originWorkItemId).where(sql`${t.originWorkItemId} IS NOT NULL`),
])

// Curated, backward-looking record: what a change meant for an asset's design.
// The forward-looking scratchpad stays in assets.notes. Agents are first-class
// authors here (authorKind) — recorded via MCP at plan-completion time.
export const assetDesignLog = sqliteTable('asset_design_log', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  releaseId: text('release_id').references(() => releases.id, { onDelete: 'set null' }),
  codePlanId: text('code_plan_id').references(() => codePlans.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  body: text('body').notNull().default(''),
  authorKind: text('author_kind').$type<'user' | 'agent'>().notNull().default('user'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('asset_design_log_asset_idx').on(t.assetId),
])

export const workItems = sqliteTable('work_items', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  // Free-text locus within the asset (module, path, domain) — where the item lives.
  area: text('area'),
  parentId: text('parent_id').references((): AnySQLiteColumn => workItems.id, { onDelete: 'set null' }),
  type: text('type').$type<WorkItemType>().notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<WorkItemStatus>().notNull().default('open'),
  severity: text('severity').$type<WorkItemSeverity>().notNull().default('medium'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  reporterId: text('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  // Steers the item to resolution; distinct from reporter.
  ownerId: text('owner_id').references(() => users.id, { onDelete: 'set null' }),
  // Deprecated, read-only legacy citation. New associations live in spec_links.
  specUrl: text('spec_url'),
  source: text('source').$type<ItemSource>().notNull().default('native'),
  connectionId: text('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: text('external_data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  externalDeleted: integer('external_deleted', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('work_items_connection_external_idx').on(t.connectionId, t.externalId),
  index('work_items_product_idx').on(t.productId),
  index('work_items_asset_idx').on(t.assetId),
])

export const workItemCodePlans = sqliteTable('work_item_code_plans', {
  // Who linked this work item to the plan. No updatedBy — the row is deleted, not edited.
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workItemId: text('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  codePlanId: text('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('work_item_code_plans_item_plan_idx').on(t.workItemId, t.codePlanId),
])

export const tasks = sqliteTable('tasks', {
  // Explicit attribution; null means the actor was not recorded (never infer from assignee).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  codePlanId: text('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: text('status').$type<TaskStatus>().notNull().default('not_started'),
  priority: text('priority').$type<TaskPriority>().notNull().default('medium'),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  // 0–100, meaningful while in_progress.
  percentComplete: integer('percent_complete'),
  // Scheduling window (ISO dates) — consumed by future PM-tool syncs.
  startDate: text('start_date'),
  endDate: text('end_date'),
  estimatedEffort: integer('estimated_effort'),
  actualEffort: integer('actual_effort'),
  source: text('source').$type<ItemSource>().notNull().default('native'),
  connectionId: text('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: text('external_data', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  externalDeleted: integer('external_deleted', { mode: 'boolean' }).notNull().default(false),
  syncedAt: integer('synced_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('tasks_connection_external_idx').on(t.connectionId, t.externalId),
])

export const syncLog = sqliteTable('sync_log', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  organizationId: text('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  connectionId: text('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  entityType: text('entity_type').$type<SyncEntityType>().notNull(),
  entityId: text('entity_id').notNull(),
  event: text('event').notNull(),
  // Null when a connection (not a user) is the actor.
  actorId: text('actor_id').references(() => users.id, { onDelete: 'set null' }),
  actorKind: text('actor_kind').$type<ActorKind>(),
  // The product the entity belonged to when the event happened (null for org-level
  // entities like integrations). No FK: history outlives a purged product.
  productId: text('product_id'),
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('sync_log_org_created_idx').on(t.organizationId, t.createdAt),
  index('sync_log_product_created_idx').on(t.productId, t.createdAt),
])

export const apiKeys = sqliteTable('api_keys', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  scope: text('scope').$type<'read' | 'write'>().notNull().default('read'),
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  revokedAt: integer('revoked_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

// Native, product-owned specifications. Bodies are canonical GFM from TipTap.
export const specs = sqliteTable('specs', {
  // Explicit attribution; null means the actor was not recorded (never infer from owner).
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
  updatedByKind: text('updated_by_kind'),
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  title: text('title').notNull(),
  body: text('body').notNull(),
  specType: text('spec_type').notNull(),
  area: text('area'),
  status: text('status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  supersedes: text('supersedes').references((): AnySQLiteColumn => specs.id, { onDelete: 'set null' }),
  supersededBy: text('superseded_by').references((): AnySQLiteColumn => specs.id, { onDelete: 'set null' }),
  sourceType: text('source_type').notNull().default('native'),
  sourceUrl: text('source_url'),
  needsReview: integer('needs_review', { mode: 'boolean' }).notNull().default(false),
  authorType: text('author_type').notNull().default('user'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('specs_product_idx').on(t.productId),
  uniqueIndex('specs_import_url_idx').on(t.productId, t.sourceUrl)
    .where(sql`${t.sourceType} = 'git_import' AND ${t.supersedes} IS NULL`),
])

// Append-only snapshot of every spec version's content, written in the same
// transaction that creates the version. A pinned version number is only
// evidence if the document it names can still be read.
export const specRevisions = sqliteTable('spec_revisions', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  specId: text('spec_id').notNull().references(() => specs.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  specType: text('spec_type').notNull(),
  area: text('area'),
  status: text('status').notNull(),
  changeSummary: text('change_summary'),
  createdById: text('created_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdByKind: text('created_by_kind'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [uniqueIndex('spec_revisions_version_idx').on(t.specId, t.version)])

// Target ownership and existence are checked by the spec service.
export const specLinks = sqliteTable('spec_links', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  specId: text('spec_id').notNull().references(() => specs.id, { onDelete: 'cascade' }),
  targetType: text('target_type').notNull(),
  targetId: text('target_id').notNull(),
  relationshipType: text('relationship_type'),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('spec_links_target_idx').on(t.specId, t.targetType, t.targetId),
  index('spec_links_lookup_idx').on(t.targetType, t.targetId),
])

// Immutable event snapshots: unlinking or subsequent edits never rewrite history.
export const specEvents = sqliteTable('spec_events', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  specId: text('spec_id').notNull().references(() => specs.id, { onDelete: 'cascade' }),
  assetId: text('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  specTitle: text('spec_title').notNull(),
  specType: text('spec_type').notNull(),
  fromVersion: integer('from_version'),
  toVersion: integer('to_version').notNull(),
  planId: text('plan_id').references(() => codePlans.id, { onDelete: 'set null' }),
  workItemId: text('work_item_id').references(() => workItems.id, { onDelete: 'set null' }),
  noteId: text('note_id').references(() => assetDesignLog.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
}, (t) => [index('spec_events_asset_idx').on(t.assetId)])


// ---------------------------------------------------------------------------
// Collaboration: comments and reviews
// ---------------------------------------------------------------------------

// Feedback threads on specs, plans, work items, releases and assets. A comment
// is pinned to the subject version it was written against so anchored remarks
// can be shown as outdated once the text moves on.
export const comments = sqliteTable('comments', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').$type<CommentSubjectType>().notNull(),
  subjectId: text('subject_id').notNull(),
  subjectVersion: integer('subject_version'),
  // One level of threading: replies point at a top-level comment.
  parentId: text('parent_id').references((): AnySQLiteColumn => comments.id, { onDelete: 'cascade' }),
  // Set when the comment is the note attached to a review decision.
  reviewId: text('review_id').references((): AnySQLiteColumn => reviews.id, { onDelete: 'set null' }),
  // { quote, prefix, suffix } for inline spec comments; re-matched after revisions.
  anchor: text('anchor', { mode: 'json' }).$type<CommentAnchor | null>(),
  body: text('body').notNull(),
  kind: text('kind').$type<CommentKind>().notNull().default('comment'),
  authorId: text('author_id').references(() => users.id, { onDelete: 'set null' }),
  authorType: text('author_type').$type<'user' | 'agent'>().notNull().default('user'),
  resolvedAt: integer('resolved_at', { mode: 'timestamp_ms' }),
  resolvedById: text('resolved_by_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('comments_subject_idx').on(t.subjectType, t.subjectId, t.createdAt),
  index('comments_parent_idx').on(t.parentId),
])

export const commentMentions = sqliteTable('comment_mentions', {
  commentId: text('comment_id').notNull().references(() => comments.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
}, (t) => [
  uniqueIndex('comment_mentions_pk').on(t.commentId, t.userId),
  index('comment_mentions_user_idx').on(t.userId),
])

// A review is an attestation on a pinned subject version: approving v3 says
// nothing about v4. While open, decisions count only at the subject's current
// version; once approved, a later revision marks the review stale.
export const reviews = sqliteTable('reviews', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  subjectType: text('subject_type').$type<ReviewSubjectType>().notNull(),
  subjectId: text('subject_id').notNull(),
  // Version when requested; approvedVersion is the version that was approved.
  subjectVersion: integer('subject_version').notNull(),
  approvedVersion: integer('approved_version'),
  requestedById: text('requested_by_id').references(() => users.id, { onDelete: 'set null' }),
  requestedByKind: text('requested_by_kind').$type<'user' | 'agent'>().notNull().default('user'),
  note: text('note'),
  dueAt: text('due_at'),
  state: text('state').$type<ReviewState>().notNull().default('open'),
  requestedAt: integer('requested_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  closedAt: integer('closed_at', { mode: 'timestamp_ms' }),
}, (t) => [
  index('reviews_subject_idx').on(t.subjectType, t.subjectId, t.requestedAt),
  index('reviews_product_state_idx').on(t.productId, t.state),
])

export const reviewParticipants = sqliteTable('review_participants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  reviewId: text('review_id').notNull().references(() => reviews.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  // The responsibility held when added; kept even if it changes later.
  reason: text('reason').$type<ReviewReason>().notNull(),
  required: integer('required', { mode: 'boolean' }).notNull().default(false),
  decision: text('decision').$type<ReviewDecision>().notNull().default('pending'),
  decidedAt: integer('decided_at', { mode: 'timestamp_ms' }),
  decidedAtVersion: integer('decided_at_version'),
}, (t) => [
  uniqueIndex('review_participants_user_idx').on(t.reviewId, t.userId),
  index('review_participants_pending_idx').on(t.userId, t.decision),
])

// First org-level configuration storage. One row per org, created on demand.
export const orgSettings = sqliteTable('org_settings', {
  organizationId: text('organization_id').primaryKey().references(() => organizations.id, { onDelete: 'cascade' }),
  workflowDefault: text('workflow_default').$type<WorkflowLevel>().notNull().default('open'),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
})

// Per-product overrides. A null workflow level inherits the org default.
export const productSettings = sqliteTable('product_settings', {
  productId: text('product_id').primaryKey().references(() => products.id, { onDelete: 'cascade' }),
  workflowLevel: text('workflow_level').$type<WorkflowLevel>(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull().$defaultFn(() => new Date()),
  updatedById: text('updated_by_id').references(() => users.id, { onDelete: 'set null' }),
})
