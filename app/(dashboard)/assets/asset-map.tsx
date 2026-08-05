'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Badge } from '@/components/ui/badge'
import { HeartPulse, Wrench, Activity } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { AssetInventoryRow, DependencyEdge } from '@/lib/db/queries'
import { assetTypeIcons } from './assets-client'

/**
 * The system map: products as columns, assets as nodes, dependency edges as
 * curves. Pure HTML nodes over an SVG underlay — deterministic layout, no
 * graph library. Lenses recolor the same map by health, debt, or activity.
 */

const PAD = 16
const HEADER_H = 40
const COL_W = 230
const COL_GAP = 90
const NODE_H = 56
const NODE_GAP = 16

type Lens = 'health' | 'debt' | 'activity'

const lensOptions: { key: Lens; label: string; icon: typeof HeartPulse }[] = [
  { key: 'health', label: 'Health', icon: HeartPulse },
  { key: 'debt', label: 'Debt', icon: Wrench },
  { key: 'activity', label: 'Activity', icon: Activity },
]

function lensBorder(lens: Lens, a: AssetInventoryRow): string {
  if (lens === 'health') {
    return a.health === 'critical' ? 'border-l-destructive' : a.health === 'warning' ? 'border-l-warning' : 'border-l-accent'
  }
  if (lens === 'debt') {
    return a.effectiveDebtScore >= 50 ? 'border-l-destructive' : a.effectiveDebtScore >= 25 ? 'border-l-warning' : 'border-l-accent'
  }
  return a.activePlanCount > 0 ? 'border-l-chart-1' : 'border-l-muted-foreground/30'
}

function lensDetail(lens: Lens, a: AssetInventoryRow): string {
  if (lens === 'health') return a.health
  if (lens === 'debt') return `debt ${a.effectiveDebtScore}${a.openDebtCount > 0 ? ` · ${a.openDebtCount} open` : ''}`
  return a.activePlanCount > 0
    ? `${a.activePlanCount} active plan${a.activePlanCount === 1 ? '' : 's'}`
    : 'quiet'
}

const edgeDash: Record<DependencyEdge['dependencyType'], string | undefined> = {
  depends_on: undefined,
  integrates_with: '6 4',
  aggregates: '2 4',
}

type LaidOutNode = { asset: AssetInventoryRow; x: number; y: number }

export function AssetMap({ assets, edges }: { assets: AssetInventoryRow[]; edges: DependencyEdge[] }) {
  const [lens, setLens] = useState<Lens>('health')
  const [hoverId, setHoverId] = useState<string | null>(null)

  const layout = useMemo(() => {
    // Column per product, in first-seen order.
    const productOrder: { id: string; name: string }[] = []
    const byProduct = new Map<string, AssetInventoryRow[]>()
    for (const a of assets) {
      if (!byProduct.has(a.productId)) {
        byProduct.set(a.productId, [])
        productOrder.push({ id: a.productId, name: a.productName })
      }
      byProduct.get(a.productId)!.push(a)
    }

    // Two barycenter sweeps: order nodes within a column by the average row
    // of their neighbors, so cross-column edges stay short and legible.
    const neighbor = new Map<string, string[]>()
    for (const e of edges) {
      neighbor.set(e.sourceAssetId, [...(neighbor.get(e.sourceAssetId) ?? []), e.targetAssetId])
      neighbor.set(e.targetAssetId, [...(neighbor.get(e.targetAssetId) ?? []), e.sourceAssetId])
    }
    const rowOf = new Map<string, number>()
    for (const p of productOrder) byProduct.get(p.id)!.forEach((a, i) => rowOf.set(a.id, i))
    for (let sweep = 0; sweep < 2; sweep++) {
      for (const p of productOrder) {
        const col = byProduct.get(p.id)!
        col.sort((a, b) => {
          const bary = (id: string) => {
            const ns = neighbor.get(id)
            if (!ns || ns.length === 0) return rowOf.get(id)!
            return ns.reduce((sum, n) => sum + (rowOf.get(n) ?? 0), 0) / ns.length
          }
          return bary(a.id) - bary(b.id)
        })
        col.forEach((a, i) => rowOf.set(a.id, i))
      }
    }

    const nodes = new Map<string, LaidOutNode>()
    productOrder.forEach((p, colIdx) => {
      byProduct.get(p.id)!.forEach((a, rowIdx) => {
        nodes.set(a.id, {
          asset: a,
          x: PAD + colIdx * (COL_W + COL_GAP),
          y: PAD + HEADER_H + rowIdx * (NODE_H + NODE_GAP),
        })
      })
    })
    const maxRows = Math.max(...productOrder.map((p) => byProduct.get(p.id)!.length))
    return {
      nodes,
      products: productOrder,
      // The trailing 90px keeps same-column arcs (which bow out the right side
      // of the last column) inside the canvas.
      width: PAD * 2 + productOrder.length * COL_W + (productOrder.length - 1) * COL_GAP + 90,
      height: PAD * 2 + HEADER_H + maxRows * (NODE_H + NODE_GAP) - NODE_GAP,
    }
  }, [assets, edges])

  const neighborsOfHover = useMemo(() => {
    if (!hoverId) return null
    const set = new Set<string>([hoverId])
    for (const e of edges) {
      if (e.sourceAssetId === hoverId) set.add(e.targetAssetId)
      if (e.targetAssetId === hoverId) set.add(e.sourceAssetId)
    }
    return set
  }, [hoverId, edges])

  function edgePath(e: DependencyEdge): string | null {
    const s = layout.nodes.get(e.sourceAssetId)
    const t = layout.nodes.get(e.targetAssetId)
    if (!s || !t) return null
    const sy = s.y + NODE_H / 2
    const ty = t.y + NODE_H / 2
    if (s.x === t.x) {
      // Same column: arc out the right side.
      const x = s.x + COL_W
      const bulge = Math.min(80, 36 + Math.abs(ty - sy) * 0.08)
      return `M ${x} ${sy} C ${x + bulge} ${sy}, ${x + bulge} ${ty}, ${x} ${ty}`
    }
    const leftToRight = s.x < t.x
    const sx = leftToRight ? s.x + COL_W : s.x
    const tx = leftToRight ? t.x : t.x + COL_W
    const mid = (tx - sx) / 2
    return `M ${sx} ${sy} C ${sx + mid} ${sy}, ${tx - mid} ${ty}, ${tx} ${ty}`
  }

  return (
    <div className="space-y-3">
      {/* Lens picker + edge legend */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground mr-1">Lens</span>
          {lensOptions.map(({ key, label, icon: LIcon }) => (
            <button
              key={key}
              type="button"
              onClick={() => setLens(key)}
              className={cn(
                'flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors',
                lens === key
                  ? 'border-accent/40 bg-accent/15 text-accent'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <LIcon className="h-3 w-3" />
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" /></svg>
            depends on
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="6 4" /></svg>
            integrates with
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="24" height="6"><line x1="0" y1="3" x2="24" y2="3" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="2 4" /></svg>
            aggregates
          </span>
        </div>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-auto">
        <div className="relative" style={{ width: layout.width, height: layout.height }}>
          {/* Edge underlay */}
          <svg className="absolute inset-0" width={layout.width} height={layout.height} aria-hidden>
            <defs>
              <marker id="atlas-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M 0 0 L 8 4 L 0 8 z" fill="context-stroke" />
              </marker>
            </defs>
            {edges.map((e) => {
              const d = edgePath(e)
              if (!d) return null
              const active = hoverId !== null && (e.sourceAssetId === hoverId || e.targetAssetId === hoverId)
              const dimmed = hoverId !== null && !active
              return (
                <path
                  key={e.id}
                  d={d}
                  fill="none"
                  strokeWidth={active ? 2 : 1.25}
                  strokeDasharray={edgeDash[e.dependencyType]}
                  markerEnd="url(#atlas-arrow)"
                  className={cn(
                    'transition-all',
                    active ? 'stroke-accent' : dimmed ? 'stroke-muted-foreground/15' : 'stroke-muted-foreground/45',
                  )}
                >
                  <title>{`${e.sourceAssetName} ${e.dependencyType.replace(/_/g, ' ')} ${e.targetAssetName}${e.description ? ` — ${e.description}` : ''}`}</title>
                </path>
              )
            })}
          </svg>

          {/* Product column headers */}
          {layout.products.map((p, i) => (
            <div
              key={p.id}
              className="absolute text-xs font-medium uppercase tracking-wider text-muted-foreground truncate"
              style={{ left: PAD + i * (COL_W + COL_GAP), top: PAD, width: COL_W }}
            >
              {p.name}
            </div>
          ))}

          {/* Asset nodes */}
          {[...layout.nodes.values()].map(({ asset: a, x, y }) => {
            const Icon = assetTypeIcons[a.type]
            const dimmed = neighborsOfHover !== null && !neighborsOfHover.has(a.id)
            return (
              <Link
                key={a.id}
                href={`/assets/${a.id}`}
                prefetch={false}
                onMouseEnter={() => setHoverId(a.id)}
                onMouseLeave={() => setHoverId(null)}
                onFocus={() => setHoverId(a.id)}
                onBlur={() => setHoverId(null)}
                className={cn(
                  'absolute flex flex-col justify-center gap-0.5 rounded-md border border-border border-l-[3px] bg-background px-2.5 transition-all hover:border-accent/60 hover:shadow-md',
                  lensBorder(lens, a),
                  dimmed && 'opacity-35',
                )}
                style={{ left: x, top: y, width: COL_W, height: NODE_H }}
              >
                <span className="flex items-center gap-1.5 min-w-0">
                  <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">{a.name}</span>
                  {a.currentVersion && (
                    <Badge variant="outline" className="ml-auto shrink-0 font-mono text-[10px] text-accent px-1 py-0">
                      {a.currentVersion}
                    </Badge>
                  )}
                </span>
                <span className="truncate text-xs text-muted-foreground capitalize">{lensDetail(lens, a)}</span>
              </Link>
            )
          })}
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Drawn live from your asset inventory and dependency edges — hover an asset to see its blast radius, click through for its record.
      </p>
    </div>
  )
}
