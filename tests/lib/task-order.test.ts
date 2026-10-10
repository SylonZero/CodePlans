import { describe, it, expect } from 'vitest'
import { sortTasks } from '@/lib/task-order'

const t = (title: string, createdAt = '2026-10-01T00:00:00Z') => ({ title, createdAt })

describe('plan task order', () => {
  it('sorts numbered titles naturally, ignoring case and leading spaces', () => {
    const titles = ['T10 Docs', 'T2 Domain', 't1 Schema', 'T3 MCP', ' T11 Release']
    expect(sortTasks(titles.map((x) => t(x))).map((x) => x.title)).toEqual(['t1 Schema', 'T2 Domain', 'T3 MCP', 'T10 Docs', ' T11 Release'])
  })
  it('orders phases and unnumbered titles alphabetically', () => {
    expect(sortTasks([t('Phase 10: ship'), t('Phase 9: test'), t('Add tests'), t('Phase 1: plan')]).map((x) => x.title))
      .toEqual(['Add tests', 'Phase 1: plan', 'Phase 9: test', 'Phase 10: ship'])
  })
  it('breaks ties by creation time and leaves the input untouched', () => {
    const input = [t('Same', '2026-10-02T00:00:00Z'), t('Same', '2026-10-01T00:00:00Z')]
    const out = sortTasks(input)
    expect(out.map((x) => x.createdAt)).toEqual(['2026-10-01T00:00:00Z', '2026-10-02T00:00:00Z'])
    expect(input[0].createdAt).toBe('2026-10-02T00:00:00Z')
  })
})
