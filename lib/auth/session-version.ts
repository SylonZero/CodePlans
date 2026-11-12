// Session versions: every session token carries the account's session version
// from when it was issued, and only works while that is still current.
// Changing or resetting the password bumps it, ending every older session.
// Each token also carries its own id (sid); signing out lists that id in
// ended_sessions, which ends that one session and leaves the others alone.
import { eq, lt, sql } from 'drizzle-orm'
import { db as _db } from '@/lib/db'
import { endedSessions, users } from '@/lib/db/schema'
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

/** How long a token lives when it carries no expiry: Auth.js's default session maxAge. */
const DEFAULT_SESSION_SECONDS = 30 * 24 * 60 * 60

/**
 * Ends the session a token belongs to (signing out). Copies of the token,
 * such as a cookie a browser restores after a restart, stop working too.
 * Tokens issued before sessions had ids can't be told apart, so for those
 * every session of the account ends.
 */
export async function endSession(token: Record<string, unknown>, now = new Date()): Promise<void> {
  if (typeof token.id !== 'string') return
  if (typeof token.sid !== 'string') return bumpSessionVersion(token.id)
  const expiresAt = typeof token.exp === 'number'
    ? new Date(token.exp * 1000)
    : new Date(now.getTime() + DEFAULT_SESSION_SECONDS * 1000)
  await db.delete(endedSessions).where(lt(endedSessions.expiresAt, now))
  await db.insert(endedSessions).values({ id: token.sid, userId: token.id, expiresAt }).onConflictDoNothing()
}

async function isEnded(sid: unknown): Promise<boolean> {
  if (typeof sid !== 'string') return false
  return !!(await db.query.endedSessions.findFirst({ where: eq(endedSessions.id, sid), columns: { id: true } }))
}

/**
 * The account a session token signs in, or null. The token must come from
 * this scope (see sessionScope in lib/ee/types.ts), carry the account's
 * current session version and not have been signed out; a deleted account
 * ends all of its sessions. Tokens from before versions existed count as
 * version 0.
 */
export async function sessionUserId(token: Record<string, unknown>): Promise<string | null> {
  if (typeof token.id !== 'string') return null
  if ((token.scope ?? null) !== getEnterpriseHooks().sessionScope()) return null
  const current = await currentSessionVersion(token.id)
  if (current === null || current !== ((token.sv as number | undefined) ?? 0)) return null
  return (await isEnded(token.sid)) ? null : token.id
}
