import { and, eq, gt } from 'drizzle-orm'
import { db } from '@/lib/db'
import { emailVerificationTokens } from '@/lib/db/schema'

/**
 * A live invite link. Email-change links share the table but never count:
 * they confirm an address, they don't set a password.
 */
export async function findInvite(token: string, now = new Date()) {
  if (!token) return null
  return (await db.query.emailVerificationTokens.findFirst({
    where: and(eq(emailVerificationTokens.token, token), eq(emailVerificationTokens.purpose, 'invite'), gt(emailVerificationTokens.expiresAt, now)),
  })) ?? null
}
