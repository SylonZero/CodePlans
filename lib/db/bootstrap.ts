import { db } from './index'
import { users, organizations, organizationMembers, products } from './schema'
import { eq, and, asc, isNull } from 'drizzle-orm'

/**
 * Workspace bootstrap: an instance always has exactly one workspace
 * organization. Creates it on first boot (once a user exists) and
 * assigns org-less products to it, so product visibility is purely
 * org-membership based. Idempotent; never throws — a bootstrap failure must
 * not take the server down.
 *
 * Deliberately does NOT auto-join existing users: a member removed via the
 * Team page must stay removed. New users join at signup (joinTeamWorkspace).
 */
export async function ensureTeamWorkspace(): Promise<string | null> {
  try {
    let org = await db.query.organizations.findFirst({
      orderBy: asc(organizations.createdAt),
    })

    if (!org) {
      const firstUser = await db.query.users.findFirst({ orderBy: asc(users.createdAt) })
      if (!firstUser) return null // no users yet — nothing to bootstrap

      const name = process.env.SEED_ORG_NAME ?? 'My Workspace'
      const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      const [created] = await db
        .insert(organizations)
        .values({ name, slug, ownerId: firstUser.id })
        .returning()
      org = created

      await db.insert(organizationMembers).values({
        userId: firstUser.id,
        organizationId: org.id,
        role: 'owner',
        joinedAt: new Date(),
      })
      await db
        .update(users)
        .set({ organizationId: org.id, role: 'owner' })
        .where(eq(users.id, firstUser.id))
      console.log(`[bootstrap] Created team workspace "${name}"`)
    }

    // Every product belongs to the workspace.
    await db
      .update(products)
      .set({ organizationId: org.id })
      .where(isNull(products.organizationId))

    return org.id
  } catch (err) {
    console.error('[bootstrap] ensureTeamWorkspace failed:', err)
    return null
  }
}

/** Add a newly signed-up user to the workspace. */
export async function joinTeamWorkspace(userId: string): Promise<void> {
  const orgId = await ensureTeamWorkspace()
  if (!orgId) return

  const existing = await db.query.organizationMembers.findFirst({
    where: and(
      eq(organizationMembers.userId, userId),
      eq(organizationMembers.organizationId, orgId),
    ),
  })
  if (existing) return

  await db.insert(organizationMembers).values({
    userId,
    organizationId: orgId,
    role: 'editor',
    joinedAt: new Date(),
  })
  await db.update(users).set({ organizationId: orgId }).where(eq(users.id, userId))
}
