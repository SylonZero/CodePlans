// Highlights "@Name" mentions inside rendered markdown, skipping code and links.
// Only names of people actually mentioned on the comment are matched.
type HastNode = {
  type: string
  tagName?: string
  value?: string
  properties?: Record<string, unknown>
  children?: HastNode[]
}

const SKIP = new Set(['code', 'pre', 'a'])

export function rehypeMentions(names: string[]) {
  const sorted = [...new Set(names.filter(Boolean))].sort((a, b) => b.length - a.length)
  const pattern = sorted.length
    ? new RegExp(`(@(?:${sorted.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}))`, 'g')
    : null
  return () => (tree: HastNode) => {
    if (!pattern) return
    const walk = (node: HastNode) => {
      if (!node.children || (node.tagName && SKIP.has(node.tagName))) return
      node.children = node.children.flatMap((child): HastNode[] => {
        if (child.type !== 'text' || !child.value) { walk(child); return [child] }
        const parts = child.value.split(pattern)
        if (parts.length === 1) return [child]
        return parts.filter(Boolean).map((p) => sorted.some((n) => `@${n}` === p)
          ? { type: 'element', tagName: 'span', properties: { className: ['mention'] }, children: [{ type: 'text', value: p }] }
          : { type: 'text', value: p })
      })
    }
    walk(tree)
  }
}
