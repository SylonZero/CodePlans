// Workspace search: products, assets, code plans, tasks, work items, specs and
// releases the user can see, matched by words in their title and text.
//
// Every word must appear (case-insensitive) in the title, the text or the
// external key. Items whose title holds every word rank first, then the most
// recently updated. Plain LIKE on lower(), so it runs the same on SQLite and
// Postgres with no index or migration; a full-text index can replace it later
// behind this module without changing callers.
import { and, desc, eq, inArray, isNull, or, sql, type SQL } from 'drizzle-orm'
import type { AnyColumn } from 'drizzle-orm'
import { db } from './index'
import { products, assets, codePlans, tasks, workItems, specs, releases } from './schema'
import { productAccessWhere } from './queries'

import { SEARCH_TYPES, MIN_QUERY_LENGTH, type SearchOptions, type SearchResponse, type SearchResult, type SearchType } from '@/lib/search-types'

export { SEARCH_TYPES, SEARCH_TYPE_LABELS, MIN_QUERY_LENGTH } from '@/lib/search-types'
export type { SearchOptions, SearchResponse, SearchResult, SearchType } from '@/lib/search-types'

const MAX_TERMS = 8
const MAX_LIMIT = 50

/** Splits a query into lowercase terms; "quoted phrases" stay together. */
export function parseQuery(query: string): string[] {
  const terms: string[] = []
  for (const match of query.toLowerCase().matchAll(/"([^"]+)"|(\S+)/g)) {
    const term = (match[1] ?? match[2]).trim()
    if (term && !terms.includes(term)) terms.push(term)
  }
  return terms.slice(0, MAX_TERMS)
}

function likePattern(term: string) {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
}

function contains(column: AnyColumn | SQL, term: string): SQL {
  return sql`lower(${column}) like ${likePattern(term)} escape '\\'`
}

type Spec = {
  type: SearchType
  title: AnyColumn
  text: AnyColumn[]
  key?: AnyColumn
}

/** Every term appears in the title, one of the text columns, or the key. */
function matchAll(spec: Spec, terms: string[]): SQL {
  const fields = [spec.title, ...spec.text, ...(spec.key ? [spec.key] : [])]
  return and(...terms.map((t) => or(...fields.map((f) => contains(f, t)))!))!
}

/** 0 when the title alone holds every term, else 1: sorts title matches first. */
function titleRank(spec: Spec, terms: string[]): SQL<number> {
  return sql<number>`case when ${and(...terms.map((t) => contains(spec.title, t)))} then 0 else 1 end`
}

const SNIPPET_RADIUS = 70

/** An excerpt of `text` around the first term it contains, markdown stripped. */
export function snippetFor(text: string | null | undefined, terms: string[]): string | null {
  if (!text) return null
  const plain = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|~]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  const lower = plain.toLowerCase()
  const at = terms.map((t) => lower.indexOf(t)).filter((i) => i >= 0).sort((a, b) => a - b)[0]
  if (at === undefined) return null
  const start = Math.max(0, at - SNIPPET_RADIUS)
  const end = Math.min(plain.length, at + SNIPPET_RADIUS * 2)
  return `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${end < plain.length ? '…' : ''}`
}

const iso = (d: unknown) => (d instanceof Date ? d.toISOString() : typeof d === 'string' ? d : null)

type Row = {
  id: string
  title: string
  text: (string | null)[]
  status: string | null
  key: string | null
  productId: string
  updatedAt: unknown
  url: string
  context: string | null
}

type Visible = Map<string, { name: string; slug: string }>

async function searchType(type: SearchType, terms: string[], productIds: string[], visible: Visible, limit: number, offset: number, withCount: boolean) {
  const run = RUNNERS[type]
  const [rows, count] = await Promise.all([
    run.rows(terms, productIds, limit, offset),
    withCount ? run.count(terms, productIds) : Promise.resolve(undefined),
  ])
  const results: SearchResult[] = rows.map((r) => ({
    type,
    id: r.id,
    title: r.title,
    snippet: snippetFor(r.text.find((t) => t && terms.some((term) => t.toLowerCase().includes(term))) ?? null, terms),
    url: r.url,
    productId: r.productId,
    productName: visible.get(r.productId)?.name ?? '',
    status: r.status,
    key: r.key,
    context: r.context,
    updatedAt: iso(r.updatedAt),
  }))
  return { results, count }
}

const countOf = async (q: Promise<{ n: number }[]>) => Number((await q)[0]?.n ?? 0)
const n = sql<number>`count(*)`

const productSpec: Spec = { type: 'product', title: products.name, text: [products.description, products.slug] }
const assetSpec: Spec = { type: 'asset', title: assets.name, text: [assets.description, assets.notes, assets.repoPath] }
const planSpec: Spec = { type: 'plan', title: codePlans.title, text: [codePlans.description], key: codePlans.externalKey }
const taskSpec: Spec = { type: 'task', title: tasks.title, text: [tasks.description], key: tasks.externalKey }
const workItemSpec: Spec = { type: 'work_item', title: workItems.title, text: [workItems.description], key: workItems.externalKey }
const specSpec: Spec = { type: 'spec', title: specs.title, text: [specs.body] }
const releaseSpec: Spec = { type: 'release', title: releases.name, text: [releases.description], key: releases.externalKey }

const RUNNERS: Record<SearchType, {
  rows: (terms: string[], ids: string[], limit: number, offset: number) => Promise<Row[]>
  count: (terms: string[], ids: string[]) => Promise<number>
}> = {
  product: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(products.id, ids), matchAll(productSpec, terms))
      const rows = await db
        .select({ id: products.id, title: products.name, slug: products.slug, description: products.description, updatedAt: products.updatedAt })
        .from(products).where(where)
        .orderBy(titleRank(productSpec, terms), desc(products.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description], status: null, key: null, productId: r.id,
        updatedAt: r.updatedAt, url: `/products/${r.slug}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(products).where(and(inArray(products.id, ids), matchAll(productSpec, terms)))),
  },
  asset: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(assets.productId, ids), isNull(assets.archivedAt), matchAll(assetSpec, terms))
      const rows = await db
        .select({
          id: assets.id, title: assets.name, description: assets.description, notes: assets.notes, repoPath: assets.repoPath,
          status: assets.status, productId: assets.productId, updatedAt: assets.updatedAt,
        })
        .from(assets).where(where)
        .orderBy(titleRank(assetSpec, terms), desc(assets.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description, r.notes, r.repoPath], status: r.status, key: null,
        productId: r.productId, updatedAt: r.updatedAt, url: `/assets/${r.id}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(assets)
      .where(and(inArray(assets.productId, ids), isNull(assets.archivedAt), matchAll(assetSpec, terms)))),
  },
  plan: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(codePlans.productId, ids), matchAll(planSpec, terms))
      const rows = await db
        .select({
          id: codePlans.id, title: codePlans.title, description: codePlans.description, status: codePlans.status,
          key: codePlans.externalKey, productId: codePlans.productId, updatedAt: codePlans.updatedAt,
        })
        .from(codePlans).where(where)
        .orderBy(titleRank(planSpec, terms), desc(codePlans.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description], status: r.status, key: r.key,
        productId: r.productId, updatedAt: r.updatedAt, url: `/plans/${r.id}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(codePlans).where(and(inArray(codePlans.productId, ids), matchAll(planSpec, terms)))),
  },
  task: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(codePlans.productId, ids), matchAll(taskSpec, terms))
      const rows = await db
        .select({
          id: tasks.id, title: tasks.title, description: tasks.description, status: tasks.status, key: tasks.externalKey,
          planId: tasks.codePlanId, planTitle: codePlans.title, productId: codePlans.productId, updatedAt: tasks.updatedAt,
        })
        .from(tasks).innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id)).where(where)
        .orderBy(titleRank(taskSpec, terms), desc(tasks.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description], status: r.status, key: r.key, productId: r.productId,
        updatedAt: r.updatedAt, url: `/plans/${r.planId}?task=${r.id}`, context: r.planTitle,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(tasks).innerJoin(codePlans, eq(tasks.codePlanId, codePlans.id))
      .where(and(inArray(codePlans.productId, ids), matchAll(taskSpec, terms)))),
  },
  work_item: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(workItems.productId, ids), matchAll(workItemSpec, terms))
      const rows = await db
        .select({
          id: workItems.id, title: workItems.title, description: workItems.description, status: workItems.status,
          key: workItems.externalKey, productId: workItems.productId, updatedAt: workItems.updatedAt,
        })
        .from(workItems).where(where)
        .orderBy(titleRank(workItemSpec, terms), desc(workItems.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description], status: r.status, key: r.key,
        productId: r.productId, updatedAt: r.updatedAt, url: `/work-items?item=${r.id}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(workItems).where(and(inArray(workItems.productId, ids), matchAll(workItemSpec, terms)))),
  },
  spec: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(specs.productId, ids), matchAll(specSpec, terms))
      const rows = await db
        .select({ id: specs.id, title: specs.title, body: specs.body, status: specs.status, productId: specs.productId, updatedAt: specs.updatedAt })
        .from(specs).where(where)
        .orderBy(titleRank(specSpec, terms), desc(specs.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.body], status: r.status, key: null,
        productId: r.productId, updatedAt: r.updatedAt, url: `/specs/${r.id}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(specs).where(and(inArray(specs.productId, ids), matchAll(specSpec, terms)))),
  },
  release: {
    async rows(terms, ids, limit, offset) {
      const where = and(inArray(releases.productId, ids), matchAll(releaseSpec, terms))
      const rows = await db
        .select({
          id: releases.id, title: releases.name, description: releases.description, status: releases.status,
          key: releases.externalKey, productId: releases.productId, updatedAt: releases.updatedAt,
        })
        .from(releases).where(where)
        .orderBy(titleRank(releaseSpec, terms), desc(releases.updatedAt)).limit(limit).offset(offset)
      return rows.map((r) => ({
        id: r.id, title: r.title, text: [r.description], status: r.status, key: r.key,
        productId: r.productId, updatedAt: r.updatedAt, url: `/releases/${r.id}`, context: null,
      }))
    },
    count: (terms, ids) => countOf(db.select({ n }).from(releases).where(and(inArray(releases.productId, ids), matchAll(releaseSpec, terms)))),
  },
}

/**
 * Searches everything the user can see (products visible through
 * productAccessWhere; archived products and assets excluded). Results come
 * grouped by type in SEARCH_TYPES order, best matches first within each type.
 */
export async function search(userId: string, query: string, opts: SearchOptions = {}): Promise<SearchResponse> {
  const trimmed = query.trim()
  const terms = parseQuery(trimmed)
  const types = (opts.types?.length ? SEARCH_TYPES.filter((t) => opts.types!.includes(t)) : SEARCH_TYPES)
  const empty = (): SearchResponse => ({
    query: trimmed, terms, results: [],
    ...(opts.withCounts ? { counts: Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0])) as Record<SearchType, number> } : {}),
  })
  if (trimmed.length < MIN_QUERY_LENGTH || terms.length === 0) return empty()

  const accessFilter = await productAccessWhere(userId)
  const filter = opts.productId ? and(accessFilter, eq(products.id, opts.productId)) : accessFilter
  const visibleRows = await db.select({ id: products.id, name: products.name, slug: products.slug }).from(products).where(filter)
  if (visibleRows.length === 0) return empty()
  const visible: Visible = new Map(visibleRows.map((p) => [p.id, { name: p.name, slug: p.slug }]))
  const ids = visibleRows.map((p) => p.id)

  const limit = Math.min(Math.max(1, opts.limit ?? 5), MAX_LIMIT)
  const offset = Math.max(0, opts.offset ?? 0)
  const perType = await Promise.all(types.map((t) => searchType(t, terms, ids, visible, limit, offset, !!opts.withCounts)))

  const response: SearchResponse = { query: trimmed, terms, results: perType.flatMap((p) => p.results) }
  if (opts.withCounts) {
    response.counts = Object.fromEntries(SEARCH_TYPES.map((t) => [t, 0])) as Record<SearchType, number>
    types.forEach((t, i) => { response.counts![t] = perType[i].count ?? 0 })
  }
  return response
}
