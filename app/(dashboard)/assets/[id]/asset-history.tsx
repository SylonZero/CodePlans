'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextField } from '@/components/rich-text-field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ClipboardCheck,
  CheckCircle2,
  ArrowUpCircle,
  ArrowDownCircle,
  GitBranch,
  Rocket,
  NotebookPen,
  Bot,
  Plus,
  ChevronDown,
  ChevronUp,
  Trash2,
} from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import { addDesignNoteAction, deleteDesignNoteAction } from '../../actions'
import type { AssetHistoryEntry } from '@/lib/db/queries'
import type { CodePlanType, PrStatus, WorkItemSeverity, WorkItemType } from '@/lib/types'

type FilterKey = 'all' | 'releases' | 'plans' | 'work_items' | 'debt' | 'notes'

const filterLabels: Record<FilterKey, string> = {
  all: 'All',
  releases: 'Releases',
  plans: 'Plans',
  work_items: 'Work Items',
  debt: 'Tech Debt',
  notes: 'Design Notes',
}

const filterKinds: Record<Exclude<FilterKey, 'all'>, AssetHistoryEntry['kind'][]> = {
  releases: ['release_stamp'],
  plans: ['plan_completed'],
  work_items: ['work_item_resolved'],
  debt: ['debt_opened', 'debt_resolved'],
  notes: ['design_note'],
}

const kindMeta: Record<AssetHistoryEntry['kind'], { icon: typeof ClipboardCheck; iconClass: string; label: string }> = {
  release_stamp: { icon: Rocket, iconClass: 'text-accent', label: 'Shipped' },
  plan_completed: { icon: ClipboardCheck, iconClass: 'text-chart-1', label: 'Plan delivered' },
  work_item_resolved: { icon: CheckCircle2, iconClass: 'text-accent', label: 'Resolved' },
  debt_opened: { icon: ArrowUpCircle, iconClass: 'text-warning', label: 'Debt opened' },
  debt_resolved: { icon: ArrowDownCircle, iconClass: 'text-accent', label: 'Debt resolved' },
  design_note: { icon: NotebookPen, iconClass: 'text-chart-4', label: 'Design note' },
}

const planTypeLabels: Record<CodePlanType, string> = {
  refactor: 'Refactor',
  feature: 'Feature',
  improvement: 'Improvement',
  bugfix: 'Bug Fix',
}

const itemTypeLabels: Record<WorkItemType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  enhancement: 'Enhancement',
  ux: 'UX',
  tech_debt: 'Tech Debt',
}

const severityStyles: Record<WorkItemSeverity, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const prStatusStyles: Record<PrStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-chart-1/20 text-chart-1',
  merged: 'bg-accent/20 text-accent',
  closed: 'bg-destructive/20 text-destructive',
}

type AnchorOption = { id: string; label: string }

export function AssetHistoryTimeline({
  assetId,
  entries,
  canEdit,
  releaseOptions,
  planOptions,
}: {
  assetId: string
  entries: AssetHistoryEntry[]
  canEdit: boolean
  releaseOptions: AnchorOption[]
  planOptions: AnchorOption[]
}) {
  const [filter, setFilter] = useState<FilterKey>('all')
  const [notePanelOpen, setNotePanelOpen] = useState(false)

  const visible = filter === 'all' ? entries : entries.filter((e) => filterKinds[filter].includes(e.kind))
  const versions = entries.filter((e) => e.kind === 'release_stamp')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-wrap gap-1.5">
          {(Object.keys(filterLabels) as FilterKey[]).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setFilter(key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs transition-colors',
                filter === key
                  ? 'border-accent bg-accent/15 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              {filterLabels[key]}
            </button>
          ))}
        </div>
        {canEdit && (
          <Button size="sm" variant="outline" onClick={() => setNotePanelOpen(true)}>
            <Plus className="mr-1.5 h-3.5 w-3.5" />
            Add design note
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            History builds itself as plans complete, work items are resolved, and releases ship — nothing to
            record here yet.
          </CardContent>
        </Card>
      ) : (
        <div className="flex gap-6">
          {versions.length > 0 && (
            <aside className="hidden lg:block w-36 shrink-0">
              <div className="sticky top-6 space-y-1">
                <p className="text-xs font-medium text-muted-foreground mb-2">Versions</p>
                {versions.map((v) => (
                  <a
                    key={v.id}
                    href={`#${v.id}`}
                    className="block rounded px-2 py-1 text-xs hover:bg-muted transition-colors"
                  >
                    <span className="font-mono text-accent">{v.version ?? '—'}</span>
                    <span className="block text-muted-foreground">{formatDateShort(v.timestamp)}</span>
                  </a>
                ))}
              </div>
            </aside>
          )}

          <div className="min-w-0 flex-1">
            {visible.length === 0 ? (
              <Card className="bg-card border-border">
                <CardContent className="py-8 text-center text-sm text-muted-foreground">
                  No entries match this filter.
                </CardContent>
              </Card>
            ) : (
              <Card className="bg-card border-border">
                <CardContent className="pt-6">
                  <ul>
                    {visible.map((entry, i) => (
                      <TimelineEntry
                        key={entry.id}
                        entry={entry}
                        isLast={i === visible.length - 1}
                        assetId={assetId}
                        canEdit={canEdit}
                      />
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      <DesignNotePanel
        assetId={assetId}
        open={notePanelOpen}
        onOpenChange={setNotePanelOpen}
        releaseOptions={releaseOptions}
        planOptions={planOptions}
      />
    </div>
  )
}

function TimelineEntry({
  entry,
  isLast,
  assetId,
  canEdit,
}: {
  entry: AssetHistoryEntry
  isLast: boolean
  assetId: string
  canEdit: boolean
}) {
  const meta = kindMeta[entry.kind]
  const Icon = meta.icon
  const [expanded, setExpanded] = useState(false)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  if (entry.kind === 'release_stamp') {
    return (
      <li id={entry.id} className="relative flex gap-3 pb-5 last:pb-0 scroll-mt-6">
        {!isLast && <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />}
        <Icon className={cn('relative h-5 w-5 shrink-0 mt-0.5 bg-card', meta.iconClass)} />
        <div className="min-w-0 flex-1 rounded-md border border-accent/30 bg-accent/5 px-3 py-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 min-w-0">
              {entry.version && (
                <span className="font-mono text-sm font-semibold text-accent">{entry.version}</span>
              )}
              <span className="text-xs text-muted-foreground">shipped in</span>
              <Link
                href={`/releases/${entry.releaseId}`}
                className="text-sm font-medium truncate hover:text-accent transition-colors"
              >
                {entry.title}
              </Link>
            </div>
            <span className="text-xs text-muted-foreground shrink-0">{formatDateShort(entry.timestamp)}</span>
          </div>
        </div>
      </li>
    )
  }

  if (entry.kind === 'design_note') {
    return (
      <li className="relative flex gap-3 pb-5 last:pb-0">
        {!isLast && <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />}
        <Icon className={cn('relative h-5 w-5 shrink-0 mt-0.5 bg-card', meta.iconClass)} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-xs text-muted-foreground">{meta.label}</span>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-sm font-medium truncate hover:text-accent transition-colors text-left"
              >
                {entry.title}
              </button>
              {entry.authorKind === 'agent' && (
                <Badge variant="secondary" className="text-xs gap-1">
                  <Bot className="h-3 w-3" />
                  agent
                </Badge>
              )}
              {entry.planTitle && entry.planId && (
                <Link href={`/plans/${entry.planId}`}>
                  <Badge variant="outline" className="text-xs">
                    via {entry.planTitle}
                  </Badge>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {entry.authorName && <span className="text-xs text-muted-foreground">{entry.authorName}</span>}
              <span className="text-xs text-muted-foreground">{formatDateShort(entry.timestamp)}</span>
              <button
                type="button"
                onClick={() => setExpanded(!expanded)}
                className="text-muted-foreground hover:text-foreground"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          {expanded && (
            <div className="mt-2 rounded-md border border-border bg-muted/30 px-3 py-2">
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{entry.body ?? ''}</ReactMarkdown>
              </div>
              {canEdit && entry.noteId && (
                <div className="flex justify-end mt-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await deleteDesignNoteAction(entry.noteId!, assetId)
                        router.refresh()
                      })
                    }
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </li>
    )
  }

  return (
    <li className="relative flex gap-3 pb-5 last:pb-0">
      {!isLast && <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />}
      <Icon className={cn('relative h-5 w-5 shrink-0 mt-0.5 bg-card', meta.iconClass)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-xs text-muted-foreground">{meta.label}</span>
            {entry.kind === 'plan_completed' ? (
              <Link
                href={`/plans/${entry.planId}`}
                className="text-sm font-medium truncate hover:text-accent transition-colors"
              >
                {entry.title}
              </Link>
            ) : (
              <Link
                href={`/work-items?item=${entry.workItemId}`}
                className="text-sm font-medium truncate hover:text-accent transition-colors"
              >
                {entry.title}
              </Link>
            )}
          </div>
          <span className="text-xs text-muted-foreground shrink-0">{formatDateShort(entry.timestamp)}</span>
        </div>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          {entry.planType && (
            <Badge variant="secondary" className="text-xs">{planTypeLabels[entry.planType]}</Badge>
          )}
          {entry.branch && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
              <GitBranch className="h-3 w-3" />
              {entry.branch}
            </span>
          )}
          {entry.prStatus && entry.prStatus !== 'none' && (
            entry.prUrl ? (
              <a href={entry.prUrl} target="_blank" rel="noreferrer">
                <Badge variant="secondary" className={cn('text-xs', prStatusStyles[entry.prStatus])}>
                  PR {entry.prStatus}
                </Badge>
              </a>
            ) : (
              <Badge variant="secondary" className={cn('text-xs', prStatusStyles[entry.prStatus])}>
                PR {entry.prStatus}
              </Badge>
            )
          )}
          {entry.itemType && entry.kind === 'work_item_resolved' && (
            <Badge variant="secondary" className="text-xs">{itemTypeLabels[entry.itemType]}</Badge>
          )}
          {entry.severity && entry.kind !== 'work_item_resolved' && entry.itemType === 'tech_debt' && (
            <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[entry.severity])}>
              {entry.severity}
            </Badge>
          )}
          {entry.area && <span className="text-xs text-muted-foreground">{entry.area}</span>}
        </div>
      </div>
    </li>
  )
}

function DesignNotePanel({
  assetId,
  open,
  onOpenChange,
  releaseOptions,
  planOptions,
}: {
  assetId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  releaseOptions: AnchorOption[]
  planOptions: AnchorOption[]
}) {
  const [releaseId, setReleaseId] = useState('none')
  const [codePlanId, setCodePlanId] = useState('none')
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    fd.set('releaseId', releaseId)
    fd.set('codePlanId', codePlanId)
    startTransition(async () => {
      await addDesignNoteAction(assetId, fd)
      onOpenChange(false)
      router.refresh()
    })
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Add design note</SheetTitle>
          <SheetDescription>
            Record what a change meant for this asset&apos;s design — the backward-looking record beside the
            derived timeline.
          </SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="dn-title">
              Title <span className="text-destructive">*</span>
            </Label>
            <Input id="dn-title" name="title" required placeholder="Moved retry logic behind the queue" />
          </div>
          <div className="space-y-2">
            <Label>Note</Label>
            <RichTextField name="body" size="tall" />
          </div>
          {releaseOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Release (optional)</Label>
              <Select value={releaseId} onValueChange={setReleaseId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {releaseOptions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {planOptions.length > 0 && (
            <div className="space-y-2">
              <Label>Plan (optional)</Label>
              <Select value={codePlanId} onValueChange={setCodePlanId}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {planOptions.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Add note'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}
