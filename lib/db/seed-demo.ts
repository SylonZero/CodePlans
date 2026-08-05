/**
 * Demo seed — populates the database with a realistic multi-user dataset.
 *
 * Run with: pnpm db:seed-demo
 *
 * Safe to re-run: checks for existing data before inserting.
 * Works in both postgres (Supabase) and sqlite (local) modes.
 *
 * All demo accounts use password: Password1!
 */

import { db } from './index'
import {
  users,
  organizations,
  organizationMembers,
  products,
  assets,
  assetOwners,
  assetDependencies,
  codePlans,
  codePlanAssets,
  tasks,
  workItems,
  workItemCodePlans,
  releases,
  releaseAssets,
  assetDesignLog,
  assetCapabilities,
  syncLog,
} from './schema'
import { eq, inArray } from 'drizzle-orm'
import { authAdapter } from '@/lib/auth'
import { graduateWorkItem } from './mutations'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function profileExists(id: string): Promise<boolean> {
  const row = await db.query.users.findFirst({ where: eq(users.id, id) })
  return !!row
}

// ---------------------------------------------------------------------------
// Seed
// ---------------------------------------------------------------------------

async function seed() {
  console.log('\n🌱 Seeding demo data...\n')

  // ── Auth users + profiles ─────────────────────────────────────────────────
  // adminCreateUser handles auth layer (Supabase Admin API or local DB insert).
  // Subsequent profile upsert sets role/billingTier regardless of mode.
  console.log('Creating auth users...')
  const [alexId, sarahId, mikeId, lisaId, jamesId] = await Promise.all([
    authAdapter.adminCreateUser('alex.chen@codeplans.local',  'Password1!', 'Alex Chen'),
    authAdapter.adminCreateUser('sarah.kim@codeplans.local',  'Password1!', 'Sarah Kim'),
    authAdapter.adminCreateUser('mike.jones@codeplans.local', 'Password1!', 'Mike Jones'),
    authAdapter.adminCreateUser('lisa.wang@codeplans.local',  'Password1!', 'Lisa Wang'),
    authAdapter.adminCreateUser('james.lee@codeplans.local',  'Password1!', 'James Lee'),
  ])

  console.log('\nCreating user profiles...')
  const profileData = [
    { id: alexId,   email: 'alex.chen@codeplans.local',   name: 'Alex Chen',   billingTier: 'pro' as const, role: 'owner' as const },
    { id: sarahId,  email: 'sarah.kim@codeplans.local',   name: 'Sarah Kim',   billingTier: 'pro' as const, role: 'admin' as const },
    { id: mikeId,   email: 'mike.jones@codeplans.local',  name: 'Mike Jones',  billingTier: 'pro' as const, role: 'editor' as const },
    { id: lisaId,   email: 'lisa.wang@codeplans.local',   name: 'Lisa Wang',   billingTier: 'pro' as const, role: 'editor' as const },
    { id: jamesId,  email: 'james.lee@codeplans.local',   name: 'James Lee',   billingTier: 'pro' as const, role: 'viewer' as const },
  ]

  for (const p of profileData) {
    if (await profileExists(p.id)) {
      // Row already exists (local mode: adminCreateUser created it) — update profile fields
      await db.update(users)
        .set({ name: p.name, billingTier: p.billingTier, role: p.role, featureFlags: {} })
        .where(eq(users.id, p.id))
      console.log(`  updated profile: ${p.email}`)
    } else {
      await db.insert(users).values({ ...p, featureFlags: {} })
      console.log(`  created profile: ${p.email}`)
    }
  }

  // ── Organization ──────────────────────────────────────────────────────────
  console.log('\nCreating organization...')
  let orgId: string

  const existingOrg = await db.query.organizations.findFirst({
    where: eq(organizations.slug, 'codeplans'),
  })

  if (existingOrg) {
    orgId = existingOrg.id
    console.log('  organization exists: Codeplans')
  } else {
    const [org] = await db
      .insert(organizations)
      .values({
        name: 'Codeplans',
        slug: 'codeplans',
        ownerId: alexId,
        billingTier: 'pro',
        productLimit: 10,
      })
      .returning()
    orgId = org.id
    console.log('  created organization: Codeplans')
  }

  // ── Organization members ──────────────────────────────────────────────────
  // Alex founded the org; Sarah and Mike were invited by Alex;
  // Lisa and James were invited by Sarah.
  console.log('\nCreating organization members...')
  const memberData = [
    { userId: alexId,  role: 'owner'  as const, invitedBy: null,    joinedAt: new Date('2026-01-10') },
    { userId: sarahId, role: 'admin'  as const, invitedBy: alexId,  joinedAt: new Date('2026-01-12') },
    { userId: mikeId,  role: 'editor' as const, invitedBy: alexId,  joinedAt: new Date('2026-01-15') },
    { userId: lisaId,  role: 'editor' as const, invitedBy: sarahId, joinedAt: new Date('2026-02-03') },
    { userId: jamesId, role: 'viewer' as const, invitedBy: sarahId, joinedAt: new Date('2026-02-10') },
  ]

  for (const m of memberData) {
    const existing = await db.query.organizationMembers.findFirst({
      where: (om, { and, eq }) => and(
        eq(om.organizationId, orgId),
        eq(om.userId, m.userId)
      ),
    })
    if (existing) {
      console.log(`  member exists: ${m.userId}`)
    } else {
      await db.insert(organizationMembers).values({
        organizationId: orgId,
        userId: m.userId,
        role: m.role,
        ...(m.invitedBy ? { invitedBy: m.invitedBy } : {}),
        joinedAt: m.joinedAt,
      })
      console.log(`  added member: ${m.role} — ${m.userId}`)
    }
  }

  // Update user organizationIds
  await db
    .update(users)
    .set({ organizationId: orgId })
    .where(inArray(users.id, [alexId, sarahId, mikeId, lisaId, jamesId]))

  // ── Products ───────────────────────────────────────────────────────────────
  console.log('\nCreating products...')

  async function findOrCreateProduct(slug: string, values: typeof products.$inferInsert) {
    const existing = await db.query.products.findFirst({ where: eq(products.slug, slug) })
    if (existing) {
      console.log(`  product exists: ${slug}`)
      return existing.id
    }
    const [p] = await db.insert(products).values(values).returning()
    console.log(`  created product: ${slug}`)
    return p.id
  }

  const platformId = await findOrCreateProduct('codeplans-platform', {
    name: 'Codeplans Platform',
    slug: 'codeplans-platform',
    description: 'Core SaaS web application — plan, track, and ship code changes',
    tags: ['nextjs', 'saas', 'production'],
    organizationId: orgId,
    creatorId: alexId,
  })

  const apiId = await findOrCreateProduct('codeplans-api', {
    name: 'Codeplans API',
    slug: 'codeplans-api',
    description: 'Backend API services, data infrastructure, and background workers',
    tags: ['api', 'backend', 'production'],
    organizationId: orgId,
    creatorId: alexId,
  })

  const mobileId = await findOrCreateProduct('codeplans-mobile', {
    name: 'Codeplans Mobile',
    slug: 'codeplans-mobile',
    description: 'iOS and Android companion apps for on-the-go plan management',
    tags: ['mobile', 'react-native', 'production'],
    organizationId: orgId,
    creatorId: sarahId,
  })

  // ── Assets ─────────────────────────────────────────────────────────────────
  console.log('\nCreating assets...')

  async function findOrCreateAsset(productId: string, name: string, values: typeof assets.$inferInsert) {
    const existing = await db.query.assets.findFirst({
      where: (a, { and, eq }) => and(eq(a.productId, productId), eq(a.name, name)),
    })
    if (existing) {
      console.log(`  asset exists: ${name}`)
      return existing.id
    }
    const [a] = await db.insert(assets).values(values).returning()
    console.log(`  created asset: ${name}`)
    return a.id
  }

  // Codeplans Platform
  const webAppId = await findOrCreateAsset(platformId, 'Web Application', {
    productId: platformId, name: 'Web Application', type: 'app',
    description: 'Next.js customer-facing web app',
    tags: ['nextjs', 'frontend', 'production'], health: 'healthy', techDebtScore: 15,
  })
  const planEngineId = await findOrCreateAsset(platformId, 'Plan Engine', {
    productId: platformId, name: 'Plan Engine', type: 'service',
    description: 'Core code plan generation and management service',
    tags: ['nodejs', 'backend', 'production'], health: 'warning', techDebtScore: 42,
  })
  const authSvcId = await findOrCreateAsset(platformId, 'Auth Service', {
    productId: platformId, name: 'Auth Service', type: 'service',
    description: 'Authentication and authorization service',
    tags: ['nodejs', 'auth', 'production'], health: 'healthy', techDebtScore: 12,
  })
  const postgresId = await findOrCreateAsset(platformId, 'PostgreSQL Primary', {
    productId: platformId, name: 'PostgreSQL Primary', type: 'datastore',
    description: 'Primary PostgreSQL database cluster',
    tags: ['postgres', 'database', 'production'], health: 'healthy', techDebtScore: 8,
  })
  const redisId = await findOrCreateAsset(platformId, 'Redis Cache', {
    productId: platformId, name: 'Redis Cache', type: 'datastore',
    description: 'Redis caching layer',
    tags: ['redis', 'cache', 'production'], health: 'healthy', techDebtScore: 5,
  })
  const stripeId = await findOrCreateAsset(platformId, 'Stripe Billing', {
    productId: platformId, name: 'Stripe Billing', type: 'platform',
    description: 'Stripe subscription billing integration',
    tags: ['payments', 'stripe', 'production'], health: 'healthy', techDebtScore: 10,
  })
  const uiLibId = await findOrCreateAsset(platformId, 'UI Component Library', {
    productId: platformId, name: 'UI Component Library', type: 'library',
    description: 'Shared React component library',
    tags: ['react', 'frontend', 'shared'], health: 'warning', techDebtScore: 35,
  })
  const searchId = await findOrCreateAsset(platformId, 'Search & Indexing', {
    productId: platformId, name: 'Search & Indexing', type: 'service',
    description: 'Full-text search and indexing service',
    tags: ['search', 'backend', 'production'], health: 'healthy', techDebtScore: 20,
  })

  // Codeplans API
  const apiGatewayId = await findOrCreateAsset(apiId, 'API Gateway', {
    productId: apiId, name: 'API Gateway', type: 'service',
    description: 'Public-facing API gateway and rate limiter',
    tags: ['api', 'backend', 'production'], health: 'healthy', techDebtScore: 18,
  })
  const workerSvcId = await findOrCreateAsset(apiId, 'Worker Service', {
    productId: apiId, name: 'Worker Service', type: 'service',
    description: 'Background job processing service',
    tags: ['nodejs', 'backend', 'production'], health: 'healthy', techDebtScore: 22,
  })
  const analyticsDbId = await findOrCreateAsset(apiId, 'Analytics DB', {
    productId: apiId, name: 'Analytics DB', type: 'datastore',
    description: 'ClickHouse analytics database',
    tags: ['clickhouse', 'analytics', 'internal'], health: 'critical', techDebtScore: 55,
  })
  const notifSvcId = await findOrCreateAsset(apiId, 'Notification Service', {
    productId: apiId, name: 'Notification Service', type: 'service',
    description: 'Email, push, and in-app notification delivery',
    tags: ['nodejs', 'notifications', 'production'], health: 'warning', techDebtScore: 30,
  })

  // Codeplans Mobile
  const iosId = await findOrCreateAsset(mobileId, 'iOS App', {
    productId: mobileId, name: 'iOS App', type: 'app',
    description: 'Native iOS application',
    tags: ['swift', 'mobile', 'production'], health: 'healthy', techDebtScore: 12,
  })
  const androidId = await findOrCreateAsset(mobileId, 'Android App', {
    productId: mobileId, name: 'Android App', type: 'app',
    description: 'Native Android application',
    tags: ['kotlin', 'mobile', 'production'], health: 'warning', techDebtScore: 28,
  })
  const bffId = await findOrCreateAsset(mobileId, 'Mobile BFF', {
    productId: mobileId, name: 'Mobile BFF', type: 'service',
    description: 'Backend for Frontend mobile service',
    tags: ['nodejs', 'backend', 'production'], health: 'healthy', techDebtScore: 18,
  })

  // ── Code Plans ─────────────────────────────────────────────────────────────
  console.log('\nCreating code plans...')

  async function findOrCreatePlan(
    title: string,
    values: typeof codePlans.$inferInsert & { targetAssetIds?: string[] },
  ) {
    const existing = await db.query.codePlans.findFirst({
      where: (p, { eq }) => eq(p.title, title),
    })
    if (existing) {
      console.log(`  plan exists: ${title}`)
      return existing.id
    }
    const { targetAssetIds: _t, ...columns } = values
    const [p] = await db.insert(codePlans).values(columns).returning()
    const assetIds = (values.targetAssetIds ?? []) as string[]
    if (assetIds.length > 0) {
      await db.insert(codePlanAssets).values(assetIds.map((assetId) => ({ codePlanId: p.id, assetId })))
    }
    console.log(`  created plan: ${title}`)
    return p.id
  }

  const aiPlanId = await findOrCreatePlan('AI Plan Generator', {
    title: 'AI Plan Generator',
    description: 'Integrate LLM-powered code plan generation from natural language prompts',
    productId: platformId, type: 'feature', status: 'active',
    tags: ['ai', 'llm', 'q2'],
    targetAssetIds: [webAppId, planEngineId],
    startDate: '2026-04-01', endDate: '2026-05-20', deadline: '2026-06-01',
    creatorId: alexId,
  })

  const collabPlanId = await findOrCreatePlan('Real-time Collaboration', {
    title: 'Real-time Collaboration',
    description: 'Add multiplayer editing and live presence indicators to code plans',
    productId: platformId, type: 'feature', status: 'active',
    tags: ['realtime', 'websockets', 'collab'],
    targetAssetIds: [webAppId, planEngineId, redisId],
    startDate: '2026-04-15', endDate: '2026-06-01', deadline: '2026-06-15',
    creatorId: sarahId,
  })

  const uiLibPlanId = await findOrCreatePlan('Component Library v2', {
    title: 'Component Library v2',
    description: 'Major update to shared component library with accessibility and dark mode improvements',
    productId: platformId, type: 'improvement', status: 'active',
    tags: ['frontend', 'a11y', 'design-system'],
    targetAssetIds: [uiLibId],
    startDate: '2026-03-01', endDate: '2026-04-15', deadline: '2026-04-20',
    creatorId: mikeId,
  })

  const apiV2PlanId = await findOrCreatePlan('API Gateway v2', {
    title: 'API Gateway v2',
    description: 'Rewrite API gateway with improved rate limiting, versioning, and observability',
    productId: apiId, type: 'refactor', status: 'active',
    tags: ['api', 'backend', 'performance'],
    targetAssetIds: [apiGatewayId, workerSvcId],
    startDate: '2026-03-20', endDate: '2026-05-10', deadline: '2026-05-20',
    creatorId: sarahId,
  })

  const analyticsPlanId = await findOrCreatePlan('Analytics Pipeline Overhaul', {
    title: 'Analytics Pipeline Overhaul',
    description: 'Fix critical performance issues and rebuild the analytics data pipeline',
    productId: apiId, type: 'bugfix', status: 'active',
    tags: ['analytics', 'performance', 'urgent'],
    targetAssetIds: [analyticsDbId],
    startDate: '2026-05-01', endDate: '2026-05-31', deadline: '2026-06-07',
    creatorId: alexId,
  })

  const pushPlanId = await findOrCreatePlan('Push Notifications', {
    title: 'Push Notifications',
    description: 'Implement push notification system for plan updates and @mentions',
    productId: mobileId, type: 'feature', status: 'active',
    tags: ['mobile', 'notifications', 'feature'],
    targetAssetIds: [iosId, androidId, bffId],
    startDate: '2026-04-10', endDate: '2026-05-15', deadline: '2026-05-20',
    creatorId: sarahId,
  })

  const androidPlanId = await findOrCreatePlan('Android Performance Optimization', {
    title: 'Android Performance Optimization',
    description: 'Improve Android app startup time and reduce memory footprint',
    productId: mobileId, type: 'improvement', status: 'active',
    tags: ['mobile', 'android', 'performance'],
    targetAssetIds: [androidId],
    startDate: '2026-05-10', endDate: '2026-06-05', deadline: '2026-06-10',
    creatorId: lisaId,
  })

  await findOrCreatePlan('SSO & OAuth Integration', {
    title: 'SSO & OAuth Integration',
    description: 'Add SSO support via Google, GitHub, and enterprise SAML providers',
    productId: platformId, type: 'refactor', status: 'completed',
    tags: ['auth', 'sso', 'oauth'],
    targetAssetIds: [authSvcId],
    startDate: '2026-01-20', endDate: '2026-03-10', deadline: '2026-03-15',
    creatorId: alexId,
  })

  await findOrCreatePlan('Database Schema v2', {
    title: 'Database Schema v2',
    description: 'Consolidate tables, add missing indexes, and remove deprecated columns',
    productId: apiId, type: 'refactor', status: 'draft',
    tags: ['database', 'maintenance'],
    targetAssetIds: [postgresId],
    creatorId: alexId,
  })

  // ── Tasks ──────────────────────────────────────────────────────────────────
  console.log('\nCreating tasks...')

  async function findOrCreateTask(title: string, codePlanId: string, values: typeof tasks.$inferInsert) {
    const existing = await db.query.tasks.findFirst({
      where: (t, { and, eq }) => and(eq(t.title, title), eq(t.codePlanId, codePlanId)),
    })
    if (existing) {
      console.log(`  task exists: ${title}`)
      return
    }
    await db.insert(tasks).values(values)
    console.log(`  created task: ${title}`)
  }

  // AI Plan Generator tasks
  const aiTasks = [
    { title: 'Design prompt schema and context window', assetId: planEngineId, status: 'done' as const, priority: 'high' as const, assigneeId: alexId, estimatedEffort: 6, actualEffort: 7, tags: ['ai', 'design'] },
    { title: 'Integrate Anthropic Claude API', assetId: planEngineId, status: 'done' as const, priority: 'critical' as const, assigneeId: alexId, estimatedEffort: 8, actualEffort: 9, tags: ['ai', 'api'] },
    { title: 'Build prompt editor UI component', assetId: webAppId, status: 'done' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 10, actualEffort: 11, tags: ['frontend', 'ui'] },
    { title: 'Add streaming response support', assetId: planEngineId, status: 'done' as const, priority: 'high' as const, assigneeId: alexId, estimatedEffort: 5, actualEffort: 6, tags: ['ai', 'streaming'] },
    { title: 'Implement plan diff preview', assetId: webAppId, status: 'in_progress' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 8, tags: ['frontend', 'ui'] },
    { title: 'Add model selection and temperature controls', assetId: webAppId, status: 'in_progress' as const, priority: 'medium' as const, assigneeId: alexId, estimatedEffort: 4, tags: ['ai', 'settings'] },
    { title: 'Write AI generation tests', assetId: planEngineId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: alexId, estimatedEffort: 6, tags: ['testing', 'ai'] },
    { title: 'Add usage metering and rate limits', assetId: planEngineId, status: 'not_started' as const, priority: 'high' as const, assigneeId: alexId, estimatedEffort: 5, tags: ['backend', 'billing'] },
    { title: 'UX polish and loading states', assetId: webAppId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: mikeId, estimatedEffort: 4, tags: ['frontend', 'ux'] },
    { title: 'Write E2E tests for generation flow', assetId: webAppId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: mikeId, estimatedEffort: 5, tags: ['testing', 'e2e'] },
  ]

  for (const t of aiTasks) {
    await findOrCreateTask(t.title, aiPlanId, { ...t, codePlanId: aiPlanId, description: '' })
  }

  // Real-time Collaboration tasks
  const collabTasks = [
    { title: 'Evaluate WebSocket vs SSE approach', assetId: planEngineId, status: 'done' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 4, actualEffort: 5, tags: ['realtime', 'design'] },
    { title: 'Set up Liveblocks integration', assetId: planEngineId, status: 'done' as const, priority: 'critical' as const, assigneeId: sarahId, estimatedEffort: 6, actualEffort: 8, tags: ['realtime', 'backend'] },
    { title: 'Add live cursors and presence indicators', assetId: webAppId, status: 'in_progress' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 10, tags: ['frontend', 'realtime'] },
    { title: 'Implement conflict-free plan merging (CRDT)', assetId: planEngineId, status: 'in_progress' as const, priority: 'critical' as const, assigneeId: sarahId, estimatedEffort: 16, tags: ['backend', 'crdt'] },
    { title: 'Add user avatars in editor toolbar', assetId: webAppId, status: 'not_started' as const, priority: 'low' as const, assigneeId: lisaId, estimatedEffort: 3, tags: ['frontend', 'ui'] },
    { title: 'Broadcast task status changes in real time', assetId: planEngineId, status: 'not_started' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 6, tags: ['backend', 'realtime'] },
    { title: 'Write collab integration tests', assetId: planEngineId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: lisaId, estimatedEffort: 6, tags: ['testing', 'realtime'] },
  ]

  for (const t of collabTasks) {
    await findOrCreateTask(t.title, collabPlanId, { ...t, codePlanId: collabPlanId, description: '' })
  }

  // Component Library v2 tasks
  const uiLibTasks = [
    { title: 'Audit existing component accessibility', assetId: uiLibId, status: 'done' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 6, actualEffort: 8, tags: ['a11y', 'audit'] },
    { title: 'Update Button and Input component variants', assetId: uiLibId, status: 'done' as const, priority: 'medium' as const, assigneeId: mikeId, estimatedEffort: 4, actualEffort: 4, tags: ['components', 'design'] },
    { title: 'Add keyboard navigation support', assetId: uiLibId, status: 'done' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 10, actualEffort: 11, tags: ['a11y', 'keyboard'] },
    { title: 'Add dark mode token system', assetId: uiLibId, status: 'done' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 8, actualEffort: 9, tags: ['design', 'dark-mode'] },
    { title: 'Update modal and dialog components', assetId: uiLibId, status: 'done' as const, priority: 'medium' as const, assigneeId: mikeId, estimatedEffort: 5, actualEffort: 5, tags: ['components', 'a11y'] },
    { title: 'Write Storybook stories for all components', assetId: uiLibId, status: 'done' as const, priority: 'low' as const, assigneeId: mikeId, estimatedEffort: 6, actualEffort: 7, tags: ['docs', 'storybook'] },
    { title: 'Publish v2.0.0-rc to npm', assetId: uiLibId, status: 'done' as const, priority: 'high' as const, assigneeId: mikeId, estimatedEffort: 2, actualEffort: 2, tags: ['release', 'npm'] },
    { title: 'Migrate Web Application to v2', assetId: webAppId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: mikeId, estimatedEffort: 8, tags: ['migration', 'frontend'] },
  ]

  for (const t of uiLibTasks) {
    await findOrCreateTask(t.title, uiLibPlanId, { ...t, codePlanId: uiLibPlanId, description: '' })
  }

  // API Gateway v2 tasks
  const apiV2Tasks = [
    { title: 'Document current API surface and contracts', assetId: apiGatewayId, status: 'done' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 5, actualEffort: 6, tags: ['api', 'docs'] },
    { title: 'Design v2 routing and versioning strategy', assetId: apiGatewayId, status: 'done' as const, priority: 'critical' as const, assigneeId: sarahId, estimatedEffort: 8, actualEffort: 9, tags: ['api', 'design'] },
    { title: 'Implement per-tenant rate limiting', assetId: apiGatewayId, status: 'in_progress' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 10, tags: ['backend', 'rate-limiting'] },
    { title: 'Add OpenTelemetry tracing', assetId: workerSvcId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: lisaId, estimatedEffort: 6, tags: ['observability', 'backend'] },
    { title: 'Migrate worker jobs to new gateway', assetId: workerSvcId, status: 'not_started' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 8, tags: ['backend', 'migration'] },
  ]

  for (const t of apiV2Tasks) {
    await findOrCreateTask(t.title, apiV2PlanId, { ...t, codePlanId: apiV2PlanId, description: '' })
  }

  // Analytics Pipeline Overhaul tasks
  const analyticsTasks = [
    { title: 'Profile slow ClickHouse queries', assetId: analyticsDbId, status: 'done' as const, priority: 'critical' as const, assigneeId: alexId, estimatedEffort: 4, actualEffort: 5, tags: ['analytics', 'profiling'] },
    { title: 'Add missing materialized views', assetId: analyticsDbId, status: 'done' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 6, actualEffort: 6, tags: ['database', 'analytics'] },
    { title: 'Rebuild event ingestion pipeline', assetId: analyticsDbId, status: 'in_progress' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 10, tags: ['analytics', 'pipeline'] },
    { title: 'Add Redis query result caching', assetId: analyticsDbId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: alexId, estimatedEffort: 5, tags: ['caching', 'performance'] },
    { title: 'Set up Grafana monitoring alerts', assetId: analyticsDbId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: alexId, estimatedEffort: 3, tags: ['monitoring', 'devops'] },
    { title: 'Load test after optimizations', assetId: analyticsDbId, status: 'not_started' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 4, tags: ['testing', 'performance'] },
  ]

  for (const t of analyticsTasks) {
    await findOrCreateTask(t.title, analyticsPlanId, { ...t, codePlanId: analyticsPlanId, description: '' })
  }

  // Push Notifications tasks
  const pushTasks = [
    { title: 'Set up FCM and APNs credentials', assetId: bffId, status: 'done' as const, priority: 'critical' as const, assigneeId: sarahId, estimatedEffort: 3, actualEffort: 4, tags: ['mobile', 'config'] },
    { title: 'Implement notification service in BFF', assetId: bffId, status: 'done' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 8, actualEffort: 9, tags: ['backend', 'notifications'] },
    { title: 'iOS push notification integration', assetId: iosId, status: 'done' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 6, actualEffort: 6, tags: ['ios', 'swift'] },
    { title: 'Android push notification integration', assetId: androidId, status: 'done' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 6, actualEffort: 7, tags: ['android', 'kotlin'] },
    { title: 'Notification preferences UI', assetId: iosId, status: 'done' as const, priority: 'medium' as const, assigneeId: sarahId, estimatedEffort: 4, actualEffort: 4, tags: ['mobile', 'ui'] },
    { title: 'Deep link handling for plan mentions', assetId: bffId, status: 'in_progress' as const, priority: 'medium' as const, assigneeId: sarahId, estimatedEffort: 5, tags: ['mobile', 'deeplinks'] },
    { title: 'Analytics tracking for push events', assetId: bffId, status: 'not_started' as const, priority: 'low' as const, assigneeId: sarahId, estimatedEffort: 3, tags: ['analytics', 'mobile'] },
    { title: 'Write push notification tests', assetId: bffId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: sarahId, estimatedEffort: 4, tags: ['testing', 'mobile'] },
    { title: 'QA on physical devices', status: 'not_started' as const, priority: 'high' as const, assigneeId: sarahId, estimatedEffort: 6, tags: ['qa', 'mobile'] },
    { title: 'Phased rollout plan', status: 'not_started' as const, priority: 'medium' as const, assigneeId: sarahId, estimatedEffort: 2, tags: ['release', 'mobile'] },
  ]

  for (const t of pushTasks) {
    await findOrCreateTask(t.title, pushPlanId, { ...t, codePlanId: pushPlanId, description: '' })
  }

  // Android Optimization tasks
  const androidTasks = [
    { title: 'Profile app startup with Android Studio', assetId: androidId, status: 'done' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 3, actualEffort: 4, tags: ['android', 'profiling'] },
    { title: 'Reduce startup dependencies', assetId: androidId, status: 'not_started' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 8, tags: ['android', 'performance'] },
    { title: 'Implement lazy loading for modules', assetId: androidId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: lisaId, estimatedEffort: 6, tags: ['android', 'performance'] },
    { title: 'Optimize image loading and caching', assetId: androidId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: lisaId, estimatedEffort: 5, tags: ['android', 'images'] },
    { title: 'Memory leak detection and fixes', assetId: androidId, status: 'not_started' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 8, tags: ['android', 'memory'] },
    { title: 'Benchmark before/after metrics', assetId: androidId, status: 'not_started' as const, priority: 'medium' as const, assigneeId: lisaId, estimatedEffort: 4, tags: ['android', 'benchmarking'] },
    { title: 'Submit to Play Store', assetId: androidId, status: 'not_started' as const, priority: 'high' as const, assigneeId: lisaId, estimatedEffort: 2, tags: ['release', 'android'] },
  ]

  for (const t of androidTasks) {
    await findOrCreateTask(t.title, androidPlanId, { ...t, codePlanId: androidPlanId, description: '' })
  }

  // ── Asset metadata: repos, owners ─────────────────────────────────────────
  console.log('\nSetting asset repos and owners...')

  const repoMeta: [string, string, string][] = [
    [webAppId,     'https://github.com/codeplans/platform', 'apps/web'],
    [planEngineId, 'https://github.com/codeplans/platform', 'services/plan-engine'],
    [authSvcId,    'https://github.com/codeplans/platform', 'services/auth'],
    [uiLibId,      'https://github.com/codeplans/platform', 'packages/ui'],
    [searchId,     'https://github.com/codeplans/platform', 'services/search'],
    [apiGatewayId, 'https://github.com/codeplans/api',      'gateway'],
    [workerSvcId,  'https://github.com/codeplans/api',      'workers'],
    [bffId,        'https://github.com/codeplans/mobile',   'bff'],
    [iosId,        'https://github.com/codeplans/mobile',   'ios'],
    [androidId,    'https://github.com/codeplans/mobile',   'android'],
  ]
  for (const [assetId, repositoryUrl, repoPath] of repoMeta) {
    await db.update(assets).set({ repositoryUrl, repoPath }).where(eq(assets.id, assetId))
  }

  const ownerData: [string, string][] = [
    [webAppId, mikeId], [uiLibId, mikeId],
    [planEngineId, alexId], [authSvcId, alexId], [postgresId, alexId],
    [apiGatewayId, sarahId], [bffId, sarahId], [notifSvcId, sarahId],
    [analyticsDbId, lisaId], [androidId, lisaId], [searchId, lisaId],
  ]
  for (const [assetId, userId] of ownerData) {
    const existing = await db.query.assetOwners.findFirst({
      where: (o, { and, eq }) => and(eq(o.assetId, assetId), eq(o.userId, userId)),
    })
    if (!existing) await db.insert(assetOwners).values({ assetId, userId })
  }
  console.log(`  set ${repoMeta.length} repos, ${ownerData.length} owners`)

  // ── Asset dependencies ────────────────────────────────────────────────────
  console.log('\nCreating asset dependencies...')

  const edges: [string, string, 'depends_on' | 'integrates_with' | 'aggregates', string][] = [
    [webAppId,     planEngineId, 'depends_on',      'All plan CRUD and generation flows'],
    [webAppId,     authSvcId,    'depends_on',      'Session validation on every request'],
    [webAppId,     uiLibId,      'depends_on',      'Design-system components'],
    [planEngineId, postgresId,   'depends_on',      'Primary persistence'],
    [planEngineId, redisId,      'depends_on',      'Plan draft cache + realtime presence'],
    [searchId,     postgresId,   'depends_on',      'Indexes plan and task content'],
    [authSvcId,    postgresId,   'depends_on',      'User and session store'],
    [webAppId,     stripeId,     'integrates_with', 'Checkout and billing portal'],
    [apiGatewayId, authSvcId,    'integrates_with', 'Token introspection'],
    [workerSvcId,  postgresId,   'depends_on',      'Job queue tables'],
    [notifSvcId,   workerSvcId,  'depends_on',      'Delivery jobs run on the worker'],
    [bffId,        apiGatewayId, 'depends_on',      'All mobile traffic routes through the gateway'],
    [iosId,        bffId,        'depends_on',      'Mobile API surface'],
    [androidId,    bffId,        'depends_on',      'Mobile API surface'],
  ]
  for (const [sourceAssetId, targetAssetId, dependencyType, description] of edges) {
    const existing = await db.query.assetDependencies.findFirst({
      where: (e, { and, eq }) => and(eq(e.sourceAssetId, sourceAssetId), eq(e.targetAssetId, targetAssetId)),
    })
    if (!existing) await db.insert(assetDependencies).values({ sourceAssetId, targetAssetId, dependencyType, description })
  }
  console.log(`  ensured ${edges.length} dependency edges`)

  // ── Additional completed plans (history depth) ────────────────────────────
  console.log('\nCreating completed plans for history...')

  const searchPlanId = await findOrCreatePlan('Search Relevance Tuning', {
    title: 'Search Relevance Tuning',
    description: 'Rank plan search results by recency and ownership; add typo tolerance',
    productId: platformId, type: 'improvement', status: 'completed',
    tags: ['search', 'relevance'],
    targetAssetIds: [searchId],
    startDate: '2026-02-01', endDate: '2026-03-05', deadline: '2026-03-10',
    creatorId: lisaId,
    createdAt: new Date('2026-02-01'), updatedAt: new Date('2026-03-05'),
  })

  const rnUpgradeId = await findOrCreatePlan('React Native 0.75 Upgrade', {
    title: 'React Native 0.75 Upgrade',
    description: 'Upgrade both mobile apps and the BFF client libraries to RN 0.75 with the new architecture enabled',
    productId: mobileId, type: 'refactor', status: 'completed',
    tags: ['mobile', 'upgrade'],
    targetAssetIds: [iosId, androidId],
    startDate: '2026-01-15', endDate: '2026-02-20', deadline: '2026-02-28',
    creatorId: lisaId,
    createdAt: new Date('2026-01-15'), updatedAt: new Date('2026-02-20'),
  })

  // Look up the SSO plan created above so releases/history can reference it.
  const ssoPlan = await db.query.codePlans.findFirst({
    where: (p, { eq }) => eq(p.title, 'SSO & OAuth Integration'),
  })
  const ssoPlanId = ssoPlan!.id

  // Per-asset delivery context on completed plans (branch/PR chips in history).
  const planAssetDelivery: [string, string, string, string][] = [
    [ssoPlanId,    authSvcId, 'feat/sso-saml',        'https://github.com/codeplans/platform/pull/482'],
    [searchPlanId, searchId,  'feat/search-relevance', 'https://github.com/codeplans/platform/pull/510'],
    [rnUpgradeId,  iosId,     'chore/rn-075',          'https://github.com/codeplans/mobile/pull/231'],
    [rnUpgradeId,  androidId, 'chore/rn-075',          'https://github.com/codeplans/mobile/pull/232'],
  ]
  for (const [codePlanId, assetId, branch, prUrl] of planAssetDelivery) {
    const rows = await db.query.codePlanAssets.findMany({
      where: (cpa, { and, eq }) => and(eq(cpa.codePlanId, codePlanId), eq(cpa.assetId, assetId)),
    })
    for (const row of rows) {
      await db.update(codePlanAssets).set({ branch, prUrl, prStatus: 'merged' }).where(eq(codePlanAssets.id, row.id))
    }
  }

  // Tasks for the completed plans so progress reads 100%.
  const doneTaskSets: [string, { title: string; assetId?: string }[]][] = [
    [ssoPlanId, [
      { title: 'Add SAML assertion parsing', assetId: authSvcId },
      { title: 'Google & GitHub OAuth flows', assetId: authSvcId },
      { title: 'Enterprise IdP configuration UI', assetId: authSvcId },
    ]],
    [searchPlanId, [
      { title: 'Recency + ownership ranking signals', assetId: searchId },
      { title: 'Typo-tolerant matching', assetId: searchId },
    ]],
    [rnUpgradeId, [
      { title: 'Upgrade iOS project to RN 0.75', assetId: iosId },
      { title: 'Upgrade Android project to RN 0.75', assetId: androidId },
      { title: 'Enable new architecture + regression pass' },
    ]],
  ]
  for (const [planId, ts] of doneTaskSets) {
    for (const t of ts) {
      await findOrCreateTask(t.title, planId, {
        title: t.title, codePlanId: planId, assetId: t.assetId, description: '',
        status: 'done', priority: 'high', tags: [], estimatedEffort: 5, actualEffort: 5,
      })
    }
  }

  // ── Work items (demand: features, bugs, UX, tech debt) ────────────────────
  console.log('\nCreating work items...')

  async function findOrCreateWorkItem(
    title: string,
    values: typeof workItems.$inferInsert,
    linkPlanIds: string[] = [],
  ) {
    let row = await db.query.workItems.findFirst({ where: (w, { eq }) => eq(w.title, title) })
    if (!row) {
      const [created] = await db.insert(workItems).values(values).returning()
      row = created
      console.log(`  created work item: ${title}`)
    }
    for (const codePlanId of linkPlanIds) {
      const link = await db.query.workItemCodePlans.findFirst({
        where: (l, { and, eq }) => and(eq(l.workItemId, row!.id), eq(l.codePlanId, codePlanId)),
      })
      if (!link) await db.insert(workItemCodePlans).values({ workItemId: row.id, codePlanId })
    }
    return row.id
  }

  // Resolved demand behind the completed plans (rich asset history).
  const ssoItemId = await findOrCreateWorkItem('SSO for enterprise customers', {
    productId: platformId, assetId: authSvcId, type: 'feature', status: 'resolved',
    title: 'SSO for enterprise customers', severity: 'high', tags: ['auth', 'enterprise'],
    reporterId: alexId, ownerId: alexId,
    description: 'SAML + OAuth sign-in so enterprise workspaces can mandate their IdP.',
    createdAt: new Date('2026-01-08'), updatedAt: new Date('2026-03-10'),
  }, [ssoPlanId])
  await findOrCreateWorkItem('Session fixation on OAuth callback', {
    productId: platformId, assetId: authSvcId, type: 'bug', status: 'resolved',
    title: 'Session fixation on OAuth callback', severity: 'critical', tags: ['auth', 'security'],
    reporterId: sarahId, ownerId: alexId, area: 'oauth/callback',
    description: 'Session cookie was not rotated after the OAuth callback completed.',
    createdAt: new Date('2026-02-02'), updatedAt: new Date('2026-03-08'),
  }, [ssoPlanId])
  await findOrCreateWorkItem('Search misses recently renamed plans', {
    productId: platformId, assetId: searchId, type: 'bug', status: 'resolved',
    title: 'Search misses recently renamed plans', severity: 'medium', tags: ['search'],
    reporterId: jamesId, ownerId: lisaId, area: 'indexer',
    description: 'Rename events were not re-indexed until the nightly rebuild.',
    createdAt: new Date('2026-02-10'), updatedAt: new Date('2026-03-05'),
  }, [searchPlanId])
  const typoSearchItemId = await findOrCreateWorkItem('Typo-tolerant search matching', {
    productId: platformId, assetId: searchId, type: 'enhancement', status: 'resolved',
    title: 'Typo-tolerant search matching', severity: 'medium', tags: ['search'],
    reporterId: jamesId, ownerId: lisaId, area: 'scoring',
    description: 'Edit-distance signal in the scoring stage so near-miss queries still rank the right plans.',
    createdAt: new Date('2026-02-12'), updatedAt: new Date('2026-03-05'),
  }, [searchPlanId])
  await findOrCreateWorkItem('Legacy bridge modules slow RN startup', {
    productId: mobileId, assetId: androidId, type: 'tech_debt', status: 'resolved',
    title: 'Legacy bridge modules slow RN startup', severity: 'high', tags: ['mobile', 'performance'],
    reporterId: lisaId, ownerId: lisaId, area: 'native-modules',
    description: 'Old bridge modules blocked the new-architecture migration and added ~400ms startup.',
    createdAt: new Date('2026-01-05'), updatedAt: new Date('2026-02-20'),
  }, [rnUpgradeId])

  // Open demand feeding the active plans.
  await findOrCreateWorkItem('Generate a plan from a prompt', {
    productId: platformId, assetId: planEngineId, type: 'feature', status: 'in_progress',
    title: 'Generate a plan from a prompt', severity: 'high', tags: ['ai'],
    reporterId: alexId, ownerId: alexId,
    description: 'Describe a change in natural language; get a draft plan with tasks and target assets.',
    createdAt: new Date('2026-03-20'), updatedAt: new Date('2026-05-12'),
  }, [aiPlanId])
  await findOrCreateWorkItem('Live presence while editing a plan', {
    productId: platformId, assetId: webAppId, type: 'feature', status: 'in_progress',
    title: 'Live presence while editing a plan', severity: 'medium', tags: ['realtime'],
    reporterId: sarahId, ownerId: sarahId,
    description: 'See who else has the plan open and where they are editing.',
    createdAt: new Date('2026-04-01'), updatedAt: new Date('2026-05-01'),
  }, [collabPlanId])
  await findOrCreateWorkItem('Analytics dashboard times out for large orgs', {
    productId: apiId, assetId: analyticsDbId, type: 'bug', status: 'in_progress',
    title: 'Analytics dashboard times out for large orgs', severity: 'critical', tags: ['analytics', 'performance'],
    reporterId: jamesId, ownerId: lisaId, area: 'queries/velocity',
    description: 'Velocity queries exceed the 30s gateway timeout for orgs with 10k+ tasks.',
    createdAt: new Date('2026-04-22'), updatedAt: new Date('2026-05-10'),
  }, [analyticsPlanId])
  await findOrCreateWorkItem('Push notifications for @mentions', {
    productId: mobileId, assetId: bffId, type: 'feature', status: 'in_progress',
    title: 'Push notifications for @mentions', severity: 'medium', tags: ['mobile', 'notifications'],
    reporterId: sarahId, ownerId: sarahId,
    description: 'Mobile push when someone mentions you on a plan or task.',
    createdAt: new Date('2026-03-28'), updatedAt: new Date('2026-05-02'),
  }, [pushPlanId])

  // Open tech debt register (drives derived scores + debt views).
  await findOrCreateWorkItem('Plan Engine: job orchestration is a god-module', {
    productId: platformId, assetId: planEngineId, type: 'tech_debt', status: 'open',
    title: 'Plan Engine: job orchestration is a god-module', severity: 'high', tags: ['backend'],
    reporterId: alexId, ownerId: alexId, area: 'orchestrator.ts',
    description: '2,400-line orchestrator mixes scheduling, retries, and persistence. Split before adding AI generation load.',
    createdAt: new Date('2026-03-02'), updatedAt: new Date('2026-03-02'),
  })
  await findOrCreateWorkItem('UI library ships two icon systems', {
    productId: platformId, assetId: uiLibId, type: 'tech_debt', status: 'open',
    title: 'UI library ships two icon systems', severity: 'medium', tags: ['frontend', 'bundle-size'],
    reporterId: mikeId, ownerId: mikeId, area: 'icons/',
    description: 'Both lucide and custom SVG sprites are bundled; consumers pay ~90kb extra.',
    createdAt: new Date('2026-03-15'), updatedAt: new Date('2026-03-15'),
  })
  await findOrCreateWorkItem('ClickHouse schema has no TTLs', {
    productId: apiId, assetId: analyticsDbId, type: 'tech_debt', status: 'open',
    title: 'ClickHouse schema has no TTLs', severity: 'critical', tags: ['analytics', 'storage'],
    reporterId: lisaId, ownerId: lisaId, area: 'events tables',
    description: 'Raw event tables grow unbounded — 2.1TB and climbing; queries degrade weekly.',
    createdAt: new Date('2026-04-05'), updatedAt: new Date('2026-04-05'),
  }, [analyticsPlanId])
  await findOrCreateWorkItem('Notification templates duplicated per channel', {
    productId: apiId, assetId: notifSvcId, type: 'tech_debt', status: 'open',
    title: 'Notification templates duplicated per channel', severity: 'medium', tags: ['notifications'],
    reporterId: sarahId, ownerId: sarahId, area: 'templates/',
    description: 'Email, push, and in-app render from three diverging template copies.',
    createdAt: new Date('2026-02-25'), updatedAt: new Date('2026-02-25'),
  })
  await findOrCreateWorkItem('Gateway retries mask upstream 5xx spikes', {
    productId: apiId, assetId: apiGatewayId, type: 'tech_debt', status: 'open',
    title: 'Gateway retries mask upstream 5xx spikes', severity: 'medium', tags: ['api', 'observability'],
    reporterId: sarahId, ownerId: sarahId, area: 'middleware/retry',
    description: 'Blanket retry policy hides real error rates from dashboards and pages nobody.',
    createdAt: new Date('2026-04-12'), updatedAt: new Date('2026-04-12'),
  }, [apiV2PlanId])

  // Open items on Auth Service (the Record tab's derived registers).
  await findOrCreateWorkItem('Passkey prompt shown twice on Safari', {
    productId: platformId, assetId: authSvcId, type: 'ux', status: 'open',
    title: 'Passkey prompt shown twice on Safari', severity: 'medium', tags: ['auth', 'safari'],
    reporterId: jamesId, ownerId: alexId, area: 'webauthn',
    description: 'Safari 18 fires the conditional-UI prompt twice when autofill races the explicit call.',
    createdAt: new Date('2026-04-18'), updatedAt: new Date('2026-04-18'),
  })
  await findOrCreateWorkItem('Token refresh duplicated across strategies', {
    productId: platformId, assetId: authSvcId, type: 'tech_debt', status: 'open',
    title: 'Token refresh duplicated across strategies', severity: 'medium', tags: ['auth'],
    reporterId: alexId, ownerId: alexId, area: 'strategies/',
    description: 'Each provider strategy carries its own refresh loop; consolidate into the token-exchange core.',
    createdAt: new Date('2026-03-20'), updatedAt: new Date('2026-03-20'),
  })

  // Untriaged backlog (open, unlinked — populates the Work Items inbox).
  await findOrCreateWorkItem('Dark mode flashes light theme on load', {
    productId: platformId, assetId: webAppId, type: 'ux', status: 'open',
    title: 'Dark mode flashes light theme on load', severity: 'low', tags: ['frontend', 'polish'],
    reporterId: jamesId, description: 'FOUC on hard refresh when the stored theme is dark.',
    createdAt: new Date('2026-05-02'), updatedAt: new Date('2026-05-02'),
  })
  await findOrCreateWorkItem('Export plans to CSV', {
    productId: platformId, type: 'feature', status: 'open',
    title: 'Export plans to CSV', severity: 'low', tags: ['reporting'],
    reporterId: jamesId, description: 'Requested by two design partners for quarterly reporting.',
    createdAt: new Date('2026-05-08'), updatedAt: new Date('2026-05-08'),
  })
  await findOrCreateWorkItem('iOS widget for active plan progress', {
    productId: mobileId, assetId: iosId, type: 'feature', status: 'planned',
    title: 'iOS widget for active plan progress', severity: 'low', tags: ['ios', 'widget'],
    reporterId: sarahId, description: 'Home-screen widget showing the top active plan and % complete.',
    createdAt: new Date('2026-04-28'), updatedAt: new Date('2026-04-28'),
  })

  // ── Releases ──────────────────────────────────────────────────────────────
  console.log('\nCreating releases...')

  async function findOrCreateRelease(name: string, values: typeof releases.$inferInsert) {
    const existing = await db.query.releases.findFirst({ where: (r, { eq }) => eq(r.name, name) })
    if (existing) {
      console.log(`  release exists: ${name}`)
      return existing.id
    }
    const [r] = await db.insert(releases).values(values).returning()
    console.log(`  created release: ${name}`)
    return r.id
  }

  const platform24Id = await findOrCreateRelease('Platform v2.4.0', {
    name: 'Platform v2.4.0', productId: platformId, status: 'shipped',
    description: 'Enterprise sign-in and search quality: SSO/SAML support and relevance-tuned search.',
    tags: ['quarterly'], creatorId: alexId,
    shippedAt: new Date('2026-03-12'),
    createdAt: new Date('2026-02-15'), updatedAt: new Date('2026-03-12'),
  })
  const mobile30Id = await findOrCreateRelease('Mobile v3.0.0', {
    name: 'Mobile v3.0.0', productId: mobileId, status: 'shipped',
    description: 'React Native 0.75 with the new architecture enabled on both apps.',
    tags: ['major'], creatorId: lisaId,
    shippedAt: new Date('2026-02-24'),
    createdAt: new Date('2026-01-20'), updatedAt: new Date('2026-02-24'),
  })
  const platform25Id = await findOrCreateRelease('Platform v2.5.0', {
    name: 'Platform v2.5.0', productId: platformId, status: 'in_progress',
    description: 'The AI release: prompt-to-plan generation and real-time collaboration.',
    tags: ['ai', 'quarterly'], creatorId: alexId,
    createdAt: new Date('2026-04-05'), updatedAt: new Date('2026-05-10'),
  })

  const releasePlanLinks: [string, string][] = [
    [ssoPlanId, platform24Id], [searchPlanId, platform24Id],
    [rnUpgradeId, mobile30Id],
    [aiPlanId, platform25Id], [collabPlanId, platform25Id],
  ]
  for (const [planId, releaseId] of releasePlanLinks) {
    await db.update(codePlans).set({ releaseId }).where(eq(codePlans.id, planId))
  }

  const releaseStamps: [string, string, string, string | null][] = [
    [platform24Id, authSvcId, 'v1.8.0', 'SAML + OAuth providers'],
    [platform24Id, webAppId,  'v2.4.0', null],
    [platform24Id, searchId,  'v1.2.0', 'relevance ranking'],
    [mobile30Id,   iosId,     'v3.0.0', 'new architecture'],
    [mobile30Id,   androidId, 'v3.0.0', 'new architecture'],
    [platform25Id, webAppId,  'v2.5.0', null],
    [platform25Id, planEngineId, 'v1.5.0', 'AI generation'],
  ]
  for (const [releaseId, assetId, version, notes] of releaseStamps) {
    const existing = await db.query.releaseAssets.findFirst({
      where: (ra, { and, eq }) => and(eq(ra.releaseId, releaseId), eq(ra.assetId, assetId)),
    })
    if (!existing) await db.insert(releaseAssets).values({ releaseId, assetId, version, notes })
  }
  console.log('  linked plans and stamped asset versions')

  // ── Layers (layers-and-boundaries-spec §3) ────────────────────────────────
  // Explicit layers only where the type default is wrong; the rest demo the
  // display-time defaults (app→frontend, service→backend, datastore→data, …).
  const layerAssignments: [string, string][] = [
    [apiGatewayId, 'edge'],
    [bffId, 'edge'],
    [planEngineId, 'domain'],
    [uiLibId, 'frontend'],
  ]
  for (const [assetId, layer] of layerAssignments) {
    await db.update(assets).set({ layer }).where(eq(assets.id, assetId))
  }
  console.log(`  assigned ${layerAssignments.length} explicit layers`)

  // ── Asset record (graduated capabilities) ─────────────────────────────────
  // Graduate the resolved features into their assets' records, then backdate
  // to the ship dates so the record reads as history. One capability is marked
  // verified (green freshness dot), one left unverified (gray) for the demo.
  console.log('\nGraduating capabilities...')

  const graduations: { workItemId: string; createdAt: Date; verifiedAt?: Date }[] = [
    { workItemId: ssoItemId, createdAt: new Date('2026-03-12'), verifiedAt: new Date('2026-03-14') },
    { workItemId: typoSearchItemId, createdAt: new Date('2026-03-12') },
  ]
  for (const g of graduations) {
    const result = await graduateWorkItem(g.workItemId)
    if ('error' in result) {
      console.log(`  skipped graduation: ${result.error}`)
      continue
    }
    if (!result.existed) {
      await db.update(assetCapabilities)
        .set({ createdAt: g.createdAt, updatedAt: g.createdAt, ...(g.verifiedAt ? { verifiedAt: g.verifiedAt } : {}) })
        .where(eq(assetCapabilities.id, result.capability.id))
      console.log(`  graduated: ${result.capability.title}`)
    } else {
      console.log(`  capability exists: ${result.capability.title}`)
    }
  }

  // ── Design log ────────────────────────────────────────────────────────────
  console.log('\nCreating design log entries...')

  const designNotes: (typeof assetDesignLog.$inferInsert & { key: string })[] = [
    {
      key: 'auth-sso', assetId: authSvcId, releaseId: platform24Id, codePlanId: ssoPlanId,
      title: 'Auth flows now terminate in a single token exchange',
      body: 'SSO work consolidated password, OAuth, and SAML flows into one token-exchange endpoint. Session issuance is now the only code path that mints cookies — future providers plug in as strategies, not new flows.',
      authorKind: 'user', authorId: alexId,
      createdAt: new Date('2026-03-11'), updatedAt: new Date('2026-03-11'),
    },
    {
      key: 'search-ranking', assetId: searchId, releaseId: platform24Id, codePlanId: searchPlanId,
      title: 'Ranking moved out of the query into a scoring stage',
      body: 'Relevance signals (recency, ownership, typo distance) are computed in a separate scoring stage after candidate retrieval. Adding a signal is now a pure function, not a query rewrite.',
      authorKind: 'user', authorId: lisaId,
      createdAt: new Date('2026-03-05'), updatedAt: new Date('2026-03-05'),
    },
    {
      key: 'rn-arch', assetId: androidId, releaseId: mobile30Id, codePlanId: rnUpgradeId,
      title: 'New architecture enabled — bridge modules retired',
      body: 'All legacy bridge modules were removed during the RN 0.75 upgrade; native features now go through TurboModules. Startup dropped ~400ms on mid-range devices. Any new native capability must ship as a TurboModule.',
      authorKind: 'agent', authorId: lisaId,
      createdAt: new Date('2026-02-20'), updatedAt: new Date('2026-02-20'),
    },
    {
      key: 'plan-engine-ai', assetId: planEngineId, releaseId: platform25Id, codePlanId: aiPlanId,
      title: 'Generation isolated behind a queue boundary',
      body: 'LLM plan generation runs as queued jobs, never inline in request handlers — the orchestrator only ever sees job results. Streaming reaches the client over the existing realtime channel rather than a second socket.',
      authorKind: 'agent', authorId: alexId,
      createdAt: new Date('2026-05-08'), updatedAt: new Date('2026-05-08'),
    },
  ]
  for (const { key: _key, ...note } of designNotes) {
    const existing = await db.query.assetDesignLog.findFirst({
      where: (n, { and, eq }) => and(eq(n.assetId, note.assetId), eq(n.title, note.title)),
    })
    if (!existing) await db.insert(assetDesignLog).values(note)
  }
  console.log(`  ensured ${designNotes.length} design notes`)

  // ── Activity events (sync_log) ────────────────────────────────────────────
  // History timelines prefer sync_log 'completed' events for plan dates, and
  // the dashboard activity feed renders these directly.
  console.log('\nCreating activity events...')

  const events: { entityType: string; entityId: string; event: string; actorId: string; payload: Record<string, unknown>; createdAt: Date }[] = [
    { entityType: 'code_plan', entityId: rnUpgradeId, event: 'completed', actorId: lisaId,  payload: { title: 'React Native 0.75 Upgrade' }, createdAt: new Date('2026-02-20') },
    { entityType: 'release',   entityId: mobile30Id, event: 'shipped',   actorId: lisaId,  payload: { name: 'Mobile v3.0.0', status: 'shipped' }, createdAt: new Date('2026-02-24') },
    { entityType: 'code_plan', entityId: searchPlanId, event: 'completed', actorId: lisaId, payload: { title: 'Search Relevance Tuning' }, createdAt: new Date('2026-03-05') },
    { entityType: 'code_plan', entityId: ssoPlanId,  event: 'completed', actorId: alexId,  payload: { title: 'SSO & OAuth Integration' }, createdAt: new Date('2026-03-10') },
    { entityType: 'release',   entityId: platform24Id, event: 'shipped', actorId: alexId,  payload: { name: 'Platform v2.4.0', status: 'shipped' }, createdAt: new Date('2026-03-12') },
    { entityType: 'release',   entityId: platform25Id, event: 'created', actorId: alexId,  payload: { name: 'Platform v2.5.0' }, createdAt: new Date('2026-04-05') },
  ]
  for (const e of events) {
    const existing = await db.query.syncLog.findFirst({
      where: (s, { and, eq }) => and(eq(s.entityId, e.entityId), eq(s.event, e.event)),
    })
    if (!existing) await db.insert(syncLog).values({ organizationId: orgId, ...e })
  }
  console.log(`  ensured ${events.length} activity events`)

  console.log('\n✅ Seed complete.\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err)
  process.exit(1)
})
