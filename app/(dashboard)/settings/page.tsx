import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, emailVerificationTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrganization } from '@/lib/db/queries'
import { SettingsClient } from './settings-client'
import { listApiKeys } from '@/lib/mcp/auth'
import { config } from '@/lib/config'

interface Props {
  searchParams: Promise<{ emailVerified?: string }>
}

export default async function SettingsPage({ searchParams }: Props) {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')

  const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })
  if (!profile) redirect('/login')

  const org = profile.organizationId
    ? await getOrganization(profile.organizationId)
    : null

  const pendingToken = await db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.userId, authUser.id),
  })

  const pendingEmailChange =
    pendingToken && pendingToken.expiresAt > new Date()
      ? { newEmail: pendingToken.newEmail, expiresAt: pendingToken.expiresAt.toISOString() }
      : null

  const { emailVerified } = await searchParams

  const apiKeys = await listApiKeys(authUser.id)

  return (
    <SettingsClient
      apiKeys={apiKeys}
      user={{
        name: profile.name,
        email: profile.email,
        role: profile.role,
        featureFlags: (profile.featureFlags as { alpha?: boolean; beta?: boolean; aiAssistance?: boolean }) ?? {},
      }}
      org={{
        name: org?.name ?? 'No Organization',
        memberCount: org?.memberCount ?? 0,
        billingTier: org?.billingTier ?? profile.billingTier,
      }}
      billingEnabled={config.billing.enabled}
      pendingEmailChange={pendingEmailChange}
      emailJustVerified={emailVerified === '1'}
    />
  )
}
