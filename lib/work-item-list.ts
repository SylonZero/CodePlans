// Severity/tag filters and column sorting for the work items list. Pure, so the
// client page and tests share one implementation. The view state round-trips
// through the URL (?severity=high,critical&tags=mcp&sort=severity&dir=desc) so
// a filtered list can be bookmarked or shared.
import type { WorkItemSeverity } from '@/lib/types'

export const SEVERITIES: WorkItemSeverity[] = ['critical', 'high', 'medium', 'low']
const SEVERITY_RANK: Record<WorkItemSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 }

export type SortField = 'severity' | 'created' | 'updated'
export type SortDir = 'asc' | 'desc'
export const PAGE_SIZES = [25, 50, 100] as const

export type ListView = {
  severities: WorkItemSeverity[]
  tags: string[]
  sort: SortField | null
  dir: SortDir
}

type Sortable = { severity: WorkItemSeverity; tags: string[]; createdAt: string; updatedAt: string }

const list = (v: string | null) => (v ? v.split(',').map((s) => s.trim()).filter(Boolean) : [])

export function parseListView(params: URLSearchParams): ListView {
  const severities = list(params.get('severity')).filter((s): s is WorkItemSeverity => (SEVERITIES as string[]).includes(s))
  const sort = params.get('sort')
  return {
    severities,
    tags: [...new Set(list(params.get('tags')))],
    sort: sort === 'severity' || sort === 'created' || sort === 'updated' ? sort : null,
    dir: params.get('dir') === 'asc' ? 'asc' : 'desc',
  }
}

/** Writes the view into `params` (keeping unrelated keys such as ?item=). */
export function writeListView(params: URLSearchParams, view: ListView): URLSearchParams {
  const next = new URLSearchParams(params)
  const set = (k: string, v: string | null) => (v ? next.set(k, v) : next.delete(k))
  set('severity', view.severities.length ? SEVERITIES.filter((s) => view.severities.includes(s)).join(',') : null)
  set('tags', view.tags.length ? view.tags.join(',') : null)
  set('sort', view.sort)
  set('dir', view.sort && view.dir === 'asc' ? 'asc' : null)
  return next
}

/** Severity is any-of; tags match items carrying any of the selected tags. */
export function matchesListView<T extends Sortable>(item: T, view: ListView): boolean {
  if (view.severities.length && !view.severities.includes(item.severity)) return false
  if (view.tags.length && !view.tags.some((t) => item.tags.includes(t))) return false
  return true
}

/** Stable sort; with no sort field the incoming order (most recently updated first) is kept. */
export function sortItems<T extends Sortable>(items: T[], view: Pick<ListView, 'sort' | 'dir'>): T[] {
  if (!view.sort) return items
  const sign = view.dir === 'asc' ? 1 : -1
  const key = (i: T): number =>
    view.sort === 'severity' ? SEVERITY_RANK[i.severity]
      : Date.parse(view.sort === 'created' ? i.createdAt : i.updatedAt) || 0
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => (key(a.item) - key(b.item)) * sign || a.index - b.index)
    .map((x) => x.item)
}

/** Header click: first click sorts descending (critical / newest first), the second ascending, the third clears. */
export function nextSort(view: Pick<ListView, 'sort' | 'dir'>, field: SortField): Pick<ListView, 'sort' | 'dir'> {
  if (view.sort !== field) return { sort: field, dir: 'desc' }
  if (view.dir === 'desc') return { sort: field, dir: 'asc' }
  return { sort: null, dir: 'desc' }
}

/** Every tag in use, with how many items carry it, most used first. */
export function tagCounts(items: { tags: string[] }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const i of items) for (const t of i.tags) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}

export function normalizePageSize(v: unknown): (typeof PAGE_SIZES)[number] {
  const n = Number(v)
  return (PAGE_SIZES as readonly number[]).includes(n) ? (n as (typeof PAGE_SIZES)[number]) : 25
}
