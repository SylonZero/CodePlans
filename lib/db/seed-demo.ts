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
  codePlans,
  codePlanAssets,
  tasks,
} from './schema'
import { eq, inArray } from 'drizzle-orm'
import { authAdapter } from '@/lib/auth'

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

  console.log('\n✅ Seed complete.\n')
  process.exit(0)
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err)
  process.exit(1)
})
