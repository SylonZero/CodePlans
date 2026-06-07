import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrganization, getTeamMembers } from '@/lib/db/queries'
import { TeamClient } from './team-client'

export default async function TeamPage() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })
  if (!profile?.organizationId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight">Team</h1>
        <p className="text-muted-foreground">You are not part of an organization yet.</p>
      </div>
    )
  }

  const [organization, members] = await Promise.all([
    getOrganization(profile.organizationId),
    getTeamMembers(profile.organizationId),
  ])

  if (!organization) redirect('/login')

  return (
    <TeamClient
      members={members}
      organization={organization}
      currentUserId={authUser.id}
    />
  )
}
