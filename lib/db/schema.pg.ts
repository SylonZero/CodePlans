import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
  boolean,
  index,
  uniqueIndex,
  primaryKey,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core'

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const userRoleEnum = pgEnum('user_role', ['owner', 'admin', 'editor', 'viewer'])
export const billingTierEnum = pgEnum('billing_tier', ['free', 'pro', 'team', 'enterprise'])
export const assetTypeEnum = pgEnum('asset_type', ['app', 'service', 'library', 'datastore', 'platform'])
export const assetHealthEnum = pgEnum('asset_health', ['healthy', 'warning', 'critical'])
export const assetStatusEnum = pgEnum('asset_status', ['active', 'deprecated', 'planned'])
export const dependencyTypeEnum = pgEnum('dependency_type', ['depends_on', 'integrates_with', 'aggregates'])
export const codePlanStatusEnum = pgEnum('code_plan_status', ['draft', 'active', 'completed', 'cancelled'])
export const codePlanTypeEnum = pgEnum('code_plan_type', ['refactor', 'feature', 'improvement', 'bugfix'])
export const taskStatusEnum = pgEnum('task_status', ['not_started', 'in_progress', 'done'])
export const taskPriorityEnum = pgEnum('task_priority', ['low', 'medium', 'high', 'critical'])
export const workItemTypeEnum = pgEnum('work_item_type', ['feature', 'bug', 'enhancement', 'ux', 'tech_debt'])
export const workItemStatusEnum = pgEnum('work_item_status', ['open', 'planned', 'in_progress', 'resolved', 'wont_do'])
export const workItemSeverityEnum = pgEnum('work_item_severity', ['low', 'medium', 'high', 'critical'])
export const prStatusEnum = pgEnum('pr_status', ['none', 'draft', 'open', 'merged', 'closed'])
// source/provider columns are intentionally text (not enum) — new connectors must not need a migration.

// ---------------------------------------------------------------------------
// Tables
// ---------------------------------------------------------------------------

/**
 * Public user profile — keyed to auth.users(id).
 * Created automatically via the handle_new_user trigger on sign-up.
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey(), // matches auth.users.id — set by trigger
  email: text('email').notNull(),
  name: text('name').notNull(),
  avatarUrl: text('avatar_url'),
  billingTier: billingTierEnum('billing_tier').notNull().default('free'),
  role: userRoleEnum('role').notNull().default('viewer'),
  organizationId: uuid('organization_id'), // FK added below via relations
  featureFlags: jsonb('feature_flags').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  ownerId: uuid('owner_id').notNull().references(() => users.id),
  billingTier: billingTierEnum('billing_tier').notNull().default('free'),
  productLimit: integer('product_limit').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const organizationMembers = pgTable('organization_members', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull().default('viewer'),
  invitedBy: uuid('invited_by').references(() => users.id),
  joinedAt: timestamp('joined_at', { withTimezone: true }), // null until invitation accepted
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const integrations = pgTable('integrations', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  provider: text('provider').notNull(), // 'github' | 'jira' | 'asana' | 'linear' | ...
  name: text('name').notNull(),
  // Reference to a credential (env var name / secret id) — never the secret itself.
  authRef: text('auth_ref'),
  // Scope (project/repo/JQL filter), status map, user-mapping overrides, target productId.
  config: jsonb('config').notNull().default({}),
  status: text('status').notNull().default('active'), // 'active' | 'paused' | 'error'
  lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
  lastError: text('last_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const products = pgTable('products', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'set null' }),
  creatorId: uuid('creator_id').notNull().references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assets = pgTable('assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  type: assetTypeEnum('type').notNull(),
  description: text('description').notNull().default(''),
  tags: text('tags').array().notNull().default([]),
  health: assetHealthEnum('health').notNull().default('healthy'),
  status: assetStatusEnum('status').notNull().default('active'),
  techDebtScore: integer('tech_debt_score'),
  repositoryUrl: text('repository_url'),
  // Path within the repository for monorepo assets (e.g. apps/web, packages/ui).
  repoPath: text('repo_path'),
  documentationUrl: text('documentation_url'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const assetDependencies = pgTable('asset_dependencies', {
  id: uuid('id').primaryKey().defaultRandom(),
  sourceAssetId: uuid('source_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  targetAssetId: uuid('target_asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  dependencyType: dependencyTypeEnum('dependency_type').notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const codePlans = pgTable('code_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  type: codePlanTypeEnum('type').notNull(),
  status: codePlanStatusEnum('status').notNull().default('draft'),
  tags: text('tags').array().notNull().default([]),
  startDate: date('start_date'),
  endDate: date('end_date'),
  deadline: date('deadline'),
  creatorId: uuid('creator_id').notNull().references(() => users.id),
  // Link to the design spec (markdown in the repo, or any doc URL).
  specUrl: text('spec_url'),
  source: text('source').notNull().default('native'),
  connectionId: uuid('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: jsonb('external_data').notNull().default({}),
  externalDeleted: boolean('external_deleted').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('code_plans_connection_external_idx').on(t.connectionId, t.externalId),
])

export const codePlanAssets = pgTable('code_plan_assets', {
  id: uuid('id').primaryKey().defaultRandom(),
  codePlanId: uuid('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').notNull().references(() => assets.id, { onDelete: 'cascade' }),
  branch: text('branch'),
  prUrl: text('pr_url'),
  prStatus: prStatusEnum('pr_status').notNull().default('none'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('code_plan_assets_plan_asset_idx').on(t.codePlanId, t.assetId),
])

export const codePlanAssignees = pgTable('code_plan_assignees', {
  codePlanId: uuid('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  primaryKey({ columns: [t.codePlanId, t.userId] }),
])

export const workItems = pgTable('work_items', {
  id: uuid('id').primaryKey().defaultRandom(),
  productId: uuid('product_id').notNull().references(() => products.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  // Free-text locus within the asset (module, path, domain) — where the item lives.
  area: text('area'),
  parentId: uuid('parent_id').references((): AnyPgColumn => workItems.id, { onDelete: 'set null' }),
  type: workItemTypeEnum('type').notNull(),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: workItemStatusEnum('status').notNull().default('open'),
  severity: workItemSeverityEnum('severity').notNull().default('medium'),
  tags: text('tags').array().notNull().default([]),
  reporterId: uuid('reporter_id').references(() => users.id, { onDelete: 'set null' }),
  specUrl: text('spec_url'),
  source: text('source').notNull().default('native'),
  connectionId: uuid('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: jsonb('external_data').notNull().default({}),
  externalDeleted: boolean('external_deleted').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('work_items_connection_external_idx').on(t.connectionId, t.externalId),
  index('work_items_product_idx').on(t.productId),
  index('work_items_asset_idx').on(t.assetId),
])

export const workItemCodePlans = pgTable('work_item_code_plans', {
  id: uuid('id').primaryKey().defaultRandom(),
  workItemId: uuid('work_item_id').notNull().references(() => workItems.id, { onDelete: 'cascade' }),
  codePlanId: uuid('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('work_item_code_plans_item_plan_idx').on(t.workItemId, t.codePlanId),
])

export const tasks = pgTable('tasks', {
  id: uuid('id').primaryKey().defaultRandom(),
  codePlanId: uuid('code_plan_id').notNull().references(() => codePlans.id, { onDelete: 'cascade' }),
  assetId: uuid('asset_id').references(() => assets.id, { onDelete: 'set null' }),
  title: text('title').notNull(),
  description: text('description').notNull().default(''),
  status: taskStatusEnum('status').notNull().default('not_started'),
  priority: taskPriorityEnum('priority').notNull().default('medium'),
  tags: text('tags').array().notNull().default([]),
  assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
  estimatedEffort: integer('estimated_effort'), // hours
  actualEffort: integer('actual_effort'),       // hours
  source: text('source').notNull().default('native'),
  connectionId: uuid('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  externalId: text('external_id'),
  externalKey: text('external_key'),
  externalUrl: text('external_url'),
  externalData: jsonb('external_data').notNull().default({}),
  externalDeleted: boolean('external_deleted').notNull().default(false),
  syncedAt: timestamp('synced_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  uniqueIndex('tasks_connection_external_idx').on(t.connectionId, t.externalId),
])

export const syncLog = pgTable('sync_log', {
  id: uuid('id').primaryKey().defaultRandom(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  connectionId: uuid('connection_id').references(() => integrations.id, { onDelete: 'set null' }),
  entityType: text('entity_type').notNull(), // 'work_item' | 'task' | 'code_plan' | 'asset' | 'product'
  entityId: uuid('entity_id').notNull(),
  event: text('event').notNull(),
  // Null when a connection (not a user) is the actor.
  actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
  payload: jsonb('payload').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  index('sync_log_org_created_idx').on(t.organizationId, t.createdAt),
])

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  keyHash: text('key_hash').notNull().unique(),
  keyPrefix: text('key_prefix').notNull(),
  scope: text('scope').notNull().default('read'), // 'read' | 'write'
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
