import Link from 'next/link'
import { redirect } from 'next/navigation'
import { eq, inArray } from 'drizzle-orm'
import { ArrowLeft } from 'lucide-react'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { isOrgAdmin } from '@/lib/db/authz'
import { listChannels, listNotificationRules, listRecentDeliveries } from '@/lib/db/notification-settings'
import { Card, CardContent } from '@/components/ui/card'
import { NotificationSettingsClient } from './notification-settings-client'

export default async function WorkspaceNotificationsPage() {
  const authUser = await authAdapter.getUser()
  if (!authUser) redirect('/login')
  const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })
  const organizationId = profile?.organizationId
  const admin = organizationId ? await isOrgAdmin(organizationId, authUser.id) : false

  const header = (
    <div className="space-y-2">
      <Link href="/settings" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Settings
      </Link>
      <h1 className="text-2xl font-bold tracking-tight">Workspace notifications</h1>
      <p className="text-muted-foreground">Where email and Slack notifications go, and which events send them. People can turn their own email off in Settings.</p>
    </div>
  )

  if (!organizationId || !admin) {
    return (
      <div className="space-y-8">
        {header}
        <Card className="bg-card border-border"><CardContent className="text-sm text-muted-foreground">Only workspace owners and admins can change these settings.</CardContent></Card>
      </div>
    )
  }

  const [channels, rules, deliveries] = await Promise.all([listChannels(organizationId), listNotificationRules(organizationId), listRecentDeliveries(organizationId, 25)])
  const targetIds = [...new Set(deliveries.filter((d) => d.channelKind === 'email_resend').map((d) => d.target))]
  const names = new Map(targetIds.length ? (await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, targetIds))).map((u) => [u.id, u.name]) : [])

  return (
    <div className="space-y-8">
      {header}
      <NotificationSettingsClient
        channels={{
          email: { ...channels.email, lastUsedAt: channels.email.lastUsedAt?.toISOString() ?? null },
          slack: { ...channels.slack, lastUsedAt: channels.slack.lastUsedAt?.toISOString() ?? null },
        }}
        rules={rules.map((r) => ({ type: r.type, label: r.label, description: r.description, group: r.group, mandatory: !!r.mandatory, customized: r.customized, rule: r.rule }))}
        deliveries={deliveries.map((d) => ({
          id: d.id, eventType: d.eventType, channelKind: d.channelKind, status: d.status, attempts: d.attempts, lastError: d.lastError,
          createdAt: d.createdAt.toISOString(),
          to: d.channelKind === 'email_resend' ? names.get(d.target) ?? String((d.payload as { to?: string }).to ?? 'someone') : channels.slack.config.channelLabel ?? 'Slack channel',
          subject: String((d.payload as { subject?: string; text?: string }).subject ?? (d.payload as { text?: string }).text ?? '').split(' — http')[0],
        }))}
      />
    </div>
  )
}
