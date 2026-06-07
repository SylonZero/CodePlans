/**
 * Bootstrap seed — creates a single admin user and default workspace.
 *
 * Run with: pnpm db:seed
 *
 * Safe to re-run: skips creation if the admin account already exists.
 * Works in both postgres (Supabase) and sqlite (local) modes.
 *
 * Default credentials:
 *   Email:    admin@example.com
 *   Password: Password1!
 */

import { db } from './index'
import { users, organizations, organizationMembers } from './schema'
import { eq } from 'drizzle-orm'
import { authAdapter } from '@/lib/auth'

const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com'
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Password1!'
const ADMIN_NAME = process.env.SEED_ADMIN_NAME ?? 'Admin'
const ORG_NAME = process.env.SEED_ORG_NAME ?? 'My Workspace'

async function seed() {
  console.log('\n🌱 Running bootstrap seed...\n')

  // ── Check if admin already exists ─────────────────────────────────────────
  const existing = await db.query.users.findFirst({
    where: eq(users.email, ADMIN_EMAIL),
  })

  if (existing) {
    console.log(`  Admin account already exists: ${ADMIN_EMAIL}`)
    console.log('  Nothing to do — exiting.\n')
    process.exit(0)
  }

  // ── Create admin user ──────────────────────────────────────────────────────
  console.log(`Creating admin user: ${ADMIN_EMAIL}`)
  const adminId = await authAdapter.adminCreateUser(ADMIN_EMAIL, ADMIN_PASSWORD, ADMIN_NAME)

  await db
    .update(users)
    .set({ role: 'owner', billingTier: 'free', featureFlags: {} })
    .where(eq(users.id, adminId))

  console.log(`  ✓ Admin user created (id: ${adminId})`)

  // ── Create default organization ────────────────────────────────────────────
  const orgSlug = ORG_NAME.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')

  const [org] = await db
    .insert(organizations)
    .values({
      name: ORG_NAME,
      slug: orgSlug,
      ownerId: adminId,
      billingTier: 'free',
      productLimit: 10,
    })
    .returning()

  console.log(`  ✓ Workspace created: "${ORG_NAME}"`)

  // ── Add admin as org owner ─────────────────────────────────────────────────
  await db.insert(organizationMembers).values({
    userId: adminId,
    organizationId: org.id,
    role: 'owner',
    joinedAt: new Date(),
  })

  await db
    .update(users)
    .set({ organizationId: org.id })
    .where(eq(users.id, adminId))

  console.log(`  ✓ Admin added to workspace as owner`)

  // ── Done ───────────────────────────────────────────────────────────────────
  console.log('\n✅ Bootstrap seed complete.\n')
  console.log('  ┌─────────────────────────────────────────┐')
  console.log(`  │  Email:    ${ADMIN_EMAIL.padEnd(29)} │`)
  console.log(`  │  Password: ${ADMIN_PASSWORD.padEnd(29)} │`)
  console.log('  └─────────────────────────────────────────┘')
  console.log('\n  Sign in at /login and change your password in Settings.\n')

  process.exit(0)
}

seed().catch((err) => {
  console.error('\n❌ Seed failed:', err)
  process.exit(1)
})
