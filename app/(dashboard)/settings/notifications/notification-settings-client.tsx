'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, MessageSquare, RotateCcw } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Checkbox } from '@/components/ui/checkbox'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { EVENT_GROUP_LABELS, catalogEntry, type EventGroup } from '@/lib/notification-catalog'
import type { NotificationChannelKind, NotificationChannelStatus, NotificationDeliveryStatus } from '@/lib/db/schema.sqlite'
import { timeAgo } from '@/components/comments-panel'
import {
  saveEmailChannelAction, saveSlackChannelAction, setChannelPausedAction, removeChannelAction, sendTestAction, setRuleAction, resetRulesAction,
} from './actions'

type ChannelView = {
  kind: NotificationChannelKind
  configured: boolean
  source: 'settings' | 'env' | null
  status: NotificationChannelStatus | null
  config: Record<string, string>
  secretHint: string | null
  lastError: string | null
  lastUsedAt: string | null
}

type RuleFlags = { enabled: boolean; inApp: boolean; email: boolean; slack: boolean; includeAgents: boolean; mandatory: boolean }
type RuleRow = { type: string; label: string; description: string; group: EventGroup; mandatory: boolean; customized: boolean; rule: RuleFlags }
type DeliveryRow = {
  id: string; eventType: string; channelKind: NotificationChannelKind; status: NotificationDeliveryStatus; attempts: number
  lastError: string | null; createdAt: string; to: string; subject: string
}

type Props = { channels: { email: ChannelView; slack: ChannelView }; rules: RuleRow[]; deliveries: DeliveryRow[] }

function StatusBadge({ channel }: { channel: ChannelView }) {
  if (!channel.configured) return <Badge variant="outline" className="text-muted-foreground">Not set up</Badge>
  if (channel.status === 'paused') return <Badge variant="secondary">Paused</Badge>
  if (channel.status === 'error') return <Badge variant="destructive">Failing</Badge>
  return <Badge className="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/15">{channel.source === 'env' ? 'Connected (env)' : 'Connected'}</Badge>
}

function useAction() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  function act(fn: () => Promise<{ ok: true; message?: string } | { ok: false; error: string }>, success?: string) {
    setMessage(null)
    start(async () => {
      const r = await fn()
      if (!r.ok) setMessage({ kind: 'error', text: r.error })
      else {
        setMessage(success || r.message ? { kind: 'ok', text: r.message ?? success! } : null)
        router.refresh()
      }
    })
  }
  return { pending, message, act }
}

function ChannelFooter({ channel, pending, act }: { channel: ChannelView; pending: boolean; act: ReturnType<typeof useAction>['act'] }) {
  const stored = channel.configured && channel.source === 'settings'
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="submit" size="sm" disabled={pending}>Save</Button>
      <Button type="button" size="sm" variant="outline" disabled={pending || !channel.configured} onClick={() => act(() => sendTestAction(channel.kind))}>
        {channel.kind === 'email_resend' ? 'Send test email' : 'Send test message'}
      </Button>
      {stored && (
        <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => act(() => setChannelPausedAction(channel.kind, channel.status !== 'paused'), channel.status === 'paused' ? 'Resumed' : 'Paused')}>
          {channel.status === 'paused' ? 'Resume' : 'Pause'}
        </Button>
      )}
      {stored && (
        <Button type="button" size="sm" variant="ghost" className="text-destructive hover:text-destructive" disabled={pending}
          onClick={() => { if (confirm('Remove this channel? Queued messages for it will be skipped.')) act(() => removeChannelAction(channel.kind), 'Removed') }}>
          Remove
        </Button>
      )}
    </div>
  )
}

function ChannelMeta({ channel }: { channel: ChannelView }) {
  return (
    <>
      {channel.lastError && channel.status === 'error' && <p className="text-sm text-destructive">Last error: {channel.lastError}</p>}
      {channel.lastUsedAt && <p className="text-xs text-muted-foreground">Last sent {timeAgo(channel.lastUsedAt)}</p>}
    </>
  )
}

function Feedback({ message }: { message: ReturnType<typeof useAction>['message'] }) {
  if (!message) return null
  return <p role={message.kind === 'error' ? 'alert' : 'status'} className={`text-sm ${message.kind === 'error' ? 'text-destructive' : 'text-emerald-600 dark:text-emerald-400'}`}>{message.text}</p>
}

function EmailChannelCard({ channel }: { channel: ChannelView }) {
  const { pending, message, act } = useAction()
  const [apiKey, setApiKey] = useState('')
  const [fromAddress, setFrom] = useState(channel.config.fromAddress ?? '')
  const [replyTo, setReplyTo] = useState(channel.config.replyTo ?? '')
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><Mail className="h-4 w-4" /> Email (Resend)</CardTitle>
          <StatusBadge channel={channel} />
        </div>
        <CardDescription>Sends from your verified Resend domain.{channel.source === 'env' ? ' Using RESEND_API_KEY from the server environment; save a key here to override it.' : ''}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(() => saveEmailChannelAction({ apiKey, fromAddress, replyTo }), 'Saved'); setApiKey('') }}>
          <div className="space-y-1.5">
            <Label htmlFor="resend-key">API key</Label>
            <Input id="resend-key" type="password" autoComplete="off" placeholder={channel.secretHint ? `Saved (${channel.secretHint}) — leave blank to keep` : 're_…'} value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resend-from">From</Label>
            <Input id="resend-from" placeholder="CodePlans <notify@your-domain.com>" value={fromAddress} onChange={(e) => setFrom(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="resend-reply">Reply-to <span className="text-muted-foreground">(optional)</span></Label>
            <Input id="resend-reply" type="email" placeholder="eng@your-domain.com" value={replyTo} onChange={(e) => setReplyTo(e.target.value)} />
          </div>
          <ChannelMeta channel={channel} />
          <ChannelFooter channel={channel} pending={pending} act={act} />
          <Feedback message={message} />
        </form>
      </CardContent>
    </Card>
  )
}

function SlackChannelCard({ channel }: { channel: ChannelView }) {
  const { pending, message, act } = useAction()
  const [webhookUrl, setUrl] = useState('')
  const [channelLabel, setLabel] = useState(channel.config.channelLabel ?? '')
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base"><MessageSquare className="h-4 w-4" /> Slack</CardTitle>
          <StatusBadge channel={channel} />
        </div>
        <CardDescription>Posts to the one channel an incoming webhook is bound to. Create one under your Slack app&apos;s Incoming Webhooks.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); act(() => saveSlackChannelAction({ webhookUrl, channelLabel }), 'Saved'); setUrl('') }}>
          <div className="space-y-1.5">
            <Label htmlFor="slack-url">Webhook URL</Label>
            <Input id="slack-url" type="password" autoComplete="off" placeholder={channel.secretHint ? `Saved (${channel.secretHint}) — leave blank to keep` : 'https://hooks.slack.com/services/…'} value={webhookUrl} onChange={(e) => setUrl(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="slack-label">Channel name <span className="text-muted-foreground">(for your reference)</span></Label>
            <Input id="slack-label" placeholder="#eng-updates" value={channelLabel} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <ChannelMeta channel={channel} />
          <ChannelFooter channel={channel} pending={pending} act={act} />
          <Feedback message={message} />
        </form>
      </CardContent>
    </Card>
  )
}

function RulesCard({ rules, emailReady, slackReady }: { rules: RuleRow[]; emailReady: boolean; slackReady: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  const [rows, setRows] = useState(rules)
  const [prevRules, setPrevRules] = useState(rules)
  if (rules !== prevRules) { setPrevRules(rules); setRows(rules) }

  function update(type: string, patch: Partial<RuleFlags>) {
    setError('')
    setRows((rs) => rs.map((r) => r.type === type ? { ...r, customized: true, rule: { ...r.rule, ...patch } } : r))
    start(async () => {
      const r = await setRuleAction(type, patch)
      if (!r.ok) { setError(r.error); router.refresh() }
      else setRows((rs) => rs.map((x) => x.type === type ? { ...x, rule: r.rule } : x))
    })
  }

  const groups = [...new Set(rows.map((r) => r.group))]
  const channelNote = [!emailReady && 'email', !slackReady && 'Slack'].filter(Boolean).join(' or ')
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="space-y-1.5">
            <CardTitle className="text-base">Events</CardTitle>
            <CardDescription>
              Who gets told is decided by responsibilities (code owners, architects, engineering managers) and involvement. Here you choose whether each event notifies at all and on which channels.
              Required events always reach people in-app.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" disabled={pending || !rows.some((r) => r.customized)}
            onClick={() => start(async () => { const r = await resetRulesAction(); if (!r.ok) setError(r.error); router.refresh() })}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" /> Reset to defaults
          </Button>
        </div>
        {channelNote && <p className="text-sm text-muted-foreground">Set up {channelNote} above; until then those columns send nothing.</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="min-w-[260px]">Event</TableHead>
              <TableHead className="w-16 text-center">On</TableHead>
              <TableHead className="w-16 text-center">In-app</TableHead>
              <TableHead className="w-16 text-center">Email</TableHead>
              <TableHead className="w-16 text-center">Slack</TableHead>
              <TableHead className="w-20 text-center" title="Also notify when an AI agent did it via MCP">Agents</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {groups.map((g) => [
              <TableRow key={`g-${g}`} className="hover:bg-transparent">
                <TableCell colSpan={6} className="bg-muted/40 py-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">{EVENT_GROUP_LABELS[g]}</TableCell>
              </TableRow>,
              ...rows.filter((r) => r.group === g).map((r) => {
                const off = !r.rule.enabled
                return (
                  <TableRow key={r.type} data-event={r.type} className={off ? 'opacity-60' : undefined}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{r.label}</span>
                        {r.mandatory && <Badge variant="outline" className="text-[10px]">Required</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">{r.description}</p>
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch aria-label={`${r.label}: on`} checked={r.rule.enabled} disabled={r.mandatory} onCheckedChange={(v) => update(r.type, { enabled: v })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox className="border-muted-foreground/40" aria-label={`${r.label}: in-app`} checked={r.rule.inApp} disabled={r.mandatory || off} onCheckedChange={(v) => update(r.type, { inApp: v === true })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox className="border-muted-foreground/40" aria-label={`${r.label}: email`} checked={r.rule.email} disabled={off} onCheckedChange={(v) => update(r.type, { email: v === true })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox className="border-muted-foreground/40" aria-label={`${r.label}: Slack`} checked={r.rule.slack} disabled={off} onCheckedChange={(v) => update(r.type, { slack: v === true })} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Checkbox className="border-muted-foreground/40" aria-label={`${r.label}: agent events`} checked={r.rule.includeAgents} disabled={r.mandatory || off} onCheckedChange={(v) => update(r.type, { includeAgents: v === true })} />
                    </TableCell>
                  </TableRow>
                )
              }),
            ])}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

const DELIVERY_BADGE: Record<NotificationDeliveryStatus, string> = {
  sent: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  pending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  sending: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  failed: 'bg-destructive/15 text-destructive',
  skipped: 'bg-muted text-muted-foreground',
}

function DeliveriesCard({ deliveries }: { deliveries: DeliveryRow[] }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base">Recent deliveries</CardTitle>
        <CardDescription>The last email and Slack messages. Failed sends are retried up to five times with backoff.</CardDescription>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {deliveries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing sent yet.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Message</TableHead>
                <TableHead>To</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">When</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.map((d) => (
                <TableRow key={d.id}>
                  <TableCell className="max-w-[420px]">
                    <p className="truncate">{d.subject}</p>
                    <p className="text-xs text-muted-foreground">{catalogEntry(d.eventType)?.label ?? d.eventType}</p>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5">{d.channelKind === 'email_resend' ? <Mail className="h-3.5 w-3.5" /> : <MessageSquare className="h-3.5 w-3.5" />}{d.to}</span>
                  </TableCell>
                  <TableCell>
                    <Badge className={`${DELIVERY_BADGE[d.status]} hover:bg-inherit`}>{d.status}{d.attempts > 1 ? ` · ${d.attempts} tries` : ''}</Badge>
                    {d.lastError && d.status !== 'sent' && <p className="mt-1 max-w-[260px] truncate text-xs text-muted-foreground" title={d.lastError}>{d.lastError}</p>}
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-right text-muted-foreground">{timeAgo(d.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )
}

export function NotificationSettingsClient({ channels, rules, deliveries }: Props) {
  const ready = (c: ChannelView) => c.configured && c.status !== 'paused'
  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-2">
        <EmailChannelCard channel={channels.email} />
        <SlackChannelCard channel={channels.slack} />
      </div>
      <RulesCard rules={rules} emailReady={ready(channels.email)} slackReady={ready(channels.slack)} />
      <DeliveriesCard deliveries={deliveries} />
    </div>
  )
}
