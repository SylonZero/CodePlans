import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  timestamp,
  date,
  jsonb,
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
  targetAssetIds: uuid('target_asset_ids').array().notNull().default([]),
  startDate: date('start_date'),
  endDate: date('end_date'),
  deadline: date('deadline'),
  creatorId: uuid('creator_id').notNull().references(() => users.id),
  assigneeIds: uuid('assignee_ids').array().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
