import { authAdapter } from '@/lib/auth'
import { getDashboardStats, getCodePlans, getProducts, getActivityFeed } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
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

  const scope = await getProductScope()

  const [stats, plans, profile, scopedProducts, activities] = await Promise.all([
    getDashboardStats(user.id, scope ?? undefined),
    getCodePlans(user.id, { productId: scope ?? undefined }),
    db.query.users.findFirst({ where: eq(users.id, user.id) }),
    scope ? getProducts(user.id, scope) : Promise.resolve([]),
    getActivityFeed(user.id),
  ])

  const fullName = profile?.name || user.email.split('@')[0] || ''
  const firstName = fullName.split(' ')[0] || 'there'
  const scopedProductName = scopedProducts[0]?.name

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {getGreeting()}, {firstName}
        </h1>
        <p className="text-muted-foreground mt-1">
          {scopedProductName
            ? `Showing activity for ${scopedProductName}.`
            : "Here's what's happening across your products."}
        </p>
      </div>

      <StatCards stats={stats} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <VelocityChart />
          <PlansOverview plans={plans} />
        </div>
        <div>
          <ActivityFeed activities={activities} />
        </div>
      </div>
    </div>
  )
}
