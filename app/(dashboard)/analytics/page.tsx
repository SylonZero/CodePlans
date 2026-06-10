import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getDashboardStats } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { AnalyticsClient } from './analytics-client'

export default async function AnalyticsPage() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const scope = await getProductScope()
  const stats = await getDashboardStats(authUser.id, scope ?? undefined)

  return <AnalyticsClient stats={stats} />
}
