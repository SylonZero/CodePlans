import {
  sqliteTable,
  text,
  integer,
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
  targetAssetIds: text('target_asset_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  startDate: text('start_date'),
  endDate: text('end_date'),
  deadline: text('deadline'),
  creatorId: text('creator_id').notNull().references(() => users.id),
  assigneeIds: text('assignee_ids', { mode: 'json' }).$type<string[]>().notNull().default([]),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

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
  estimatedEffort: integer('estimated_effort'),
  actualEffort: integer('actual_effort'),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})

export const emailVerificationTokens = sqliteTable('email_verification_tokens', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  userId: text('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  newEmail: text('new_email').notNull(),
  token: text('token').notNull().unique(),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull().$defaultFn(() => new Date()),
})
