'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { TRIAGE_LABELS } from '@/lib/intake-labels'
import { triageStyles } from './triage-block'
import { Filter, Plus, Circle, Play, CheckCircle2, Wrench, ExternalLink, List, Layers, ArrowDown, ArrowUp, ArrowUpDown, Tag, Check, X, ChevronDown } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Checkbox } from '@/components/ui/checkbox'
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { timeAgo } from '@/components/comments-panel'
import {
  SEVERITIES, PAGE_SIZES, parseListView, writeListView, matchesListView, sortItems, nextSort, tagCounts, normalizePageSize,
  type ListView, type SortField,
} from '@/lib/work-item-list'
import type { WorkItemStatus, WorkItemType } from '@/lib/types'
import type { WorkItemWithContext, AssetDebtInfo } from '@/lib/db/queries'
import { cn } from '@/lib/utils'
import { OwnerAvatars } from '@/components/owner-avatars'
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

const PAGE_SIZE_KEY = 'codeplans.workItems.pageSize'
const UNASSIGNED_ASSET = '__unassigned__'
const UNASSIGNED_AREA = '__unassigned__'

export function WorkItemsClient({
  items,
  plans,
  products,
  assets,
  assetDebtInfo = [],
  members = [],
  scopedProductId,
  currentUserId,
}: {
  items: WorkItemWithContext[]
  plans: PlanOption[]
  products: ProductOption[]
  assets: AssetOption[]
  assetDebtInfo?: AssetDebtInfo[]
  members?: { id: string; name: string }[]
  scopedProductId: string | null
  currentUserId?: string
}) {
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<WorkItemStatus | 'all'>('all')
  const [typeFilter, setTypeFilter] = useState<WorkItemType | 'all'>('all')
  const [assetFilter, setAssetFilter] = useState<string>('all')
  const [areaFilter, setAreaFilter] = useState<string>('all')
  const [mineOnly, setMineOnly] = useState(false)
  // 'all' | 'internal' | 'external' | 'external:<triage state>'
  const [sourceFilter, setSourceFilter] = useState<string>('all')
  const [view, setView] = useState<'list' | 'debt'>('list')
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(25)
  const [createOpen, setCreateOpen] = useState(false)

  // Severity, tag and sort live in the URL so a filtered list can be shared.
  const listView = useMemo(() => parseListView(new URLSearchParams(searchParams.toString())), [searchParams])
  const updateListView = useCallback((patch: Partial<ListView>) => {
    const params = writeListView(new URLSearchParams(window.location.search), { ...listView, ...patch })
    const q = params.toString()
    window.history.replaceState(null, '', q ? `/work-items?${q}` : '/work-items')
    setPage(0)
  }, [listView])
  const toggleTag = useCallback((tag: string) => {
    updateListView({ tags: listView.tags.includes(tag) ? listView.tags.filter((t) => t !== tag) : [...listView.tags, tag] })
  }, [listView, updateListView])

  // Rows per page is a per-viewer preference.
  useEffect(() => {
    try { setPageSize(normalizePageSize(window.localStorage.getItem(PAGE_SIZE_KEY))) } catch { /* storage unavailable */ }
  }, [])
  const changePageSize = (v: string) => {
    const n = normalizePageSize(v)
    setPageSize(n)
    setPage(0)
    try { window.localStorage.setItem(PAGE_SIZE_KEY, String(n)) } catch { /* storage unavailable */ }
  }

  const openItemId = searchParams.get('item')
  const openItem = useMemo(
    () => (openItemId ? items.find((i) => i.id === openItemId) ?? null : null),
    [openItemId, items],
  )

  // Opening and closing the drawer keeps the list's filters in the URL.
  const openPanel = useCallback((item: WorkItemWithContext) => {
    const params = new URLSearchParams(window.location.search)
    params.set('item', item.id)
    window.history.pushState(null, '', `/work-items?${params}`)
  }, [])

  const closePanel = useCallback(() => {
    setCreateOpen(false)
    if (!openItemId) return
    const params = new URLSearchParams(window.location.search)
    params.delete('item')
    const q = params.toString()
    window.history.pushState(null, '', q ? `/work-items?${q}` : '/work-items')
  }, [openItemId])

  const allTags = useMemo(() => tagCounts(items), [items])

  const assetFilterOptions = useMemo(() => {
    const map = new Map<string, string>()
    let hasUnassigned = false
    for (const item of items) {
      if (item.assetId && item.assetName) map.set(item.assetId, item.assetName)
      else hasUnassigned = true
    }
    return {
      known: [...map.entries()].sort((a, b) => a[1].localeCompare(b[1])),
      hasUnassigned,
    }
  }, [items])

  const areaFilterOptions = useMemo(() => {
    const set = new Set<string>()
    let hasUnassigned = false
    for (const item of items) {
      if (item.area) set.add(item.area)
      else hasUnassigned = true
    }
    return { known: [...set].sort(), hasUnassigned }
  }, [items])

  const filteredItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false
    if (typeFilter !== 'all' && item.type !== typeFilter) return false
    if (assetFilter === UNASSIGNED_ASSET) {
      if (item.assetId) return false
    } else if (assetFilter !== 'all' && item.assetId !== assetFilter) return false
    if (areaFilter === UNASSIGNED_AREA) {
      if (item.area) return false
    } else if (areaFilter !== 'all' && item.area !== areaFilter) return false
    if (mineOnly && item.ownerId !== currentUserId) return false
    if (sourceFilter === 'internal' && item.origin !== 'internal') return false
    if (sourceFilter.startsWith('external')) {
      if (item.origin !== 'external') return false
      const wanted = sourceFilter.split(':')[1]
      if (wanted && item.triageState !== wanted) return false
    }
    return matchesListView(item, listView)
  })
  const sortedItems = sortItems(filteredItems, listView)
  const hasExternal = items.some((i) => i.origin === 'external')
  const pageItems = sortedItems.slice(page * pageSize, (page + 1) * pageSize)

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
        {currentUserId && (
          <label className="flex items-center gap-2 text-sm cursor-pointer select-none whitespace-nowrap">
            <Switch checked={mineOnly} onCheckedChange={(v) => { setMineOnly(v); setPage(0) }} />
            <span className="text-muted-foreground">Owned by me</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v as WorkItemType | 'all'); setPage(0) }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Types" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {TYPES.map((t) => (
                <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={assetFilter} onValueChange={(v) => { setAssetFilter(v); setPage(0) }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Assets" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Assets</SelectItem>
              {assetFilterOptions.known.map(([id, name]) => (
                <SelectItem key={id} value={id}>{name}</SelectItem>
              ))}
              {assetFilterOptions.hasUnassigned && (
                <SelectItem value={UNASSIGNED_ASSET}>No asset</SelectItem>
              )}
            </SelectContent>
          </Select>
          <Select value={areaFilter} onValueChange={(v) => { setAreaFilter(v); setPage(0) }}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="All Areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {areaFilterOptions.known.map((area) => (
                <SelectItem key={area} value={area}>{area}</SelectItem>
              ))}
              {areaFilterOptions.hasUnassigned && (
                <SelectItem value={UNASSIGNED_AREA}>No area</SelectItem>
              )}
            </SelectContent>
          </Select>
          <SeverityFilter value={listView.severities} onChange={(severities) => updateListView({ severities })} />
          {allTags.length > 0 && <TagFilter tags={allTags} value={listView.tags} onToggle={toggleTag} onClear={() => updateListView({ tags: [] })} />}
          {hasExternal && (
            <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(0) }}>
              <SelectTrigger className="w-[170px]" aria-label="Source and triage">
                <SelectValue placeholder="All sources" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All sources</SelectItem>
                <SelectItem value="internal">Internal</SelectItem>
                <SelectItem value="external">External reports</SelectItem>
                {(['untriaged', 'accepted', 'needs_info', 'declined'] as const).map((t) => (
                  <SelectItem key={t} value={`external:${t}`}>External · {TRIAGE_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
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

      {(listView.severities.length > 0 || listView.tags.length > 0) && view === 'list' && (
        <div className="-mt-3 mb-4 flex flex-wrap items-center gap-1.5 text-xs" aria-label="Active filters">
          {listView.severities.map((sv) => (
            <button key={sv} type="button" onClick={() => updateListView({ severities: listView.severities.filter((x) => x !== sv) })}
              className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 capitalize', severityStyles[sv])} aria-label={`Remove severity ${sv}`}>
              {sv}<X className="h-3 w-3" />
            </button>
          ))}
          {listView.tags.map((t) => (
            <button key={t} type="button" onClick={() => toggleTag(t)}
              className="inline-flex items-center gap-1 rounded-full border border-border bg-muted px-2 py-0.5" aria-label={`Remove tag ${t}`}>
              <Tag className="h-3 w-3" />{t}<X className="h-3 w-3" />
            </button>
          ))}
          <button type="button" className="ml-1 text-muted-foreground underline-offset-2 hover:underline" onClick={() => updateListView({ severities: [], tags: [] })}>Clear</button>
          <span className="text-muted-foreground">· {filteredItems.length} of {items.length}</span>
        </div>
      )}

      {view === 'debt' ? (
        <DebtRegister items={items} assetDebtInfo={assetDebtInfo} onOpen={openPanel} />
      ) : (
      <Card className="bg-card border-border">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Item</TableHead>
              <TableHead>Type</TableHead>
              <SortHead field="severity" label="Severity" view={listView} onSort={(f) => updateListView(nextSort(listView, f))} />
              <TableHead>Asset / Area</TableHead>
              <TableHead>Plans</TableHead>
              <TableHead>Status</TableHead>
              <SortHead field="created" label="Created" view={listView} onSort={(f) => updateListView(nextSort(listView, f))} className="hidden lg:table-cell" />
              <SortHead field="updated" label="Updated" view={listView} onSort={(f) => updateListView(nextSort(listView, f))} className="hidden lg:table-cell" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {pageItems.map((item) => (
              <TableRow key={item.id} className="cursor-pointer" onClick={() => openPanel(item)}>
                <TableCell className="max-w-[240px]">
                  <div>
                    <p className="font-medium flex items-center gap-1.5">
                      <span className={cn('truncate min-w-0', item.status === 'wont_do' && 'line-through text-muted-foreground')} title={item.title}>{item.title}</span>
                      {item.origin === 'external' && item.triageState && item.triageState !== 'accepted' && (
                        <Badge variant="outline" className={cn('h-5 shrink-0 px-1.5 text-[10px] font-normal', triageStyles[item.triageState])}>
                          {TRIAGE_LABELS[item.triageState]}
                        </Badge>
                      )}
                      {item.source !== 'native' && (
                        <span title={item.externalDeleted ? `Gone from ${item.source}: deleted or moved out of the connected scope` : `Mirrored from ${item.source}`} className="shrink-0">
                          <ExternalLink className={cn('h-3 w-3', item.externalDeleted ? 'text-amber-500' : 'text-muted-foreground')} />
                        </span>
                      )}
                    </p>
                    <p className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
                      <span className="truncate" title={item.productName}>{item.productName}</span>
                      {item.tags.slice(0, 3).map((t) => (
                        <button key={t} type="button" title={`Filter by tag ${t}`}
                          onClick={(e) => { e.stopPropagation(); toggleTag(t) }}
                          className={cn('shrink-0 rounded px-1 hover:bg-muted hover:text-foreground', listView.tags.includes(t) && 'bg-muted text-foreground')}>
                          #{t}
                        </button>
                      ))}
                      {item.tags.length > 3 && <span className="shrink-0">+{item.tags.length - 3}</span>}
                    </p>
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
                <TableCell className="text-sm text-muted-foreground max-w-[160px]" onClick={(e) => item.assetId && e.stopPropagation()}>
                  {item.assetId && item.assetName ? (
                    <Link href={`/assets/${item.assetId}`} className="truncate block hover:text-accent transition-colors" title={item.assetName}>
                      {item.assetName}
                    </Link>
                  ) : (
                    <div className="truncate">-</div>
                  )}
                  {item.area && <div className="text-xs truncate" title={item.area}>{item.area}</div>}
                </TableCell>
                <TableCell className="max-w-[180px]" onClick={(e) => e.stopPropagation()}>
                  {item.linkedPlans.length > 0 ? (
                    <div className="flex flex-col gap-0.5">
                      {item.linkedPlans.slice(0, 2).map((plan) => (
                        <Link
                          key={plan.id}
                          href={`/plans/${plan.id}`}
                          title={plan.title}
                          className="text-sm hover:text-accent transition-colors truncate block"
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
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell" title={item.createdAt} suppressHydrationWarning>{timeAgo(item.createdAt)}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-xs text-muted-foreground lg:table-cell" title={item.updatedAt} suppressHydrationWarning>{timeAgo(item.updatedAt)}</TableCell>
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
          {filteredItems.length > PAGE_SIZES[0] && (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>{page * pageSize + 1}–{Math.min((page + 1) * pageSize, filteredItems.length)} of {filteredItems.length}</span>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2">
                  <span>Rows</span>
                  <Select value={String(pageSize)} onValueChange={changePageSize}>
                    <SelectTrigger className="h-8 w-[72px]" aria-label="Rows per page"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZES.map((n) => <SelectItem key={n} value={String(n)}>{n}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </label>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={(page + 1) * pageSize >= filteredItems.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </div>
          )}
      </Card>
      )}
    </>
  )
}

function SortHead({ field, label, view, onSort, className }: {
  field: SortField
  label: string
  view: ListView
  onSort: (field: SortField) => void
  className?: string
}) {
  const active = view.sort === field
  const Icon = !active ? ArrowUpDown : view.dir === 'desc' ? ArrowDown : ArrowUp
  return (
    <TableHead className={className} aria-sort={active ? (view.dir === 'desc' ? 'descending' : 'ascending') : 'none'}>
      <button type="button" onClick={() => onSort(field)} className={cn('-ml-1 inline-flex items-center gap-1 rounded px-1 hover:text-foreground', active && 'text-foreground')}>
        {label}
        <Icon className={cn('h-3.5 w-3.5', !active && 'opacity-40')} />
      </button>
    </TableHead>
  )
}

function SeverityFilter({ value, onChange }: { value: ListView['severities']; onChange: (v: ListView['severities']) => void }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-[150px] justify-between font-normal" aria-label="Severity filter">
          <span className={cn('truncate', !value.length && 'text-muted-foreground')}>
            {value.length === 0 ? 'All Severities' : value.length === 1 ? <span className="capitalize">{value[0]}</span> : `${value.length} severities`}
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-48 p-2">
        {SEVERITIES.map((sv) => (
          <label key={sv} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
            <Checkbox checked={value.includes(sv)} onCheckedChange={(c) => onChange(c ? [...value, sv] : value.filter((x) => x !== sv))} />
            <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[sv])}>{sv}</Badge>
          </label>
        ))}
        {value.length > 0 && <Button variant="ghost" size="sm" className="mt-1 w-full" onClick={() => onChange([])}>Clear</Button>}
      </PopoverContent>
    </Popover>
  )
}

function TagFilter({ tags, value, onToggle, onClear }: {
  tags: { tag: string; count: number }[]
  value: string[]
  onToggle: (tag: string) => void
  onClear: () => void
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className="h-9 w-[150px] justify-between font-normal" aria-label="Tag filter">
          <span className={cn('flex min-w-0 items-center gap-1.5', !value.length && 'text-muted-foreground')}>
            <Tag className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{value.length === 0 ? 'All Tags' : value.length === 1 ? value[0] : `${value.length} tags`}</span>
          </span>
          <ChevronDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder="Search tags…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No matching tags</CommandEmpty>
            {tags.map(({ tag, count }) => (
              <CommandItem key={tag} value={tag} onSelect={() => onToggle(tag)}>
                <Check className={cn('h-4 w-4', value.includes(tag) ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate">{tag}</span>
                <span className="ml-auto text-xs text-muted-foreground">{count}</span>
              </CommandItem>
            ))}
          </CommandList>
        </Command>
        <p className="border-t border-border px-3 py-2 text-xs text-muted-foreground">
          Shows items with any selected tag.{value.length > 0 && <> <button type="button" className="underline" onClick={onClear}>Clear</button></>}
        </p>
      </PopoverContent>
    </Popover>
  )
}

// Matches the weighting used server-side for asset debt scores (lib/db/queries.ts getProduct/getAnalytics)
// so the register's ranking agrees with the score shown on the Products/Assets pages.
const DEBT_WEIGHT: Record<WorkItemWithContext['severity'], number> = { low: 3, medium: 8, high: 15, critical: 25 }

const healthStyles: Record<AssetDebtInfo['health'], string> = {
  healthy: 'bg-accent/20 text-accent',
  warning: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

/** Open tech-debt items grouped by asset, ranked by debt score — the debt register. */
function DebtRegister({
  items,
  assetDebtInfo,
  onOpen,
}: {
  items: WorkItemWithContext[]
  assetDebtInfo: AssetDebtInfo[]
  onOpen: (item: WorkItemWithContext) => void
}) {
  const openStatuses = ['open', 'planned', 'in_progress']
  const debtItems = items.filter((i) => i.type === 'tech_debt' && openStatuses.includes(i.status))
  const assetById = new Map(assetDebtInfo.map((a) => [a.id, a]))

  const groups = new Map<
    string,
    { label: string; product: string; asset?: AssetDebtInfo; items: WorkItemWithContext[] }
  >()
  for (const item of debtItems) {
    const key = item.assetId ?? `unassigned-${item.productId}`
    const group = groups.get(key) ?? {
      label: item.assetName ?? 'Unassigned',
      product: item.productName,
      asset: item.assetId ? assetById.get(item.assetId) : undefined,
      items: [],
    }
    group.items.push(item)
    groups.set(key, group)
  }

  const severityRank = { critical: 0, high: 1, medium: 2, low: 3 }
  const scored = [...groups.entries()].map(([key, group]) => {
    const derivedScore = Math.min(
      100,
      group.items.reduce((sum, item) => sum + (DEBT_WEIGHT[item.severity] ?? 8), 0),
    )
    const effectiveScore = group.asset?.techDebtScore ?? derivedScore
    return { key, group, effectiveScore }
  })
  const sortedGroups = scored.sort((a, b) => b.effectiveScore - a.effectiveScore)

  if (debtItems.length === 0) {
    return (
      <Card className="bg-card border-border">
        <div className="py-12 text-center text-muted-foreground">
          <p>No open tech debt</p>
          <p className="text-sm">Tech-debt work items appear here grouped by asset, ranked by debt score</p>
        </div>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {sortedGroups.map(({ key, group, effectiveScore }) => {
        const critical = group.items.filter((i) => i.severity === 'critical').length
        const high = group.items.filter((i) => i.severity === 'high').length
        const sorted = [...group.items].sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
        return (
          <Card key={key} className="bg-card border-border">
            <CardContent className="pt-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2">
                    {group.asset ? (
                      <Link href={`/assets/${group.asset.id}`} className="font-semibold hover:text-accent transition-colors">
                        {group.label}
                      </Link>
                    ) : (
                      <h3 className="font-semibold">{group.label}</h3>
                    )}
                    {group.asset && (
                      <Badge variant="secondary" className={cn('text-xs capitalize', healthStyles[group.asset.health])}>
                        {group.asset.health}
                      </Badge>
                    )}
                    {group.asset && group.asset.owners.length > 0 && (
                      <OwnerAvatars owners={group.asset.owners} />
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{group.product}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge
                    variant="secondary"
                    className={cn('text-xs', effectiveScore >= 60 ? severityStyles.critical : effectiveScore >= 30 ? severityStyles.high : severityStyles.medium)}
                    title={group.asset?.techDebtScore != null ? 'Manually set debt score' : 'Derived from open tech-debt severity'}
                  >
                    Debt score {effectiveScore}
                  </Badge>
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
