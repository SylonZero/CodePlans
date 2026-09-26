'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { FileText, Search } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import { REVIEW_STATE_LABELS, REVIEW_STATE_STYLES } from '@/components/review-panel'
import type { ReviewState } from '@/lib/db/schema.sqlite'

export type SpecListRow = {
  id: string
  title: string
  productName: string
  specType: string
  area: string | null
  status: string
  version: number
  needsReview: boolean
  authorType: string
  updatedAt: string
  linkCount: number
  reviewState: ReviewState | null
  openThreads: number
}

export const specStatusStyles: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-chart-1/20 text-chart-1',
  in_review: 'bg-chart-2/20 text-chart-2',
  archived: 'bg-muted text-muted-foreground',
  superseded: 'bg-muted text-muted-foreground line-through',
}

type TabKey = 'current' | 'review' | 'triage' | 'retired' | 'all'

const inTab: Record<TabKey, (s: SpecListRow) => boolean> = {
  current: (s) => s.status === 'draft' || s.status === 'in_review' || s.status === 'active',
  review: (s) => s.reviewState !== null,
  triage: (s) => s.needsReview && (s.status === 'draft' || s.status === 'in_review' || s.status === 'active'),
  retired: (s) => s.status === 'archived' || s.status === 'superseded',
  all: () => true,
}

export function SpecsClient({ specs, showProduct }: { specs: SpecListRow[]; showProduct: boolean }) {
  const [tab, setTab] = useState<TabKey>('current')
  const [query, setQuery] = useState('')
  const [type, setType] = useState('all')
  const types = useMemo(() => [...new Set(specs.map((s) => s.specType))].sort(), [specs])

  const q = query.trim().toLowerCase()
  const visible = specs.filter((s) => inTab[tab](s)
    && (type === 'all' || s.specType === type)
    && (!q || s.title.toLowerCase().includes(q) || (s.area ?? '').toLowerCase().includes(q)))

  if (specs.length === 0) {
    return (
      <Card className="bg-card border-border">
        <CardContent className="py-12 text-center">
          <FileText className="h-8 w-8 mx-auto text-muted-foreground mb-3" />
          <p className="text-sm font-medium mb-1">No specs yet</p>
          <p className="text-sm text-muted-foreground">Write down intended behavior and design, then link it to the assets, plans and work items it shapes.</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={tab} onValueChange={(v) => setTab(v as TabKey)}>
          <TabsList className="bg-muted">
            <TabsTrigger value="current">Current ({specs.filter(inTab.current).length})</TabsTrigger>
            <TabsTrigger value="review">In review ({specs.filter(inTab.review).length})</TabsTrigger>
            <TabsTrigger value="triage">Import triage ({specs.filter(inTab.triage).length})</TabsTrigger>
            <TabsTrigger value="retired">Archived ({specs.filter(inTab.retired).length})</TabsTrigger>
            <TabsTrigger value="all">All ({specs.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter by title or area" aria-label="Filter specs" className="pl-8 w-[220px]" />
          </div>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger className="w-[150px]" aria-label="Spec type"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All types</SelectItem>
              {types.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">No specs match these filters.</p>
      ) : (
        <Card className="bg-card border-border py-0">
          <CardContent className="p-0">
            <ul className="divide-y divide-border">
              {visible.map((s) => (
                <li key={s.id} className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/specs/${s.id}`} className="font-medium hover:text-accent transition-colors">{s.title}</Link>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {showProduct && s.productName ? `${s.productName} · ` : ''}{s.specType}{s.area ? ` · ${s.area}` : ''}
                      {' · '}{s.linkCount} {s.linkCount === 1 ? 'link' : 'links'}
                      {' · '}updated {formatDateShort(s.updatedAt)}{s.authorType === 'agent' ? ' · agent-authored' : ''}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {s.openThreads > 0 && <span className="text-xs text-muted-foreground" title="Open comment threads">{s.openThreads} open {s.openThreads === 1 ? 'thread' : 'threads'}</span>}
                    {s.reviewState && <Badge variant="secondary" className={REVIEW_STATE_STYLES[s.reviewState]}>{REVIEW_STATE_LABELS[s.reviewState]}</Badge>}
                    {s.needsReview && <Badge variant="outline" className="border-warning/50 text-warning">Import triage</Badge>}
                    <span className="font-mono text-xs text-muted-foreground">v{s.version}</span>
                    {!(s.status === 'in_review' && s.reviewState) && <Badge variant="secondary" className={cn(specStatusStyles[s.status])}>{s.status.replace('_', ' ')}</Badge>}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
