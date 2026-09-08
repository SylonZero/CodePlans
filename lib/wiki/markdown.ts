import { unified } from 'unified'
import remarkParse from 'remark-parse'
import remarkGfm from 'remark-gfm'
import GithubSlugger from 'github-slugger'
import { wikiHref } from './model'

type Node = {
  type: string
  value?: string
  depth?: number
  children?: Node[]
  data?: { hProperties?: Record<string, unknown> }
}
export type WikiHeading = { id: string; text: string; depth: number }
function textOf(n: Node): string {
  return n.value ?? n.children?.map(textOf).join('') ?? ''
}
function headings(tree: Node, apply = false) {
  const slugger = new GithubSlugger(),
    result: WikiHeading[] = []
  function walk(n: Node) {
    if (n.type === 'heading') {
      const text = textOf(n),
        id = slugger.slug(text)
      result.push({ id, text, depth: n.depth ?? 1 })
      if (apply)
        n.data = { ...n.data, hProperties: { ...n.data?.hProperties, id } }
    }
    n.children?.forEach(walk)
  }
  walk(tree)
  return result
}
export function wikiOutline(markdown: string) {
  return headings(
    unified().use(remarkParse).use(remarkGfm).parse(markdown) as Node,
  )
}
export function remarkWikiAnchors() {
  return (tree: Node) => {
    headings(tree, true)
  }
}
export function sourceKey(url: string) {
  try {
    const u = new URL(url)
    u.hash = ''
    return u.href.replace(/\/$/, '')
  } catch {
    return url
  }
}
/** Preserve repository-relative navigation, preferring a canonical imported page when known. */
export function resolveWikiLink(
  href: string,
  sourceUrl: string | undefined | null,
  slug: string,
  imported: Record<string, string>,
) {
  if (href.startsWith('#')) return href
  let resolved: URL
  try {
    resolved = sourceUrl ? new URL(href, sourceUrl) : new URL(href)
  } catch {
    return undefined
  }
  if (!['http:', 'https:', 'mailto:'].includes(resolved.protocol))
    return undefined
  const specId = imported[sourceKey(resolved.href)]
  return specId
    ? wikiHref(slug, { doc: `spec:${specId}` }) + resolved.hash
    : resolved.href
}
