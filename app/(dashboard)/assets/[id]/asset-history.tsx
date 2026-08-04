'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { ClipboardCheck, CheckCircle2, ArrowUpCircle, ArrowDownCircle, GitBranch } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import type { AssetHistoryEntry } from '@/lib/db/queries'
import type { CodePlanType, PrStatus, WorkItemSeverity, WorkItemType } from '@/lib/types'

type FilterKey = 'all' | 'plans' | 'work_items' | 'debt'

const filterLabels: Record<FilterKey, string> = {
  all: 'All',
  plans: 'Plans',
  work_items: 'Work Items',
  debt: 'Tech Debt',
}

const filterKinds: Record<Exclude<FilterKey, 'all'>, AssetHistoryEntry['kind'][]> = {
  plans: ['plan_completed'],
  work_items: ['work_item_resolved'],
  debt: ['debt_opened', 'debt_resolved'],
}

const kindMeta: Record<AssetHistoryEntry['kind'], { icon: typeof ClipboardCheck; iconClass: string; label: string }> = {
  plan_completed: { icon: ClipboardCheck, iconClass: 'text-chart-1', label: 'Plan delivered' },
  work_item_resolved: { icon: CheckCircle2, iconClass: 'text-accent', label: 'Resolved' },
  debt_opened: { icon: ArrowUpCircle, iconClass: 'text-warning', label: 'Debt opened' },
  debt_resolved: { icon: ArrowDownCircle, iconClass: 'text-accent', label: 'Debt resolved' },
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

export function AssetHistoryTimeline({ entries }: { entries: AssetHistoryEntry[] }) {
  const [filter, setFilter] = useState<FilterKey>('all')

  const visible = filter === 'all' ? entries : entries.filter((e) => filterKinds[filter].includes(e.kind))

  if (entries.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-8 text-center text-sm text-muted-foreground">
          History builds itself as plans complete and work items are resolved — nothing to record here yet.
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
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
              {visible.map((entry, i) => {
                const meta = kindMeta[entry.kind]
                const Icon = meta.icon
                return (
                  <li key={entry.id} className="relative flex gap-3 pb-5 last:pb-0">
                    {i < visible.length - 1 && (
                      <span aria-hidden className="absolute left-[9px] top-6 bottom-0 w-px bg-border" />
                    )}
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
                        <span className="text-xs text-muted-foreground shrink-0">
                          {formatDateShort(entry.timestamp)}
                        </span>
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
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
