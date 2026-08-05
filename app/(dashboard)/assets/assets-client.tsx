'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { OwnerAvatars } from '@/components/owner-avatars'
import {
  Box, Server, Library, Database, Globe, Search,
  Map as MapIcon, LayoutGrid, List, FileCode2, BadgeCheck, Wrench,
} from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'
import type { AssetInventory, AssetInventoryRow } from '@/lib/db/queries'
import type { AssetType } from '@/lib/types'
import { AssetMap } from './asset-map'

export const assetTypeIcons: Record<AssetType, typeof Box> = {
  app: Box,
  service: Server,
  library: Library,
  datastore: Database,
  platform: Globe,
}

const assetTypeLabels: Record<AssetType, string> = {
  app: 'App',
  service: 'Service',
  library: 'Library',
  datastore: 'Datastore',
  platform: 'Platform',
}

export const healthStyles: Record<string, string> = {
  healthy: 'bg-accent/20 text-accent',
  warning: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const healthDot: Record<string, string> = {
  healthy: 'bg-accent',
  warning: 'bg-warning',
  critical: 'bg-destructive',
}

function debtColor(score: number) {
  return score < 25 ? 'bg-accent' : score < 50 ? 'bg-warning' : 'bg-destructive'
}

type ViewMode = 'map' | 'grid' | 'table'

export function AssetsClient({ inventory }: { inventory: AssetInventory }) {
  const [view, setView] = useState<ViewMode>('map')
  const [query, setQuery] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>('all')
  const [healthFilter, setHealthFilter] = useState<string>('all')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return inventory.assets.filter((a) => {
      if (typeFilter !== 'all' && a.type !== typeFilter) return false
      if (healthFilter !== 'all' && a.health !== healthFilter) return false
      if (q && !a.name.toLowerCase().includes(q) && !a.tags.some((t) => t.toLowerCase().includes(q))) {
        return false
      }
      return true
    })
  }, [inventory.assets, query, typeFilter, healthFilter])

  const filteredIds = useMemo(() => new Set(filtered.map((a) => a.id)), [filtered])
  const filteredEdges = useMemo(
    () => inventory.edges.filter((e) => filteredIds.has(e.sourceAssetId) && filteredIds.has(e.targetAssetId)),
    [inventory.edges, filteredIds],
  )

  const stats = useMemo(() => {
    const s = { total: inventory.assets.length, warning: 0, critical: 0, debt: 0, activePlans: 0 }
    for (const a of inventory.assets) {
      if (a.health === 'warning') s.warning += 1
      if (a.health === 'critical') s.critical += 1
      s.debt += a.openDebtCount
      s.activePlans += a.activePlanCount
    }
    return s
  }, [inventory.assets])

  const viewButtons: { mode: ViewMode; icon: typeof MapIcon; label: string }[] = [
    { mode: 'map', icon: MapIcon, label: 'Map' },
    { mode: 'grid', icon: LayoutGrid, label: 'Grid' },
    { mode: 'table', icon: List, label: 'Table' },
  ]

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        <span><span className="font-semibold text-foreground">{stats.total}</span> assets</span>
        <span>
          <span className={cn('font-semibold', stats.critical > 0 ? 'text-destructive' : 'text-foreground')}>
            {stats.critical}
          </span>{' '}
          critical ·{' '}
          <span className={cn('font-semibold', stats.warning > 0 ? 'text-warning' : 'text-foreground')}>
            {stats.warning}
          </span>{' '}
          warning
        </span>
        <span><span className="font-semibold text-foreground">{stats.debt}</span> open debt items</span>
        <span><span className="font-semibold text-foreground">{stats.activePlans}</span> active plan targets</span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-md border border-border overflow-hidden">
          {viewButtons.map(({ mode, icon: VIcon, label }) => (
            <button
              key={mode}
              type="button"
              onClick={() => setView(mode)}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-sm transition-colors',
                view === mode
                  ? 'bg-accent/15 text-accent'
                  : 'text-muted-foreground hover:text-foreground hover:bg-muted/50',
              )}
            >
              <VIcon className="h-3.5 w-3.5" />
              {label}
            </button>
          ))}
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name or tag…"
            className="h-8 w-52 pl-8"
          />
        </div>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="h-8 w-32" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(assetTypeLabels).map(([value, label]) => (
              <SelectItem key={value} value={value}>{label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={healthFilter} onValueChange={setHealthFilter}>
          <SelectTrigger className="h-8 w-32" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All health</SelectItem>
            <SelectItem value="healthy">Healthy</SelectItem>
            <SelectItem value="warning">Warning</SelectItem>
            <SelectItem value="critical">Critical</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            No assets match. Adjust the filters, or add assets from a product page.
          </CardContent>
        </Card>
      ) : view === 'map' ? (
        <AssetMap assets={filtered} edges={filteredEdges} />
      ) : view === 'grid' ? (
        <AssetGrid assets={filtered} />
      ) : (
        <AssetTable assets={filtered} />
      )}
    </div>
  )
}

function AssetGrid({ assets }: { assets: AssetInventoryRow[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {assets.map((a) => {
        const Icon = assetTypeIcons[a.type]
        return (
          <Link key={a.id} href={`/assets/${a.id}`} className="group">
            <Card className="bg-card border-border h-full transition-colors group-hover:border-accent/50">
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted">
                      <Icon className="h-4.5 w-4.5 text-muted-foreground" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate group-hover:text-accent transition-colors">
                        {a.name}
                      </p>
                      <p className="text-xs text-muted-foreground truncate">{a.productName}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.currentVersion && (
                      <Badge variant="outline" className="text-xs font-mono text-accent">{a.currentVersion}</Badge>
                    )}
                    <span className={cn('h-2 w-2 rounded-full', healthDot[a.health])} title={a.health} />
                  </div>
                </div>

                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <FileCode2 className="h-3 w-3" /> {a.activePlanCount} active
                  </span>
                  <span className="flex items-center gap-1">
                    <Wrench className="h-3 w-3" /> {a.openDebtCount} debt
                  </span>
                  <span className="flex items-center gap-1">
                    <BadgeCheck className="h-3 w-3" /> {a.capabilityCount} capabilities
                  </span>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
                    <span>Debt score</span>
                    <span>{a.effectiveDebtScore}</span>
                  </div>
                  <div className="h-1 rounded-full bg-muted overflow-hidden">
                    <div
                      className={cn('h-full rounded-full', debtColor(a.effectiveDebtScore))}
                      style={{ width: `${Math.min(a.effectiveDebtScore, 100)}%` }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Badge variant="secondary" className="text-xs">{assetTypeLabels[a.type]}</Badge>
                    <Badge
                      variant="outline"
                      className={cn('text-xs capitalize', !a.layer && 'opacity-60')}
                      title={a.layer ? 'layer' : 'layer (default from type)'}
                    >
                      {a.effectiveLayer}
                    </Badge>
                  </div>
                  <OwnerAvatars owners={a.owners} />
                </div>
              </CardContent>
            </Card>
          </Link>
        )
      })}
    </div>
  )
}

type SortKey = 'name' | 'product' | 'layer' | 'debt' | 'plans' | 'shipped'

function AssetTable({ assets }: { assets: AssetInventoryRow[] }) {
  const [sort, setSort] = useState<SortKey>('name')
  const [asc, setAsc] = useState(true)

  const sorted = useMemo(() => {
    const rows = [...assets]
    const dir = asc ? 1 : -1
    rows.sort((a, b) => {
      switch (sort) {
        case 'product': return dir * (a.productName.localeCompare(b.productName) || a.name.localeCompare(b.name))
        case 'layer': return dir * (a.effectiveLayer.localeCompare(b.effectiveLayer) || a.name.localeCompare(b.name))
        case 'debt': return dir * (a.effectiveDebtScore - b.effectiveDebtScore)
        case 'plans': return dir * (a.activePlanCount - b.activePlanCount)
        case 'shipped': return dir * (a.lastShippedAt ?? '').localeCompare(b.lastShippedAt ?? '')
        default: return dir * a.name.localeCompare(b.name)
      }
    })
    return rows
  }, [assets, sort, asc])

  const header = (key: SortKey, label: string, className?: string) => (
    <th
      className={cn('px-4 py-2.5 text-left font-medium cursor-pointer select-none hover:text-foreground', className)}
      onClick={() => {
        if (sort === key) setAsc(!asc)
        else { setSort(key); setAsc(key === 'name' || key === 'product') }
      }}
    >
      {label}{sort === key ? (asc ? ' ↑' : ' ↓') : ''}
    </th>
  )

  return (
    <Card className="bg-card border-border overflow-hidden py-0">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-xs text-muted-foreground">
              {header('name', 'Asset')}
              {header('product', 'Product')}
              {header('layer', 'Layer')}
              <th className="px-4 py-2.5 text-left font-medium">Health</th>
              <th className="px-4 py-2.5 text-left font-medium">Version</th>
              {header('debt', 'Debt', 'text-right')}
              {header('plans', 'Active plans', 'text-right')}
              {header('shipped', 'Last shipped')}
              <th className="px-4 py-2.5 text-left font-medium">Owners</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {sorted.map((a) => {
              const Icon = assetTypeIcons[a.type]
              return (
                <tr key={a.id} className="hover:bg-muted/40 transition-colors">
                  <td className="px-4 py-2.5">
                    <Link href={`/assets/${a.id}`} className="flex items-center gap-2 font-medium hover:text-accent transition-colors">
                      <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="truncate">{a.name}</span>
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground">{a.productName}</td>
                  <td className={cn('px-4 py-2.5 capitalize', a.layer ? 'text-foreground' : 'text-muted-foreground')}>
                    {a.effectiveLayer}
                  </td>
                  <td className="px-4 py-2.5">
                    <Badge variant="secondary" className={cn('text-xs capitalize', healthStyles[a.health])}>
                      {a.health}
                    </Badge>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-xs text-accent">{a.currentVersion ?? '—'}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{a.effectiveDebtScore}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{a.activePlanCount}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">
                    {a.lastShippedAt ? formatDateShort(a.lastShippedAt) : '—'}
                  </td>
                  <td className="px-4 py-2.5"><OwnerAvatars owners={a.owners} /></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
