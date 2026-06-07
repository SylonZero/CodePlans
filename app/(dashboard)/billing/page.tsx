import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { BillingClient } from './billing-client'
import { config } from '@/lib/config'

export default async function BillingPage() {
  if (!config.billing.enabled) redirect('/')

  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })
  if (!profile) redirect('/login')

  let orgName = 'Your Organization'
  if (profile.organizationId) {
    const org = await db.query.organizations.findFirst({
      where: eq(organizations.id, profile.organizationId),
    })
    if (org) orgName = org.name
  }

  return <BillingClient orgName={orgName} billingTier={profile.billingTier} />
}
