import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
  type AnySQLiteColumn,
} from 'drizzle-orm/sqlite-core'

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
export type SyncEntityType = 'work_item' | 'task' | 'code_plan' | 'asset' | 'product'

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
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: text('owner_id').notNull().references(() => users.id),
  billingTier: text('billing_tier').$type<BillingTier>().notNull().default('free'),
  productLimit: integer('product_limit').notNull().default(1),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const organizationMembers = sqliteTable('organization_members', {
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
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  organizationId: text('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  creatorId: text('creator_id').notNull().references(() => users.id),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const assets = sqliteTable('assets', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  productId: text('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: text('type').$type<AssetType>().notNull(),
  description: text('description').notNull().default(''),
  tags: text('tags', { mode: 'json' }).$type<string[]>().notNull().default([]),
  health: text('health').$type<AssetHealth>().notNull().default('healthy'),
  status: text('status').$type<AssetStatus>().notNull().default('active'),
  techDebtScore: integer('tech_debt_score'),
  repositoryUrl: text('repository_url'),
  // Path within the repository for monorepo assets (e.g. apps/web, packages/ui).
  repoPath: text('repo_path'),
  documentationUrl: text('documentation_url'),
  metadata: text('metadata', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const assetDependencies = sqliteTable('asset_dependencies', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sourceAssetId: text('source_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  targetAssetId: text('target_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  dependencyType: text('dependency_type').$type<DependencyType>().notNull(),
  description: text('description'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const codePlans = sqliteTable('code_plans', {
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

export const codePlanAssignees = sqliteTable('code_plan_assignees', {
  codePlanId: text('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  primaryKey({ columns: [t.codePlanId, t.userId] }),
])

export const workItems = sqliteTable('work_items', {
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
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  workItemId: text('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  codePlanId: text('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  uniqueIndex('work_item_code_plans_item_plan_idx').on(t.workItemId, t.codePlanId),
])

export const tasks = sqliteTable('tasks', {
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
  payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull().default({}),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
}, (t) => [
  index('sync_log_org_created_idx').on(t.organizationId, t.createdAt),
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
