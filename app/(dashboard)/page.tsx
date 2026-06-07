import { authAdapter } from '@/lib/auth'
import { getDashboardStats, getCodePlans } from '@/lib/db/queries'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { StatCards } from '@/components/dashboard/stat-cards'
import { PlansOverview } from '@/components/dashboard/plans-overview'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { VelocityChart } from '@/components/dashboard/velocity-chart'

function getGreeting() {
  const hour = new Date().getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default async function DashboardPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const [stats, plans, profile] = await Promise.all([
    getDashboardStats(user.id),
    getCodePlans(user.id),
    db.query.users.findFirst({ where: eq(users.id, user.id) }),
  ])

  const fullName = profile?.name || user.email.split('@')[0] || ''
  const firstName = fullName.split(' ')[0] || 'there'

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s what&apos;s happening with your projects.
        </p>
      </div>

      <StatCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <VelocityChart />
          <PlansOverview plans={plans} />
        </div>
        <div>
          <ActivityFeed />
        </div>
      </div>
    </div>
  )
}
