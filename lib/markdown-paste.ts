// Deciding whether pasted plain text is markdown that should be parsed into
// formatting (headings, lists, tables…) rather than inserted literally.

const BLOCK_SIGNALS = [
  /^#{1,6}\s+\S/m, // heading
  /^```|^~~~/m, // fenced code
  /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m, // table separator row
  /^>\s?\S/m, // blockquote
  /^\s*[-*+]\s+\[[ xX]\]\s/m, // task list
]
const LIST = /^\s*([-*+]|\d{1,9}[.)])\s+\S/gm
// Unambiguous inline markdown: one is enough.
const STRONG_INLINE = [
  /\*\*[^*\n]+\*\*/, // bold
  /`[^`\n]+`/, // inline code
  /\[[^\]\n]+\]\([^)\s]+\)/, // link
]
// Could be ordinary prose (2*3*4, ~approx~): need corroboration.
const WEAK_INLINE = [
  /(^|[^\w*])\*[^*\s][^*\n]*\*(?!\w)/, // italic
  /~~[^~\n]+~~/, // strikethrough
]

/** True when plain text carries enough markdown structure to be worth parsing. */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.trim()) return false
  if (BLOCK_SIGNALS.some((r) => r.test(text))) return true
  const listLines = text.match(LIST)?.length ?? 0
  if (listLines >= 2) return true
  if (STRONG_INLINE.some((r) => r.test(text))) return true
  const weak = WEAK_INLINE.filter((r) => r.test(text)).length
  return weak >= 2 || (weak >= 1 && listLines >= 1)
}

/**
 * HTML on the clipboard that already carries structure (a web page, a doc
 * editor). The editor's own paste handling keeps it. Code editors put styled
 * spans on the clipboard too, but no semantic tags, so their markdown source
 * is parsed instead.
 */
export function isRichHtml(html: string | null | undefined): boolean {
  if (!html) return false
  return /<(h[1-6]|ul|ol|li|table|blockquote|strong|em|b|i|a\s[^>]*href|pre|code|p)[\s>]/i.test(html)
}

export function shouldParsePastedMarkdown(text: string, html: string | null | undefined): boolean {
  return looksLikeMarkdown(text) && !isRichHtml(html)
}
