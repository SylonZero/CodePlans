import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getDashboardStats, getAnalytics } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { AnalyticsClient } from './analytics-client'

export default async function AnalyticsPage() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const scope = await getProductScope()
  const [stats, analytics] = await Promise.all([
    getDashboardStats(authUser.id, scope ?? undefined),
    getAnalytics(authUser.id, scope ?? undefined),
  ])

  return <AnalyticsClient stats={stats} analytics={analytics} />
}
