import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getDashboardStats } from '@/lib/db/queries'
import { AnalyticsClient } from './analytics-client'

export default async function AnalyticsPage() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const stats = await getDashboardStats(authUser.id)

  return <AnalyticsClient stats={stats} />
}
