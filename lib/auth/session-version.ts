// Session versions: every session token carries the account's session version
// from when it was issued, and only works while that is still current.
// Changing or resetting the password bumps it, ending every older session.
import { eq, sql } from 'drizzle-orm'
import { db as _db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { getEnterpriseHooks } from '@/lib/ee/registry'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = _db as any

/** The account's session version, or null when the account no longer exists. */
export async function currentSessionVersion(userId: string): Promise<number | null> {
  const row = await db.query.users.findFirst({ where: eq(users.id, userId), columns: { sessionVersion: true } })
  return row ? (row.sessionVersion ?? 0) : null
}

/** Ends every session of the account issued so far. */
export async function bumpSessionVersion(userId: string): Promise<void> {
  await db.update(users).set({ sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, userId))
}

/**
 * The account a session token signs in, or null. The token must come from
 * this scope (see sessionScope in lib/ee/types.ts) and carry the account's
 * current session version; a deleted account ends all of its sessions.
 * Tokens from before versions existed count as version 0.
 */
export async function sessionUserId(token: Record<string, unknown>): Promise<string | null> {
  if (typeof token.id !== 'string') return null
  if ((token.scope ?? null) !== getEnterpriseHooks().sessionScope()) return null
  const current = await currentSessionVersion(token.id)
  return current !== null && current === ((token.sv as number | undefined) ?? 0) ? token.id : null
}
