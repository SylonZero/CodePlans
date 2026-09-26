import { describe, it, expect } from 'vitest'
import { diffLines, diffStats } from '@/lib/text-diff'

describe('diffLines', () => {
  it('marks unchanged, added and removed lines in order', () => {
    const lines = diffLines('a\nb\nc', 'a\nc\nd')
    expect(lines).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'same', text: 'c' },
      { kind: 'add', text: 'd' },
    ])
    expect(diffStats(lines)).toEqual({ added: 1, removed: 1 })
  })

  it('reports no changes for identical text', () => {
    expect(diffStats(diffLines('x\ny', 'x\ny'))).toEqual({ added: 0, removed: 0 })
  })

  it('handles empty inputs', () => {
    expect(diffLines('', 'new')).toEqual([{ kind: 'del', text: '' }, { kind: 'add', text: 'new' }])
  })
})
