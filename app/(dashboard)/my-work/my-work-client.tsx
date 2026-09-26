'use client'

import { useEffect, useMemo, useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { AlertTriangle, Box, Check, ChevronLeft, ChevronRight, Circle, Clock, Eye, FileText, GitPullRequest, Inbox, Play, Rocket, Workflow } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import { timeAgo } from '@/components/comments-panel'
import { markNotificationsDoneAction, snoozeNotificationsAction } from '../collab-actions'
import type { InboxItem, MyWork } from '@/lib/db/my-work'
import { LENS_LABELS, reasonLabel, type Lens } from '@/lib/my-work-labels'

const VERB_STYLES: Record<InboxItem['kind'], string> = {
  review: 'bg-chart-2/20 text-chart-2',
  changes_requested: 'bg-destructive/20 text-destructive',
  notification: 'bg-accent/15 text-accent',
  triage: 'bg-chart-4/20 text-chart-4',
  evidence_gap: 'bg-warning/20 text-warning',
  overdue_task: 'bg-destructive/20 text-destructive',
}

const PR_STYLES: Record<string, string> = {
  none: 'text-muted-foreground', draft: 'text-muted-foreground', open: 'text-chart-2', merged: 'text-chart-1', closed: 'text-destructive',
}

function ItemRow({ item, compact }: { item: InboxItem; compact?: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const act = (fn: () => Promise<void>) => start(async () => { await fn(); router.refresh() })
  return (
    <li className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between', pending && 'opacity-50')}>
      <div className="flex min-w-0 gap-3">
        {!compact && <span className={cn('mt-0.5 h-fit shrink-0 rounded-md px-2 py-0.5 text-xs font-medium', VERB_STYLES[item.kind])}>{item.verb}</span>}
        <div className="min-w-0">
          <Link href={item.url} className="block text-sm font-medium hover:text-accent transition-colors">
            {item.urgent && <AlertTriangle className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-destructive" aria-label="Urgent" />}
            {item.title}
          </Link>
          {item.detail && <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{item.detail}</p>}
          <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="rounded border px-1.5 py-px">{reasonLabel(item.reason)}</span>
            {item.productName && <span>{item.productName}</span>}
            {item.at && <span>{timeAgo(item.at)}</span>}
          </div>
        </div>
      </div>
      {item.notificationId && (
        <div className="flex shrink-0 gap-1 sm:pt-0.5">
          <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending} onClick={() => act(() => markNotificationsDoneAction([item.notificationId!]))}>
            <Check className="mr-1 h-3.5 w-3.5" />Done
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" disabled={pending}><Clock className="mr-1 h-3.5 w-3.5" />Snooze</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => act(() => snoozeNotificationsAction([item.notificationId!], 1))}>Until tomorrow</DropdownMenuItem>
              <DropdownMenuItem onClick={() => act(() => snoozeNotificationsAction([item.notificationId!], 7))}>For a week</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </li>
  )
}

function Section({ icon: Icon, title, count, children, action }: { icon: typeof Inbox; title: string; count?: number; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex min-h-7 items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-base font-semibold"><Icon className="h-4 w-4 text-muted-foreground" />{title}{count !== undefined && <span className="text-sm font-normal text-muted-foreground">{count}</span>}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">{children}</p>
}

function PanelCard({ title, children, empty }: { title: string; children: React.ReactNode; empty: boolean }) {
  return (
    <Card className="bg-card border-border gap-3 py-4">
      <CardHeader className="px-4"><CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle></CardHeader>
      <CardContent className="px-4">{empty ? <p className="text-sm text-muted-foreground">Nothing here.</p> : children}</CardContent>
    </Card>
  )
}

function LensPanels({ lens, panels }: { lens: Lens; panels: MyWork['panels'] }) {
  if (lens === 'code_owner') return (
    <div className="grid gap-4">
      <PanelCard title={`Assets you own (${panels.ownedAssets.length})`} empty={!panels.ownedAssets.length}>
        <ul className="divide-y divide-border">{panels.ownedAssets.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-2 py-2 text-sm">
            <Link href={`/assets/${a.id}`} className="flex min-w-0 items-center gap-2 hover:text-accent"><Box className="h-4 w-4 shrink-0 text-muted-foreground" /><span className="truncate">{a.name}</span></Link>
            <span className="shrink-0 text-xs text-muted-foreground">{a.openItemCount} open · debt {a.effectiveDebtScore}</span>
          </li>))}</ul>
      </PanelCard>
      <PanelCard title="Delivered against an older spec" empty={!panels.staleDeliveries.length}>
        <ul className="space-y-2">{panels.staleDeliveries.map((d) => (
          <li key={d.capabilityId} className="text-sm">
            <Link href={`/assets/${d.assetId}`} className="font-medium hover:text-accent">{d.title}</Link>
            <p className="text-xs text-muted-foreground">{d.assetName} · pinned {d.specTitle} v{d.pinned}; approved is v{d.approved}</p>
          </li>))}</ul>
      </PanelCard>
    </div>
  )
  if (lens === 'architect') return (
    <div className="grid gap-4">
      <PanelCard title="Reviews in your area" empty={!panels.reviewQueue.length}>
        <ul className="space-y-2">{panels.reviewQueue.map((r) => (
          <li key={r.id} className="text-sm">
            <Link href={`${r.subjectType === 'spec' ? '/specs' : '/plans'}/${r.subjectId}#review`} className="font-medium hover:text-accent">{r.title}</Link>
            <p className="text-xs text-muted-foreground">{r.state === 'changes_requested' ? 'Changes requested' : 'In review'} · {r.pending} pending</p>
          </li>))}</ul>
      </PanelCard>
      <PanelCard title="Most coordination" empty={!panels.coordination.length}>
        <ul className="space-y-2">{panels.coordination.map((p) => (
          <li key={p.id} className="text-sm">
            <Link href={`/plans/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link>
            <p className="text-xs text-muted-foreground">{p.assets} assets · {p.repos} repos · {p.dependencies} dependencies between them</p>
          </li>))}</ul>
      </PanelCard>
      <PanelCard title="Active specs linked to nothing" empty={!panels.unlinkedSpecs.length}>
        <ul className="space-y-1">{panels.unlinkedSpecs.map((s) => (
          <li key={s.id} className="text-sm"><Link href={`/specs/${s.id}`} className="hover:text-accent">{s.title}</Link> <span className="text-xs text-muted-foreground">v{s.version}</span></li>))}</ul>
      </PanelCard>
    </div>
  )
  if (lens === 'eng_manager') return (
    <div className="grid gap-4">
      <PanelCard title="Plans at risk" empty={!panels.plansAtRisk.length}>
        <ul className="space-y-2">{panels.plansAtRisk.map((p) => (
          <li key={p.id} className="text-sm">
            <Link href={`/plans/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link>
            <p className={cn('text-xs', p.overdue ? 'text-destructive' : 'text-muted-foreground')}>{p.overdue ? 'Past' : 'Due'} {p.deadline} · {p.openTasks} open tasks</p>
          </li>))}</ul>
      </PanelCard>
      <PanelCard title="Release readiness" empty={!panels.releaseReadiness.length}>
        <ul className="space-y-2">{panels.releaseReadiness.map((r) => (
          <li key={r.id} className="text-sm">
            <Link href={`/releases/${r.id}`} className="flex items-center gap-1.5 font-medium hover:text-accent"><Rocket className="h-3.5 w-3.5" />{r.name}</Link>
            <p className="text-xs text-muted-foreground">{r.productName} · {r.openPlans} plans open · {r.unstamped ? `${r.unstamped} assets missing a version` : 'all assets stamped'}</p>
          </li>))}</ul>
      </PanelCard>
      <PanelCard title="Merged but not shipped" empty={!panels.mergedNotShipped.length}>
        <ul className="space-y-2">{panels.mergedNotShipped.map((p) => (
          <li key={p.id} className="text-sm">
            <Link href={`/plans/${p.id}`} className="font-medium hover:text-accent">{p.title}</Link>
            <p className="text-xs text-muted-foreground">{p.releaseName ? `${p.releaseName} not shipped yet` : 'Not in any release'}</p>
          </li>))}</ul>
      </PanelCard>
    </div>
  )
  return null
}

const NEEDS_YOU_PAGE = 5

/** Needs you, five at a time. */
function NeedsYou({ items }: { items: InboxItem[] }) {
  const [page, setPage] = useState(0)
  const pages = Math.max(1, Math.ceil(items.length / NEEDS_YOU_PAGE))
  // Acting on an item removes it; don't strand the reader on an empty last page.
  useEffect(() => { if (page > pages - 1) setPage(pages - 1) }, [page, pages])
  const current = Math.min(page, pages - 1)
  const shown = items.slice(current * NEEDS_YOU_PAGE, (current + 1) * NEEDS_YOU_PAGE)
  const first = current * NEEDS_YOU_PAGE + 1
  const pager = items.length > NEEDS_YOU_PAGE ? (
    <div className="flex items-center gap-1 text-xs text-muted-foreground" aria-label="Needs you pages">
      <span className="mr-1" aria-live="polite">{first}–{first + shown.length - 1} of {items.length}</span>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Previous page" disabled={current === 0} onClick={() => setPage(current - 1)}><ChevronLeft className="h-4 w-4" /></Button>
      <Button variant="ghost" size="icon" className="h-7 w-7" aria-label="Next page" disabled={current >= pages - 1} onClick={() => setPage(current + 1)}><ChevronRight className="h-4 w-4" /></Button>
    </div>
  ) : undefined
  return (
    <Section icon={Inbox} title="Needs you" count={items.length} action={pager}>
      {items.length === 0 ? <Empty>Nothing needs you right now.</Empty> : (
        <Card className="bg-card border-border py-0"><CardContent className="px-4"><ul className="divide-y divide-border">{shown.map((i) => <ItemRow key={i.key} item={i} />)}</ul></CardContent></Card>
      )}
    </Section>
  )
}

export function MyWorkClient({ work, initialLens }: { work: MyWork; initialLens: Lens }) {
  const [lens, setLens] = useState<Lens>(initialLens)
  const [showAllWatching, setShowAllWatching] = useState(false)
  // Lenses reorder: items for the current lens come first. Nothing that needs you is hidden.
  const needsYou = useMemo(() => [...work.needsYou].sort((a, b) => Number(b.lenses.includes(lens)) - Number(a.lenses.includes(lens))), [work.needsYou, lens])
  const watching = useMemo(() => {
    const ordered = [...work.watching].sort((a, b) => Number(b.lenses.includes(lens)) - Number(a.lenses.includes(lens)))
    return showAllWatching ? ordered : ordered.slice(0, 8)
  }, [work.watching, lens, showAllWatching])
  const { taskGroups, plans, specs } = work.inFlight

  return (
    <div className="space-y-10">
      {work.lenses.length > 1 && (
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted-foreground">View as</span>
          <Tabs value={lens} onValueChange={(v) => setLens(v as Lens)}>
            <TabsList className="bg-muted">{work.lenses.map((l) => <TabsTrigger key={l} value={l}>{LENS_LABELS[l]}</TabsTrigger>)}</TabsList>
          </Tabs>
        </div>
      )}

      {/* The lens's panels on the left, what needs you beside them. Needs you comes first on narrow screens. */}
      <div className={cn('grid gap-8', lens !== 'developer' && 'lg:grid-cols-2 lg:items-start')}>
        <div className="lg:order-2"><NeedsYou key={lens} items={needsYou} /></div>
        {lens !== 'developer' && (
          <div className="lg:order-1">
            <Section icon={Workflow} title={`${LENS_LABELS[lens]} view`}>
              <LensPanels lens={lens} panels={work.panels} />
            </Section>
          </div>
        )}
      </div>

      <Section icon={Play} title="In flight">
        {taskGroups.length === 0 && plans.length === 0 && specs.length === 0 && <Empty>No open tasks, plans or draft specs of yours.</Empty>}
        <div className="grid gap-4 lg:grid-cols-2">
          {taskGroups.map((g) => (
            <Card key={g.planId} className="bg-card border-border gap-3 py-4">
              <CardHeader className="px-4">
                <CardTitle className="flex items-baseline justify-between gap-2 text-sm">
                  <Link href={`/plans/${g.planId}`} className="hover:text-accent">{g.planTitle}</Link>
                  <span className="shrink-0 text-xs font-normal text-muted-foreground">{g.productName}</span>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 px-4">
                {g.specs.length > 0 && <div className="space-y-1">{g.specs.map((s) => (
                  <div key={s.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                    <Link href={`/specs/${s.id}`} className="hover:text-accent">{s.title} v{s.version}</Link>
                    {s.approvedNow ? <Badge variant="secondary" className="h-5 bg-chart-1/20 px-1.5 text-[10px] text-chart-1">approved</Badge>
                      : s.approvedVersion ? <Badge variant="secondary" className="h-5 bg-warning/20 px-1.5 text-[10px] text-warning">approved v{s.approvedVersion} only</Badge> : null}
                    {s.changedSinceStart && <span className="flex items-center gap-1 text-warning"><AlertTriangle className="h-3 w-3" />changed since the plan started</span>}
                  </div>))}</div>}
                {g.prs.length > 0 && <div className="flex flex-wrap gap-3 text-xs">{g.prs.map((p) => (
                  <span key={p.assetName} className={cn('flex items-center gap-1', PR_STYLES[p.prStatus])}>
                    <GitPullRequest className="h-3.5 w-3.5" />{p.prUrl ? <a href={p.prUrl} target="_blank" rel="noreferrer" className="hover:underline">{p.assetName}</a> : p.assetName}: {p.prStatus}
                  </span>))}</div>}
                <ul className="space-y-1.5">{g.tasks.map((t) => (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex min-w-0 items-center gap-2">
                      {t.status === 'in_progress' ? <Play className="h-3.5 w-3.5 shrink-0 text-chart-1" /> : <Circle className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                      <Link href={`/tasks?task=${t.id}`} className="truncate hover:text-accent">{t.title}</Link>
                    </span>
                    {t.endDate && <span className={cn('shrink-0 text-xs', t.overdue ? 'text-destructive' : 'text-muted-foreground')}>{formatDateShort(new Date(t.endDate))}</span>}
                  </li>))}</ul>
              </CardContent>
            </Card>
          ))}
          {plans.length > 0 && (
            <PanelCard title={`Plans you own (${plans.length})`} empty={false}>
              <ul className="space-y-3">{plans.map((p) => (
                <li key={p.id}>
                  <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                    <Link href={`/plans/${p.id}`} className="truncate font-medium hover:text-accent">{p.title}</Link>
                    <span className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                      {p.review && <span className={p.review === 'changes_requested' ? 'text-destructive' : p.review === 'approved' ? 'text-chart-1' : 'text-chart-2'}>{p.review === 'open' ? 'in review' : p.review.replace('_', ' ')}</span>}
                      {p.atRisk && <span className="text-warning">at risk</span>}
                      <span>{p.status}</span>
                    </span>
                  </div>
                  <Progress value={p.progress} className="h-1.5" />
                </li>))}</ul>
            </PanelCard>
          )}
          {specs.length > 0 && (
            <PanelCard title={`Specs you're writing (${specs.length})`} empty={false}>
              <ul className="space-y-2">{specs.map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/specs/${s.id}`} className="truncate hover:text-accent">{s.title} <span className="text-xs text-muted-foreground">v{s.version}</span></Link>
                  <span className="shrink-0 text-xs text-muted-foreground">{s.review ? `${s.review.approved}/${s.review.total} approved${s.review.state === 'changes_requested' ? ' · changes requested' : ''}` : 'draft, not in review'}</span>
                </li>))}</ul>
            </PanelCard>
          )}
        </div>
      </Section>

      <Section icon={Eye} title="Watching" count={work.watching.length}
        action={work.watching.length > 8 ? <Button variant="ghost" size="sm" onClick={() => setShowAllWatching(!showAllWatching)}>{showAllWatching ? 'Show less' : 'Show all'}</Button> : undefined}>
        {watching.length === 0 ? <Empty>No recent changes to things you&apos;re responsible for.</Empty> : (
          <Card className="bg-card border-border py-0"><CardContent className="px-4"><ul className="divide-y divide-border">{watching.map((i) => <ItemRow key={i.key} item={i} compact />)}</ul></CardContent></Card>
        )}
      </Section>
    </div>
  )
}

