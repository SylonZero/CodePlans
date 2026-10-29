'use client'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Box, Database, Globe, Library, Server } from 'lucide-react'
import { kindLabels, wikiHref, type WikiKind } from '@/lib/wiki/model'
import {
  MAP,
  edgePath,
  layoutMap,
  reachEdge,
  reachFrom,
  type MapGroup,
  type MapLens,
  type MapReach,
  type MapScope,
  type WikiMapData,
  type WikiMapEdge,
  type WikiMapNode,
} from '@/lib/wiki/map'

const typeIcons: Record<string, typeof Box> = {
  app: Box,
  service: Server,
  library: Library,
  datastore: Database,
  platform: Globe,
}
const edgeLabels: Record<WikiMapEdge['type'], string> = {
  depends_on: 'depends on',
  integrates_with: 'integrates with',
  aggregates: 'aggregates',
}
const reachCaptions: Record<MapReach, string> = {
  direct: 'Assets one connection away, in either direction.',
  upstream:
    'Everything this asset relies on, following dependencies all the way down.',
  downstream:
    'Everything that relies on this asset — who to notify before changing it.',
}

function tone(n: WikiMapNode, lens: MapLens) {
  if (lens === 'activity') return n.activePlans > 0 ? 'active' : 'quiet'
  if (lens === 'debt')
    return n.debtScore >= 50 ? 'bad' : n.debtScore >= 25 ? 'warn' : 'ok'
  return n.health === 'critical'
    ? 'bad'
    : n.health === 'warning'
      ? 'warn'
      : n.health === 'healthy'
        ? 'ok'
        : 'quiet'
}
function detail(n: WikiMapNode, lens: MapLens) {
  if (lens === 'activity')
    return n.activePlans
      ? `${n.activePlans} active plan${n.activePlans === 1 ? '' : 's'}`
      : 'No active plans'
  if (lens === 'debt') return `Debt score ${n.debtScore}`
  return n.health
}
const plural = (n: number, word: string) =>
  `${n} ${word}${n === 1 ? '' : 's'}`

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: [T, string][]
  onChange: (v: T) => void
}) {
  return (
    <div className="wiki-map-segment" role="group" aria-label={label}>
      <span>{label}</span>
      {options.map(([v, text]) => (
        <button
          key={v}
          type="button"
          aria-pressed={value === v}
          onClick={() => onChange(v)}
        >
          {text}
        </button>
      ))}
    </div>
  )
}

export function ArchitectureMap({
  map,
  initial,
}: {
  map: WikiMapData
  initial: {
    focus?: string
    reach: MapReach
    scope: MapScope
    group?: MapGroup
    lens: MapLens
  }
}) {
  const router = useRouter()
  const nodeById = useMemo(
    () => new Map(map.nodes.map((n) => [n.id, n])),
    [map.nodes],
  )
  const initialFocus = initial.focus ? nodeById.get(initial.focus) : undefined
  const [focus, setFocus] = useState<string | null>(initialFocus?.id ?? null)
  const [reach, setReach] = useState<MapReach>(initial.reach)
  const [scope, setScope] = useState<MapScope>(
    initialFocus && initialFocus.productId !== map.product.id
      ? 'all'
      : initial.scope,
  )
  const [groupChoice, setGroupChoice] = useState<MapGroup | undefined>(
    initial.group,
  )
  const [lens, setLens] = useState<MapLens>(initial.lens)
  const [query, setQuery] = useState('')
  const [hover, setHover] = useState<string | null>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const nodeRefs = useRef(new Map<string, HTMLButtonElement>())
  const group: MapGroup =
    scope === 'all' ? (groupChoice ?? 'product') : 'layer'

  const visible = useMemo(
    () =>
      scope === 'all'
        ? map.nodes
        : map.nodes.filter((n) => n.productId === map.product.id),
    [map, scope],
  )
  const visibleIds = useMemo(
    () => new Set(visible.map((n) => n.id)),
    [visible],
  )
  const visibleEdges = useMemo(
    () =>
      map.edges.filter(
        (e) => visibleIds.has(e.source) && visibleIds.has(e.target),
      ),
    [map.edges, visibleIds],
  )
  const layout = useMemo(
    () => layoutMap(visible, visibleEdges, group, map.product.id),
    [visible, visibleEdges, group, map.product.id],
  )
  const depth = useMemo(
    () => (focus ? reachFrom(focus, map.edges, reach) : null),
    [focus, map.edges, reach],
  )
  const hoverSet = useMemo(
    () => (!focus && hover ? reachFrom(hover, map.edges, 'direct') : null),
    [focus, hover, map.edges],
  )
  const highlight = depth ?? hoverSet
  const q = query.trim().toLocaleLowerCase()
  const matches = useMemo(
    () =>
      q
        ? visible.filter((n) =>
            `${n.name} ${n.type} ${n.layer} ${n.productName}`
              .toLocaleLowerCase()
              .includes(q),
          )
        : [],
    [visible, q],
  )
  const matchIds = new Set(matches.map((n) => n.id))

  useEffect(() => {
    window.history.replaceState(
      null,
      '',
      wikiHref(map.product.slug, {
        view: 'map',
        focus: focus ?? undefined,
        reach: focus && reach !== 'direct' ? reach : undefined,
        scope: scope === 'all' ? 'all' : undefined,
        group: scope === 'all' ? groupChoice : undefined,
        lens: lens === 'health' ? undefined : lens,
      }),
    )
  }, [map.product.slug, focus, reach, scope, groupChoice, lens])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (document.activeElement === searchRef.current && query) setQuery('')
      else setFocus(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [query])

  useEffect(() => {
    if (focus)
      nodeRefs.current
        .get(focus)
        ?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focus, layout])

  const select = (id: string) => {
    const n = nodeById.get(id)
    if (!n) return
    if (n.productId !== map.product.id) setScope('all')
    setFocus(id)
  }
  const assetHref = (n: WikiMapNode) =>
    wikiHref(n.productSlug, { asset: n.id })
  const selected = focus ? nodeById.get(focus) : undefined
  const outside = (ids: Iterable<string>) =>
    [...ids].filter((id) => !visibleIds.has(id)).length
  const crossProduct = map.edges.filter(
    (e) => visibleIds.has(e.source) !== visibleIds.has(e.target),
  ).length

  const reached = depth
    ? [...depth.entries()]
        .filter(([id, d]) => d > 0 && nodeById.has(id))
        .sort(
          (a, b) =>
            a[1] - b[1] ||
            nodeById.get(a[0])!.name.localeCompare(nodeById.get(b[0])!.name),
        )
    : []
  const connectionRow = (e: WikiMapEdge, otherId: string) => {
    const other = nodeById.get(otherId)
    if (!other) return null
    return (
      <li key={e.id}>
        <button type="button" onClick={() => select(other.id)}>
          {other.name}
        </button>
        <small>
          {edgeLabels[e.type]}
          {other.productId !== selected?.productId
            ? ` · ${other.productName}`
            : ''}
        </small>
        {e.description && <p>{e.description}</p>}
      </li>
    )
  }

  return (
    <div className="wiki-map">
      <div className="wiki-map-toolbar">
        <form
          role="search"
          className="wiki-map-find"
          onSubmit={(e) => {
            e.preventDefault()
            if (matches[0]) select(matches[0].id)
          }}
        >
          <input
            ref={searchRef}
            type="search"
            aria-label="Find an asset on the map"
            placeholder="Find an asset…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {q && (
            <small aria-live="polite">
              {matches.length
                ? `${plural(matches.length, 'match')} · Enter selects`
                : 'No matches'}
            </small>
          )}
        </form>
        <Segmented
          label="Show"
          value={scope}
          options={[
            ['product', map.product.name],
            ['all', 'All products'],
          ]}
          onChange={(v) => {
            setScope(v)
            if (
              v === 'product' &&
              selected &&
              selected.productId !== map.product.id
            )
              setFocus(null)
          }}
        />
        {scope === 'all' && (
          <Segmented
            label="Columns"
            value={group}
            options={[
              ['product', 'Product'],
              ['layer', 'Layer'],
            ]}
            onChange={setGroupChoice}
          />
        )}
        <Segmented
          label="Color"
          value={lens}
          options={[
            ['health', 'Health'],
            ['activity', 'Activity'],
            ['debt', 'Debt'],
          ]}
          onChange={setLens}
        />
      </div>
      <div className="wiki-map-body">
        <div
          className="wiki-map-canvas"
          role="group"
          aria-label="Architecture map"
          onClick={(e) => {
            if (e.target === e.currentTarget) setFocus(null)
          }}
        >
          {visible.length ? (
            <div
              className="wiki-map-stage"
              style={{ width: layout.width, height: layout.height }}
              onClick={(e) => {
                if (e.target === e.currentTarget) setFocus(null)
              }}
            >
              <svg
                width={layout.width}
                height={layout.height}
                aria-hidden
                className="wiki-map-edges"
              >
                <defs>
                  {['idle', 'active'].map((s) => (
                    <marker
                      key={s}
                      id={`wiki-map-arrow-${s}`}
                      viewBox="0 0 8 8"
                      refX="7"
                      refY="4"
                      markerWidth="7"
                      markerHeight="7"
                      orient="auto-start-reverse"
                    >
                      <path d="M 0 0 L 8 4 L 0 8 z" className={s} />
                    </marker>
                  ))}
                </defs>
                {visibleEdges.map((e) => {
                  const s = layout.positions.get(e.source),
                    t = layout.positions.get(e.target)
                  if (!s || !t) return null
                  const on = focus
                    ? reachEdge(e, focus, reach, depth!)
                    : hover
                      ? e.source === hover || e.target === hover
                      : false
                  const state = on ? 'active' : highlight ? 'dim' : 'idle'
                  return (
                    <path
                      key={e.id}
                      d={edgePath(s, t)}
                      data-type={e.type}
                      data-state={state}
                      markerEnd={`url(#wiki-map-arrow-${on ? 'active' : 'idle'})`}
                    >
                      <title>
                        {`${nodeById.get(e.source)?.name} ${edgeLabels[e.type]} ${nodeById.get(e.target)?.name}${e.description ? ` — ${e.description}` : ''}`}
                      </title>
                    </path>
                  )
                })}
              </svg>
              {layout.columns.map((c) => (
                <div
                  key={c.key}
                  className="wiki-map-column"
                  style={{ left: c.x, top: MAP.pad, width: MAP.colW }}
                >
                  {c.label} <small>{c.count}</small>
                </div>
              ))}
              {visible.map((n) => {
                const p = layout.positions.get(n.id)
                if (!p) return null
                const Icon = typeIcons[n.type] ?? Box
                const d = depth?.get(n.id)
                const dim =
                  (highlight && !highlight.has(n.id)) ||
                  (!!q && !matchIds.has(n.id))
                return (
                  <button
                    key={n.id}
                    ref={(el) => {
                      if (el) nodeRefs.current.set(n.id, el)
                      else nodeRefs.current.delete(n.id)
                    }}
                    type="button"
                    className="wiki-map-node"
                    data-tone={tone(n, lens)}
                    data-state={
                      focus === n.id
                        ? 'focus'
                        : dim
                          ? 'dim'
                          : q && matchIds.has(n.id)
                            ? 'match'
                            : undefined
                    }
                    aria-pressed={focus === n.id}
                    aria-label={`${n.name}, ${n.type} in ${n.productName}, ${detail(n, lens)}`}
                    title="Select to trace connections · double-click to open its wiki page"
                    style={{
                      left: p.x,
                      top: p.y,
                      width: MAP.colW,
                      height: MAP.nodeH,
                    }}
                    onClick={() => setFocus(focus === n.id ? null : n.id)}
                    onDoubleClick={() => router.push(assetHref(n))}
                    onMouseEnter={() => setHover(n.id)}
                    onMouseLeave={() => setHover(null)}
                  >
                    <span className="wiki-map-node-title">
                      <Icon aria-hidden size={14} />
                      <strong>{n.name}</strong>
                      {n.version && <code>{n.version}</code>}
                    </span>
                    <span className="wiki-map-node-detail">
                      {group === 'layer' && scope === 'all'
                        ? `${n.productName} · `
                        : ''}
                      {detail(n, lens)}
                    </span>
                    {d !== undefined && d > 0 && reach !== 'direct' && (
                      <span className="wiki-map-depth" aria-hidden>
                        +{d}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          ) : (
            <p className="wiki-empty">
              No assets recorded for this product yet.
            </p>
          )}
        </div>
        <aside className="wiki-map-panel" aria-label="Asset details">
          {selected ? (
            <>
              <p className="wiki-eyebrow">
                {selected.productName} / {selected.layer} / {selected.type}
              </p>
              <h2>{selected.name}</h2>
              <div className="wiki-badges">
                <span className="wiki-state">{selected.health}</span>
                <span>
                  {selected.version
                    ? `Shipped ${selected.version}`
                    : 'No shipped version'}
                </span>
                <span>{plural(selected.activePlans, 'active plan')}</span>
                <span>{plural(selected.openItems, 'open item')}</span>
                <span>{plural(selected.capabilities, 'capability')}</span>
              </div>
              {selected.summary && <p>{selected.summary}</p>}
              <p className="wiki-meta">
                Owners: {selected.owners.join(', ') || 'Not assigned'}
              </p>
              <div className="wiki-map-actions">
                <Link href={assetHref(selected)}>Read asset page →</Link>
                <Link href={`/assets/${selected.id}`}>Open in CodePlans ↗</Link>
                <button type="button" onClick={() => setFocus(null)}>
                  Clear
                </button>
              </div>
              <section>
                <h3>Trace connections</h3>
                <Segmented
                  label="Trace"
                  value={reach}
                  options={[
                    ['direct', 'Direct'],
                    ['upstream', 'Upstream'],
                    ['downstream', 'Downstream'],
                  ]}
                  onChange={setReach}
                />
                <p className="wiki-caption">{reachCaptions[reach]}</p>
                {reach === 'direct' ? (
                  <>
                    <h4>Depends on</h4>
                    <ul className="wiki-map-list">
                      {map.edges
                        .filter((e) => e.source === selected.id)
                        .map((e) => connectionRow(e, e.target))}
                    </ul>
                    <h4>Used by</h4>
                    <ul className="wiki-map-list">
                      {map.edges
                        .filter((e) => e.target === selected.id)
                        .map((e) => connectionRow(e, e.source))}
                    </ul>
                    {!map.edges.some(
                      (e) =>
                        e.source === selected.id || e.target === selected.id,
                    ) && <p className="wiki-meta">No dependencies recorded.</p>}
                  </>
                ) : reached.length ? (
                  <ul className="wiki-map-list">
                    {reached.map(([id, d]) => {
                      const n = nodeById.get(id)!
                      return (
                        <li key={id}>
                          <button type="button" onClick={() => select(id)}>
                            {n.name}
                          </button>
                          <small>
                            {plural(d, 'hop')}
                            {n.productId !== selected.productId
                              ? ` · ${n.productName}`
                              : ''}
                            {n.owners.length ? ` · ${n.owners.join(', ')}` : ''}
                          </small>
                        </li>
                      )
                    })}
                  </ul>
                ) : (
                  <p className="wiki-meta">
                    {reach === 'upstream'
                      ? 'This asset has no recorded dependencies.'
                      : 'Nothing records a dependency on this asset.'}
                  </p>
                )}
                {depth && outside(depth.keys()) > 0 && (
                  <p className="wiki-caption">
                    {plural(outside(depth.keys()), 'connected asset')} in other
                    products.{' '}
                    <button
                      type="button"
                      className="wiki-map-link"
                      onClick={() => setScope('all')}
                    >
                      Show all products
                    </button>
                  </p>
                )}
              </section>
              <section>
                <h3>Related knowledge</h3>
                {selected.productId === map.product.id ? (
                  <>
                    {selected.documents.length ? (
                      <ul className="wiki-map-list">
                        {selected.documents.map((d) => (
                          <li key={d.key}>
                            <Link
                              href={wikiHref(map.product.slug, { doc: d.key })}
                            >
                              {d.title}
                            </Link>
                            <small>
                              {kindLabels[d.kind]} ·{' '}
                              {d.status.replaceAll('_', ' ')}
                            </small>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="wiki-meta">
                        No current specs, plans, issues, or decisions are
                        associated yet.
                      </p>
                    )}
                    {Object.keys(selected.documentCounts).length > 0 && (
                      <p className="wiki-meta">
                        {(
                          Object.entries(selected.documentCounts) as [
                            WikiKind,
                            number,
                          ][]
                        )
                          .map(([k, n]) => `${n} ${kindLabels[k].toLowerCase()}`)
                          .join(' · ')}
                      </p>
                    )}
                    <Link
                      href={wikiHref(map.product.slug, {
                        view: 'documents',
                        asset: selected.id,
                      })}
                    >
                      All associated content →
                    </Link>
                  </>
                ) : (
                  <p className="wiki-meta">
                    This asset’s documents live in the{' '}
                    <Link href={assetHref(selected)}>
                      {selected.productName} wiki
                    </Link>
                    .
                  </p>
                )}
              </section>
            </>
          ) : (
            <>
              <p className="wiki-eyebrow">Architecture map</p>
              <h2>
                {plural(visible.length, 'asset')} ·{' '}
                {plural(visibleEdges.length, 'connection')}
              </h2>
              <p>
                Select an asset to trace what it depends on and what depends on
                it, then follow its specs, plans, and decisions. Double-click an
                asset to open its wiki page.
              </p>
              {scope === 'product' && crossProduct > 0 && (
                <p className="wiki-caption">
                  {plural(crossProduct, 'connection')} reach other products.{' '}
                  <button
                    type="button"
                    className="wiki-map-link"
                    onClick={() => setScope('all')}
                  >
                    Show all products
                  </button>
                </p>
              )}
              <h3>Most connected</h3>
              <ul className="wiki-map-list">
                {visible
                  .map((n) => ({
                    n,
                    degree: visibleEdges.filter(
                      (e) => e.source === n.id || e.target === n.id,
                    ).length,
                  }))
                  .filter((x) => x.degree > 0)
                  .sort(
                    (a, b) =>
                      b.degree - a.degree || a.n.name.localeCompare(b.n.name),
                  )
                  .slice(0, 5)
                  .map(({ n, degree }) => (
                    <li key={n.id}>
                      <button type="button" onClick={() => select(n.id)}>
                        {n.name}
                      </button>
                      <small>{plural(degree, 'connection')}</small>
                    </li>
                  ))}
              </ul>
              <h3>Legend</h3>
              <ul className="wiki-map-legend">
                <li data-type="depends_on">depends on</li>
                <li data-type="integrates_with">integrates with</li>
                <li data-type="aggregates">aggregates</li>
              </ul>
              <p className="wiki-caption">
                Drawn from recorded assets and dependencies; arrows point at
                what is depended on. Nothing on the map is stored separately.
              </p>
            </>
          )}
        </aside>
      </div>
    </div>
  )
}
