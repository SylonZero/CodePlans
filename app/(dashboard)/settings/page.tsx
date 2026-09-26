import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, emailVerificationTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getOrganization } from '@/lib/db/queries'
import { SettingsClient } from './settings-client'
import { listApiKeys } from '@/lib/mcp/auth'
import { config } from '@/lib/config'
import { isOrgAdmin } from '@/lib/db/authz'
import { getOrgWorkflowDefault, availableWorkflowLevels } from '@/lib/db/workflow'
import { WorkflowPanel } from './workflow-panel'
import { getEffectiveRules, getEmailPreferences, resolveChannel } from '@/lib/db/notification-settings'
import { NOTIFICATION_CATALOG } from '@/lib/notification-catalog'
import Link from 'next/link'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

interface Props {
  searchParams: Promise<{ emailVerified?: string; tab?: string }>
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

  const { emailVerified, tab } = await searchParams

  const apiKeys = await listApiKeys(authUser.id)
  const orgAdmin = profile.organizationId ? await isOrgAdmin(profile.organizationId, authUser.id) : false
  const workflowDefault = orgAdmin ? await getOrgWorkflowDefault(profile.organizationId) : null

  // Personal email switches, shown against what the workspace actually emails.
  const rule = await getEffectiveRules(profile.organizationId)
  const emailPrefs = {
    workspaceEmail: profile.organizationId ? !!(await resolveChannel(profile.organizationId, 'email_resend')) : false,
    prefs: await getEmailPreferences(authUser.id),
    // Integration errors only ever go to workspace admins.
    events: NOTIFICATION_CATALOG.filter((e) => orgAdmin || e.type !== 'integration.error').map((e) => ({ type: e.type, label: e.label, description: e.description, group: e.group, workspaceEmail: rule(e.type).enabled && rule(e.type).email })),
  }

  return (
    <div className="space-y-6">
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
      emailPrefs={emailPrefs}
      initialTab={tab}
    />
    {orgAdmin && (
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle>Workspace notifications</CardTitle>
          <CardDescription>Connect email (Resend) and Slack, and choose which events notify on each channel.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline"><Link href="/settings/notifications">Manage workspace notifications</Link></Button>
        </CardContent>
      </Card>
    )}
    {orgAdmin && profile.organizationId && workflowDefault && (
      <WorkflowPanel organizationId={profile.organizationId} level={workflowDefault} available={availableWorkflowLevels()} />
    )}
    </div>
  )
}
