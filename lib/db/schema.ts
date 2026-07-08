// Barrel export — loads the right schema at runtime based on DB_PROVIDER.
// TypeScript types are anchored to schema.pg (PostgreSQL mode) for full IDE support.
// In SQLite mode the runtime objects come from schema.sqlite; both export the same
// table names so queries work correctly. Minor TS errors in SQLite mode are suppressed
// by next.config.mjs#typescript.ignoreBuildErrors.
/* eslint-disable @typescript-eslint/no-require-imports */

const _schema: typeof import('./schema.pg') =
  process.env.DB_PROVIDER === 'sqlite'
    ? require('./schema.sqlite')
    : require('./schema.pg')

export const {
  users,
  organizations,
  organizationMembers,
  integrations,
  products,
  assets,
  assetDependencies,
  codePlans,
  codePlanAssets,
  codePlanAssignees,
  workItems,
  workItemCodePlans,
  tasks,
  syncLog,
  apiKeys,
  emailVerificationTokens,
  // pg enums — undefined in SQLite mode (not used in app code, only in schema definitions)
  userRoleEnum,
  billingTierEnum,
  assetTypeEnum,
  assetHealthEnum,
  assetStatusEnum,
  dependencyTypeEnum,
  codePlanStatusEnum,
  codePlanTypeEnum,
  taskStatusEnum,
  taskPriorityEnum,
  workItemTypeEnum,
  workItemStatusEnum,
  workItemSeverityEnum,
  prStatusEnum,
} = _schema
