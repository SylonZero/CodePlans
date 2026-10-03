// First run on a fresh instance: create the owner account without a shell.
// Either from ADMIN_EMAIL / ADMIN_PASSWORD at boot, or once through /setup,
// which is guarded by a setup code derived from AUTH_SECRET and printed to the
// server log (so only whoever can read the logs can claim the instance).
import { createHmac, timingSafeEqual } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { db } from './index'
import { users, organizations, organizationMembers } from './schema'
import { config } from '@/lib/config'
import { authAdapter } from '@/lib/auth'

export async function hasUsers(): Promise<boolean> {
  const row = await db.query.users.findFirst({ columns: { id: true } })
  return !!row
}

/** Local auth with an empty users table: the instance hasn't been claimed yet. */
export async function needsSetup(): Promise<boolean> {
  return config.auth.provider === 'local' && !(await hasUsers())
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // no 0/O/1/I

/** Stable across restarts and instances that share AUTH_SECRET. Format: XXXX-XXXX-XXXX. */
export function setupCode(secret = process.env.AUTH_SECRET ?? ''): string {
  if (!secret) throw new Error('AUTH_SECRET is required for first-run setup')
  const bytes = createHmac('sha256', secret).update('codeplans:first-run-setup').digest()
  const chars = Array.from(bytes.subarray(0, 12), (b) => ALPHABET[b % ALPHABET.length]).join('')
  return `${chars.slice(0, 4)}-${chars.slice(4, 8)}-${chars.slice(8)}`
}

export function checkSetupCode(input: string, secret = process.env.AUTH_SECRET ?? ''): boolean {
  if (!secret) return false
  const norm = (s: string) => Buffer.from(s.toUpperCase().replace(/[^A-Z0-9]/g, ''))
  const a = norm(input)
  const b = norm(setupCode(secret))
  return a.length === b.length && timingSafeEqual(a, b)
}

export type OwnerInput = { email: string; password: string; name: string; orgName?: string }

/** Creates the instance owner and their workspace. Returns the user id. */
export async function createOwnerAccount({ email, password, name, orgName }: OwnerInput): Promise<string> {
  const userId = await authAdapter.adminCreateUser(email, password, name)
  await db.update(users).set({ role: 'owner', billingTier: 'free', featureFlags: {} }).where(eq(users.id, userId))

  const existing = await db.query.organizationMembers.findFirst({ where: eq(organizationMembers.userId, userId) })
  if (existing) return userId

  const workspace = orgName || process.env.SEED_ORG_NAME || 'My Workspace'
  const slug = workspace.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'workspace'
  const [org] = await db.insert(organizations).values({
    name: workspace, slug, ownerId: userId, billingTier: 'free',
    productLimit: config.hostMode === 'team' ? 100 : 10,
  }).returning()
  await db.insert(organizationMembers).values({ userId, organizationId: org.id, role: 'owner', joinedAt: new Date() })
  await db.update(users).set({ organizationId: org.id }).where(eq(users.id, userId))
  return userId
}

/** Boot step: create the owner from ADMIN_EMAIL / ADMIN_PASSWORD when the instance is empty. */
export async function ensureOwnerFromEnv(env: Record<string, string | undefined> = process.env): Promise<'created' | 'skipped'> {
  const email = env.ADMIN_EMAIL || env.SEED_ADMIN_EMAIL
  const password = env.ADMIN_PASSWORD || env.SEED_ADMIN_PASSWORD
  if (!email || !password || !(await needsSetup())) return 'skipped'
  if (password.length < 8) {
    console.error('[setup] ADMIN_PASSWORD must be at least 8 characters; owner not created')
    return 'skipped'
  }
  await createOwnerAccount({ email, password, name: env.ADMIN_NAME || env.SEED_ADMIN_NAME || 'Admin' })
  console.log(`[setup] Created owner account ${email} from ADMIN_EMAIL`)
  return 'created'
}
