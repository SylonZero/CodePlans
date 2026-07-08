import { db } from '@/lib/db'
import { users, organizationMembers } from '@/lib/db/schema'
import { eq, and, isNotNull } from 'drizzle-orm'

/**
 * Resolve an assignee email to a user id, requiring a shared (joined)
 * workspace with the caller so keys can't probe or assign across orgs.
 */
export async function resolveAssigneeEmail(callerUserId: string, email: string): Promise<string> {
  const target = await db.query.users.findFirst({ where: eq(users.email, email.trim().toLowerCase()) })
  const memberships = async (userId: string) =>
    db
      .select({ orgId: organizationMembers.organizationId })
      .from(organizationMembers)
      .where(and(eq(organizationMembers.userId, userId), isNotNull(organizationMembers.joinedAt)))
  if (target) {
    const mine = new Set((await memberships(callerUserId)).map((m) => m.orgId))
    if ((await memberships(target.id)).some((t) => mine.has(t.orgId))) return target.id
  }
  throw new Error(`No workspace member with email "${email}" — check Team for valid addresses`)
}
