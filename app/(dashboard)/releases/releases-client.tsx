'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Rocket } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import type { ReleaseListRow } from '@/lib/db/queries'
import type { ReleaseStatus, WorkItemType } from '@/lib/types'

export const releaseStatusStyles: Record<ReleaseStatus, string> = {
  planned: 'bg-muted text-muted-foreground',
  in_progress: 'bg-chart-1/20 text-chart-1',
  shipped: 'bg-accent/20 text-accent',
  abandoned: 'bg-muted text-muted-foreground line-through',
}

export const releaseStatusLabels: Record<ReleaseStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  shipped: 'Shipped',
  abandoned: 'Abandoned',
}

const itemDotStyles: Record<WorkItemType, string> = {
  feature: 'bg-chart-1',
  bug: 'bg-destructive',
  enhancement: 'bg-chart-2',
  ux: 'bg-chart-4',
  tech_debt: 'bg-warning',
}

const itemDotLabels: Record<WorkItemType, string> = {
  feature: 'features',
  bug: 'bugs',
  enhancement: 'enhancements',
  ux: 'UX',
  tech_debt: 'debt',
}

type TabKey = 'all' | 'in_progress' | 'shipped'

export function ReleasesClient({ releases }: { releases: ReleaseListRow[] }) {
  const [tab, setTab] = useState<TabKey>('all')

  const visible = releases.filter((r) => {
    if (tab === 'all') return true
    if (tab === 'in_progress') return r.status === 'planned' || r.status === 'in_progress'
    return r.status === 'shipped'
  })

  if (releases.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <Rocket className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No releases yet</p>
          <p className="text-sm text-muted-foreground">
            Group plans that ship together — a version of one asset, or a coordinated revision across several.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
        <TabsList className="bg-muted">
          <TabsTrigger value="all">All ({releases.length})</TabsTrigger>
          <TabsTrigger value="in_progress">
            In Progress ({releases.filter((r) => r.status === 'planned' || r.status === 'in_progress').length})
          </TabsTrigger>
          <TabsTrigger value="shipped">Shipped ({releases.filter((r) => r.status === 'shipped').length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="space-y-3">
        {visible.map((release) => {
          const counts = Object.entries(release.workItemCounts) as [WorkItemType, number][]
          return (
            <Card key={release.id} className="bg-card border-border hover:border-accent/50 transition-colors">
              <CardContent className="py-4">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0 flex-wrap">
                    <Link
                      href={`/releases/${release.id}`}
                      className="text-sm font-semibold truncate hover:text-accent transition-colors"
                    >
                      {release.name}
                    </Link>
                    <Badge variant="secondary" className={cn('text-xs', releaseStatusStyles[release.status])}>
                      {releaseStatusLabels[release.status]}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{release.productName}</span>
                  </div>
                  <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                    <span>
                      {release.planCount} plan{release.planCount === 1 ? '' : 's'}
                    </span>
                    {counts.length > 0 && (
                      <span className="flex items-center gap-2">
                        {counts.map(([type, count]) => (
                          <span key={type} className="flex items-center gap-1">
                            <span className={cn('h-1.5 w-1.5 rounded-full', itemDotStyles[type])} />
                            {count} {itemDotLabels[type]}
                          </span>
                        ))}
                      </span>
                    )}
                    {release.shippedAt && <span>shipped {formatDateShort(release.shippedAt)}</span>}
                  </div>
                </div>
                {release.assets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {release.assets.map((a) => (
                      <Badge key={a.assetId} variant="outline" className="text-xs">
                        {a.assetName}
                        {a.version && <span className="ml-1 font-mono text-accent">{a.version}</span>}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          )
        })}
        {visible.length === 0 && (
          <Card className="bg-card border-border">
            <CardContent className="py-8 text-center text-sm text-muted-foreground">
              No releases in this state.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
