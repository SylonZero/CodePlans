import type { AssetInventory } from '@/lib/db/queries'
import { LAYER_TAXONOMY } from '@/lib/types'
import {
  inactiveStatuses,
  plainText,
  wikiKinds,
  type WikiData,
  type WikiKind,
} from './model'

export type MapReach = 'direct' | 'upstream' | 'downstream'
export type MapLens = 'health' | 'activity' | 'debt'
export type MapGroup = 'layer' | 'product'
export type MapScope = 'product' | 'all'
export type WikiMapDocument = {
  key: string
  kind: WikiKind
  title: string
  status: string
}
export type WikiMapNode = {
  id: string
  name: string
  type: string
  layer: string
  productId: string
  productName: string
  productSlug: string
  health: string
  version?: string
  owners: string[]
  openItems: number
  activePlans: number
  capabilities: number
  debtScore: number
  /** Description excerpt; empty for assets outside the wiki's product. */
  summary: string
  /** Current, capped per kind; empty for assets outside the wiki's product. */
  documents: WikiMapDocument[]
  documentCounts: Partial<Record<WikiKind, number>>
}
export type WikiMapEdge = {
  id: string
  source: string
  target: string
  type: 'depends_on' | 'integrates_with' | 'aggregates'
  description: string | null
}
export type WikiMapData = {
  product: { id: string; name: string; slug: string }
  nodes: WikiMapNode[]
  edges: WikiMapEdge[]
}

const DOCS_PER_KIND = 4

/** Map nodes and edges for every asset the reader can see. Only the wiki's own
 * product contributes document titles and excerpts; bodies never leave the server.
 */
export function buildWikiMap(
  data: WikiData,
  inventory: AssetInventory,
): WikiMapData {
  return {
    product: {
      id: data.product.id,
      name: data.product.name,
      slug: data.product.slug,
    },
    nodes: inventory.assets.map((a) => {
      const own = a.productId === data.product.id
      const docs = own
        ? data.documents.filter(
            (d) =>
              d.kind !== 'asset' &&
              !inactiveStatuses.has(d.status) &&
              d.associations.some((x) => x.assetId === a.id),
          )
        : []
      const documentCounts: Partial<Record<WikiKind, number>> = {}
      for (const d of docs)
        documentCounts[d.kind] = (documentCounts[d.kind] ?? 0) + 1
      return {
        id: a.id,
        name: a.name,
        type: a.type,
        layer: a.effectiveLayer,
        productId: a.productId,
        productName: a.productName,
        productSlug: a.productSlug,
        health: a.health,
        version: a.currentVersion,
        owners: a.owners.map((o) => o.name),
        openItems: a.openItemCount,
        activePlans: a.activePlanCount,
        capabilities: a.capabilityCount,
        debtScore: a.effectiveDebtScore,
        summary: own
          ? plainText(
              data.documents.find((d) => d.key === `asset:${a.id}`)?.body ??
                '',
            ).slice(0, 240)
          : '',
        documents: wikiKinds.flatMap((k) =>
          docs
            .filter((d) => d.kind === k)
            .slice(0, DOCS_PER_KIND)
            .map((d) => ({
              key: d.key,
              kind: d.kind,
              title: d.title,
              status: d.status,
            })),
        ),
        documentCounts,
      }
    }),
    edges: inventory.edges.map((e) => ({
      id: e.id,
      source: e.sourceAssetId,
      target: e.targetAssetId,
      type: e.dependencyType,
      description: e.description,
    })),
  }
}

/**
 * Nodes reachable from `focus`, with their shortest distance. Upstream follows
 * what the asset depends on; downstream follows who depends on it (blast
 * radius). Direct is both directions, one hop.
 */
export function reachFrom(
  focus: string,
  edges: Pick<WikiMapEdge, 'source' | 'target'>[],
  reach: MapReach,
): Map<string, number> {
  const depth = new Map([[focus, 0]])
  if (reach === 'direct') {
    for (const e of edges) {
      if (e.source === focus && !depth.has(e.target)) depth.set(e.target, 1)
      if (e.target === focus && !depth.has(e.source)) depth.set(e.source, 1)
    }
    return depth
  }
  const queue = [focus]
  while (queue.length) {
    const id = queue.shift()!
    for (const e of edges) {
      const [from, to] =
        reach === 'upstream' ? [e.source, e.target] : [e.target, e.source]
      if (from === id && !depth.has(to)) {
        depth.set(to, depth.get(id)! + 1)
        queue.push(to)
      }
    }
  }
  return depth
}

/** Edges that make up a reach: touching the focus for direct, otherwise any
 * edge between two reached nodes that runs in the traversal direction.
 */
export function reachEdge(
  e: Pick<WikiMapEdge, 'source' | 'target'>,
  focus: string,
  reach: MapReach,
  depth: Map<string, number>,
) {
  if (reach === 'direct') return e.source === focus || e.target === focus
  const [from, to] =
    reach === 'upstream' ? [e.source, e.target] : [e.target, e.source]
  return depth.has(from) && depth.has(to) && depth.get(to)! > 0
}

export const MAP = {
  pad: 20,
  header: 36,
  colW: 210,
  colGap: 76,
  nodeH: 60,
  nodeGap: 18,
  /** Product band label strip and the space between bands. */
  bandHeader: 34,
  bandGap: 22,
  /** Same-column arcs bow out past the last column. */
  trail: 90,
}

export type MapLayout = {
  columns: { key: string; x: number; count: number }[]
  /** One band per product when grouped by product; otherwise a single unlabelled band. */
  bands: { key: string; label: string; y: number; height: number }[]
  positions: Map<string, { x: number; y: number }>
  width: number
  height: number
}

/**
 * Deterministic grid: one column per layer (taxonomy order, unknown layers
 * last) and, when grouped by product, one horizontal band per product (the
 * wiki's product first). Within each cell, two barycenter sweeps order assets
 * by their neighbours' rows so connected assets sit near each other. Nothing
 * is stored; the same records always produce the same map.
 */
export function layoutMap(
  nodes: Pick<
    WikiMapNode,
    'id' | 'name' | 'layer' | 'productId' | 'productName'
  >[],
  edges: Pick<WikiMapEdge, 'source' | 'target'>[],
  group: MapGroup,
  currentProductId?: string,
): MapLayout {
  const sorted = [...nodes].sort(
    (a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id),
  )
  const taxonomy = LAYER_TAXONOMY as readonly string[]
  const layers = [...new Set(sorted.map((n) => n.layer))].sort(
    (a, b) =>
      (taxonomy.includes(a) ? taxonomy.indexOf(a) : 99) -
        (taxonomy.includes(b) ? taxonomy.indexOf(b) : 99) ||
      a.localeCompare(b),
  )
  const productName = new Map(sorted.map((n) => [n.productId, n.productName]))
  const bandKeys =
    group === 'product'
      ? [...productName.keys()].sort(
          (a, b) =>
            Number(b === currentProductId) - Number(a === currentProductId) ||
            productName.get(a)!.localeCompare(productName.get(b)!) ||
            a.localeCompare(b),
        )
      : ['']
  const bandOf = (n: (typeof nodes)[number]) =>
    group === 'product' ? n.productId : ''
  const cells = new Map<string, typeof nodes>()
  const cellKey = (band: string, layer: string) => `${band}\u0000${layer}`
  for (const n of sorted) {
    const k = cellKey(bandOf(n), n.layer)
    cells.set(k, [...(cells.get(k) ?? []), n])
  }
  const bandRows = bandKeys.map((b) =>
    Math.max(1, ...layers.map((l) => cells.get(cellKey(b, l))?.length ?? 0)),
  )
  const bandOffset = bandKeys.map((_, i) =>
    bandRows.slice(0, i).reduce((s, r) => s + r, 0),
  )
  const neighbors = new Map<string, string[]>()
  for (const e of edges) {
    neighbors.set(e.source, [...(neighbors.get(e.source) ?? []), e.target])
    neighbors.set(e.target, [...(neighbors.get(e.target) ?? []), e.source])
  }
  const row = new Map<string, number>()
  const place = () =>
    bandKeys.forEach((b, bi) =>
      layers.forEach((l) =>
        cells
          .get(cellKey(b, l))
          ?.forEach((n, i) => row.set(n.id, bandOffset[bi] + i)),
      ),
    )
  place()
  for (let sweep = 0; sweep < 2; sweep++)
    for (const l of layers)
      for (const b of bandKeys) {
        const cell = cells.get(cellKey(b, l))
        if (!cell) continue
        const bary = (id: string) => {
          const ns = (neighbors.get(id) ?? []).filter((n) => row.has(n))
          return ns.length
            ? ns.reduce((s, n) => s + row.get(n)!, 0) / ns.length
            : row.get(id)!
        }
        const scores = new Map(cell.map((n) => [n.id, bary(n.id)]))
        cell.sort(
          (x, y) =>
            scores.get(x.id)! - scores.get(y.id)! ||
            x.name.localeCompare(y.name) ||
            x.id.localeCompare(y.id),
        )
        place()
      }
  const labelled = group === 'product'
  const rowH = MAP.nodeH + MAP.nodeGap
  let y = MAP.pad + MAP.header
  const bands = bandKeys.map((key, i) => {
    const height =
      (labelled ? MAP.bandHeader : 0) + bandRows[i] * rowH - MAP.nodeGap
    const band = {
      key,
      label: labelled ? productName.get(key)! : '',
      y,
      height,
    }
    y += height + (labelled ? MAP.bandGap : MAP.nodeGap)
    return band
  })
  const positions = new Map<string, { x: number; y: number }>()
  const columns = layers.map((key, c) => {
    const x = MAP.pad + c * (MAP.colW + MAP.colGap)
    let count = 0
    bandKeys.forEach((b, bi) =>
      cells.get(cellKey(b, key))?.forEach((n, r) => {
        count++
        positions.set(n.id, {
          x,
          y: bands[bi].y + (labelled ? MAP.bandHeader : 0) + r * rowH,
        })
      }),
    )
    return { key, x, count }
  })
  return {
    columns,
    bands,
    positions,
    width:
      MAP.pad * 2 +
      layers.length * MAP.colW +
      Math.max(0, layers.length - 1) * MAP.colGap +
      MAP.trail,
    height: nodes.length
      ? y - (labelled ? MAP.bandGap : MAP.nodeGap) + MAP.pad
      : MAP.pad * 2 + MAP.header,
  }
}

/** Cubic edge between node sides; same-column edges arc out to the right. */
export function edgePath(
  s: { x: number; y: number },
  t: { x: number; y: number },
) {
  const sy = s.y + MAP.nodeH / 2,
    ty = t.y + MAP.nodeH / 2
  if (s.x === t.x) {
    const x = s.x + MAP.colW,
      bulge = Math.min(80, 36 + Math.abs(ty - sy) * 0.08)
    return `M ${x} ${sy} C ${x + bulge} ${sy}, ${x + bulge} ${ty}, ${x} ${ty}`
  }
  const ltr = s.x < t.x,
    sx = ltr ? s.x + MAP.colW : s.x,
    tx = ltr ? t.x : t.x + MAP.colW,
    mid = (tx - sx) / 2
  return `M ${sx} ${sy} C ${sx + mid} ${sy}, ${tx - mid} ${ty}, ${tx} ${ty}`
}
