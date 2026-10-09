import { describe, it, expect } from 'vitest'
import { parseListView, writeListView, matchesListView, sortItems, nextSort, tagCounts, normalizePageSize, type ListView } from '@/lib/work-item-list'

const item = (id: string, severity: 'low' | 'medium' | 'high' | 'critical', tags: string[], createdAt: string, updatedAt = createdAt) =>
  ({ id, severity, tags, createdAt, updatedAt })

const items = [
  item('a', 'medium', ['mcp'], '2026-10-01T00:00:00Z', '2026-10-09T00:00:00Z'),
  item('b', 'critical', ['gh-1025', 'cuda'], '2026-09-01T00:00:00Z', '2026-10-08T00:00:00Z'),
  item('c', 'low', [], '2026-10-05T00:00:00Z', '2026-10-07T00:00:00Z'),
  item('d', 'critical', ['cuda'], '2026-10-03T00:00:00Z', '2026-10-06T00:00:00Z'),
]
const view = (v: Partial<ListView>): ListView => ({ severities: [], tags: [], sort: null, dir: 'desc', ...v })

describe('work item list view', () => {
  it('parses the URL, ignoring unknown values and duplicates', () => {
    const v = parseListView(new URLSearchParams('severity=high,bogus,critical&tags=cuda,mcp,cuda&sort=severity&dir=asc'))
    expect(v).toEqual({ severities: ['high', 'critical'], tags: ['cuda', 'mcp'], sort: 'severity', dir: 'asc' })
    expect(parseListView(new URLSearchParams('sort=title'))).toEqual(view({}))
  })

  it('writes the view back, keeping other params and dropping defaults', () => {
    const out = writeListView(new URLSearchParams('item=abc&tags=old'), view({ severities: ['low', 'critical'], sort: 'created', dir: 'desc' }))
    expect(out.get('item')).toBe('abc')
    expect(out.get('severity')).toBe('critical,low')
    expect(out.has('tags')).toBe(false)
    expect(out.get('sort')).toBe('created')
    expect(out.has('dir')).toBe(false)
    expect(parseListView(out)).toEqual(view({ severities: ['critical', 'low'], sort: 'created' }))
  })

  it('filters by any selected severity and any selected tag', () => {
    expect(items.filter((i) => matchesListView(i, view({ severities: ['critical'] }))).map((i) => i.id)).toEqual(['b', 'd'])
    expect(items.filter((i) => matchesListView(i, view({ tags: ['mcp', 'gh-1025'] }))).map((i) => i.id)).toEqual(['a', 'b'])
    expect(items.filter((i) => matchesListView(i, view({ severities: ['critical'], tags: ['gh-1025'] }))).map((i) => i.id)).toEqual(['b'])
  })

  it('sorts by severity, created and updated, stably, and keeps order when unsorted', () => {
    expect(sortItems(items, { sort: 'severity', dir: 'desc' }).map((i) => i.id)).toEqual(['b', 'd', 'a', 'c'])
    expect(sortItems(items, { sort: 'severity', dir: 'asc' }).map((i) => i.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(sortItems(items, { sort: 'created', dir: 'desc' }).map((i) => i.id)).toEqual(['c', 'd', 'a', 'b'])
    expect(sortItems(items, { sort: 'updated', dir: 'asc' }).map((i) => i.id)).toEqual(['d', 'c', 'b', 'a'])
    expect(sortItems(items, { sort: null, dir: 'desc' })).toBe(items)
  })

  it('cycles a header through descending, ascending and off', () => {
    let s = nextSort({ sort: null, dir: 'desc' }, 'severity')
    expect(s).toEqual({ sort: 'severity', dir: 'desc' })
    s = nextSort(s, 'severity'); expect(s).toEqual({ sort: 'severity', dir: 'asc' })
    s = nextSort(s, 'severity'); expect(s).toEqual({ sort: null, dir: 'desc' })
    expect(nextSort({ sort: 'severity', dir: 'asc' }, 'created')).toEqual({ sort: 'created', dir: 'desc' })
  })

  it('counts tags most-used first and validates page sizes', () => {
    expect(tagCounts(items)).toEqual([{ tag: 'cuda', count: 2 }, { tag: 'gh-1025', count: 1 }, { tag: 'mcp', count: 1 }])
    expect(normalizePageSize('50')).toBe(50)
    expect(normalizePageSize(37)).toBe(25)
    expect(normalizePageSize(null)).toBe(25)
  })
})
