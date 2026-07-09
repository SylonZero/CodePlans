'use client'

import { useCallback, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Filter, Plus, Circle, Play, CheckCircle2, Wrench, ExternalLink, List, Layers } from 'lucide-react'
import type { WorkItemStatus, WorkItemType } from '@/lib/types'
import type { WorkItemWithContext } from '@/lib/db/queries'
import { cn } from '@/lib/utils'
import {
  WorkItemPanel,
  TYPES,
  typeStyles,
  severityStyles,
  statusStyles,
  typeLabel,
  statusLabel,
  type PlanOption,
  type ProductOption,
  type AssetOption,
} from './work-item-panel'

const PAGE_SIZE = 25

export function WorkItemsClient({
  items,
  plans,
  products,
  assets,
  members = [],
  scopedProductId,
}: {
  items: WorkItemWithContext[]
  plans: PlanOption[]
  products: ProductOption[]
  assets: AssetOption[]
  members?: { id: string; name: string }[]
  scopedProductId: string | null
}) {
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<WorkItemType | 'all'>('all')
  const [view, setView] = useState<'list' | 'debt'>('list')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const openItemId = searchParams.get('item')
  const openItem = useMemo(
    () => (openItemId ? items.find((i) => i.id === openItemId) ?? null : null),
    [openItemId, items],
  )

  const openPanel = useCallback((item: WorkItemWithContext) => {
    window.history.pushState(null, '', `/work-items?item=${item.id}`)
  }, [])

  const closePanel = useCallback(() => {
    setCreateOpen(false)
    if (openItemId) window.history.pushState(null, '', '/work-items')
  }, [openItemId])

  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    return true
  })
  const pageItems = filteredItems.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const openStatuses: WorkItemStatus[] = ['open', 'planned', 'in_progress']
  const stats = {
    open: items.filter((i) => openStatuses.includes(i.status)).length,
    in_progress: items.filter((i) => i.status === 'in_progress').length,
    resolved: items.filter((i) => i.status === 'resolved').length,
    techDebt: items.filter((i) => i.type === 'tech_debt' && openStatuses.includes(i.status)).length,
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Work Items</h1>
          <p className="text-muted-foreground">Features, bugs, UX issues, and tech debt — and the code plans that address them</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Work Item
        </Button>
      </div>

      <WorkItemPanel
        open={createOpen || !!openItem}
        mode={createOpen ? 'create' : 'view'}
        item={openItem}
        plans={plans}
        products={products}
        assets={assets}
        members={members}
        scopedProductId={scopedProductId}
        onClose={closePanel}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.open}</span>
            </div>
            <p className="text-sm text-muted-foreground">Open Items</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-chart-1" />
              <span className="text-2xl font-bold">{stats.in_progress}</span>
            </div>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <span className="text-2xl font-bold">{stats.resolved}</span>
            </div>
            <p className="text-sm text-muted-foreground">Resolved</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Wrench className="h-5 w-5 text-warning" />
              <span className="text-2xl font-bold">{stats.techDebt}</span>
            </div>
            <p className="text-sm text-muted-foreground">Open Tech Debt</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-6">
        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as WorkItemStatus | 'all'); setPage(0) }} className="w-full sm:w-auto">
          <TabsList className="bg-muted">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="planned">Planned</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="resolved">Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as WorkItemType | 'all'); setPage(0) }}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-md">
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-r-none" title="List view" onClick={() => setView('list')}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === 'debt' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-l-none" title="Tech debt register (open debt by asset)" onClick={() => setView('debt')}>
              <Layers className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {view === 'debt' ? (
        <DebtRegister items={items} onOpen={openPanel} />
      ) : (
      <Card className="bg-card border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Asset / Area</TableHead>
              <TableHead>Plans</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((item) => (
              <TableRow key={item.id} className="cursor-pointer" onClick={() => openPanel(item)}>
                <TableCell>
                  <div>
                    <p className={cn('font-medium flex items-center gap-1.5', item.status === 'wont_do' && 'line-through text-muted-foreground')}>
                      {item.title}
                      {item.source !== 'native' && (
                        <span title={`Mirrored from ${item.source}`}>
                          <ExternalLink className="h-3 w-3 text-muted-foreground" />
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-muted-foreground">{item.productName}</p>
                  </div>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-xs', typeStyles[item.type])}>
                    {typeLabel(item.type)}
                  </Badge>
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[item.severity])}>
                    {item.severity}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {item.assetName ?? '-'}
                  {item.area && <span className="text-xs block">{item.area}</span>}
                </TableCell>
                <TableCell onClick={(e) => e.stopPropagation()}>
                  {item.linkedPlans.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {item.linkedPlans.slice(0, 2).map((plan) => (
                        <Link
                          key={plan.id}
                          href={`/plans/${plan.id}`}
                          className="text-sm hover:text-accent transition-colors truncate max-w-[180px]"
                        >
                          {plan.title}
                        </Link>
                      ))}
                      {item.linkedPlans.length > 2 && (
                        <span className="text-xs text-muted-foreground">+{item.linkedPlans.length - 2} more</span>
                      )}
                    </div>
                  ) : (
                    <span className="text-sm text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  <Badge variant="secondary" className={cn('text-xs', statusStyles[item.status])}>
                    {statusLabel(item.status)}
                  </Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
        {filteredItems.length === 0 && (
          <div className="py-12 text-center text-muted-foreground">
            <p>No work items found</p>
            <p className="text-sm">
              {items.length === 0 ? 'Create your first work item to start mapping demand to code plans' : 'Try adjusting your filters'}
            </p>
          </div>
        )}
          {filteredItems.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredItems.length)} of {filteredItems.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredItems.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
      </Card>
      )}
    </>
  )
}

/** Open tech-debt items grouped by asset — the debt register. */
function DebtRegister({
  items,
  onOpen,
}: {
  items: WorkItemWithContext[]
  onOpen: (item: WorkItemWithContext) => void
}) {
  const openStatuses = ['open', 'planned', 'in_progress']
  const debtItems = items.filter((i) => i.type === 'tech_debt' && openStatuses.includes(i.status))

  const groups = new Map<string, { label: string; product: string; items: WorkItemWithContext[] }>()
  for (const item of debtItems) {
    const key = item.assetId ?? `unassigned-${item.productId}`
    const group = groups.get(key) ?? {
      label: item.assetName ?? 'Unassigned',
      product: item.productName,
      items: [],
    }
    group.items.push(item)
    groups.set(key, group)
  }

  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  const sortedGroups = [...groups.entries()].sort((a, b) => b[1].items.length - a[1].items.length)

  if (debtItems.length === 0) {
    return (
      <Card className="bg-card border-border">
        <div className="py-12 text-center text-muted-foreground">
          <p>No open tech debt</p>
          <p className="text-sm">Tech-debt work items appear here grouped by asset</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {sortedGroups.map(([key, group]) => {
        const critical = group.items.filter((i) => i.severity === 'critical').length
        const high = group.items.filter((i) => i.severity === 'high').length
        const sorted = [...group.items].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
        return (
          <Card key={key} className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold">{group.label}</h3>
                  <p className="text-xs text-muted-foreground">{group.product}</p>
                </div>
                <div className="flex items-center gap-2">
                  {critical > 0 && (
                    <Badge variant="secondary" className={severityStyles.critical}>{critical} critical</Badge>
                  )}
                  {high > 0 && (
                    <Badge variant="secondary" className={severityStyles.high}>{high} high</Badge>
                  )}
                  <Badge variant="outline">{group.items.length} item{group.items.length > 1 ? 's' : ''}</Badge>
                </div>
              </div>
              <ul className="divide-y divide-border">
                {sorted.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 py-2.5 cursor-pointer hover:bg-muted/40 -mx-2 px-2 rounded"
                    onClick={() => onOpen(item)}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{item.title}</p>
                      {item.area && <p className="text-xs text-muted-foreground">{item.area}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.linkedPlans.length > 0 && (
                        <Badge variant="outline" className="text-xs">
                          {item.linkedPlans.length} plan{item.linkedPlans.length > 1 ? 's' : ''}
                        </Badge>
                      )}
                      <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[item.severity])}>
                        {item.severity}
                      </Badge>
                      <Badge variant="secondary" className={cn('text-xs', statusStyles[item.status])}>
                        {statusLabel(item.status)}
                      </Badge>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
