// The signed-in user as enterprise pages and API routes see it.
import { and, eq, isNotNull } from 'drizzle-orm'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizationMembers } from '@/lib/db/schema'
import type { EnterpriseUser } from './types'

/** `role` is the user's role in their workspace (owner, admin, editor, viewer), or null without one. */
export async function currentEnterpriseUser(): Promise<EnterpriseUser | null> {
  const authUser = await authAdapter.getUser()
  if (!authUser) return null
  const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id), columns: { organizationId: true } })
  if (!profile) return null
  const member = profile.organizationId
    ? await db.query.organizationMembers.findFirst({
        where: and(
          eq(organizationMembers.organizationId, profile.organizationId),
          eq(organizationMembers.userId, authUser.id),
          isNotNull(organizationMembers.joinedAt),
        ),
        columns: { role: true },
      })
    : undefined
  return { id: authUser.id, email: authUser.email, role: member?.role ?? null }
}

/** Flattens Next.js searchParams to the first value of each key. */
export function firstSearchParams(params: Record<string, string | string[] | undefined>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value
    if (first !== undefined) out[key] = first
  }
  return out
}
