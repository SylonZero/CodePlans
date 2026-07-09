import { authAdapter } from '@/lib/auth'
import { getTasks, getCodePlans, getTeamMembers } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const scope = await getProductScope()

  const [tasks, plans, profile] = await Promise.all([
    getTasks(user.id, { productId: scope ?? undefined }),
    getCodePlans(user.id, { status: 'active', productId: scope ?? undefined }),
    db.query.users.findFirst({ where: eq(users.id, user.id) }),
  ])

  const teamMembers = profile?.organizationId ? await getTeamMembers(profile.organizationId) : []

  const planList = plans.map((p) => ({ id: p.id, title: p.title }))
  const memberList = teamMembers.map((m) => ({ id: m.userId, name: m.user.name }))

  return (
    <div className="space-y-8">
      <TasksClient tasks={tasks} plans={planList} members={memberList} currentUserId={user.id} />
    </div>
  )
}
