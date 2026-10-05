// Escaping for plain text written into markdown by the rich text editor.
//
// @tiptap/markdown backslash-escapes every `_ * [ ] ~ \` and backtick, and
// turns & < > into entities, in all text. Markdown pasted into a spec doubled
// in size that way (`test\_deepseek41`). This escapes only what would
// otherwise change how the text renders, and is checked against the same
// parser (marked) in tests/lib/markdown-escape.test.ts.

const ASCII_PUNCT = /[!-/:-@[-`{-~]/
const WORD = /[\p{L}\p{N}]/u

/**
 * Escape plain text for markdown. `lineStart` says the text begins a block
 * (the first text in a paragraph or heading), where `#`, `>`, list markers
 * and similar would start a block of their own.
 */
export function escapeMarkdownText(text: string, opts: { lineStart?: boolean } = {}): string {
  const hasBrackets = text.includes('[') && text.includes(']')
  const tildes = (text.match(/~/g) ?? []).length
  let out = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    const prev = i > 0 ? text[i - 1] : ''
    const next = i + 1 < text.length ? text[i + 1] : ''
    switch (ch) {
      case '\\':
        // A backslash only escapes ASCII punctuation; elsewhere it's literal.
        out += !next || ASCII_PUNCT.test(next) ? '\\\\' : '\\'
        break
      case '`':
        out += '\\`'
        break
      case '*':
        // Only a run flanked by whitespace on both sides can't open or close emphasis.
        out += /\s/.test(prev || ' ') && /\s/.test(next || ' ') && prev !== '' && next !== '' ? '*' : '\\*'
        break
      case '_':
        // Intraword underscores never form emphasis (snake_case stays as is).
        out += prev && next && WORD.test(prev) && WORD.test(next) ? '_' : '\\_'
        break
      case '~':
        out += tildes > 1 ? '\\~' : '~'
        break
      case '[':
      case ']':
        out += hasBrackets ? `\\${ch}` : ch
        break
      case '&':
        // Only something that reads as an entity reference needs encoding.
        out += /^&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i.test(text.slice(i)) ? '&amp;' : '&'
        break
      case '<':
        // Could open an HTML tag, comment or autolink.
        out += /[a-z/!?]/i.test(next) ? '&lt;' : '<'
        break
      default:
        out += ch
    }
  }
  return opts.lineStart ? escapeLineStart(out) : out
}

/** Characters that would turn the start of a block into a heading, quote, list, rule or fence. */
function escapeLineStart(s: string): string {
  const m = s.match(/^( {0,3})/)
  const lead = m ? m[1] : ''
  const rest = s.slice(lead.length)
  if (/^#{1,6}(\s|$)/.test(rest)) return `${lead}\\${rest}`
  if (/^>/.test(rest)) return `${lead}\\${rest}`
  if (/^[-+](\s|$)/.test(rest)) return `${lead}\\${rest}`
  if (/^(\\\*|\*)(\s|$)/.test(rest)) return rest.startsWith('\\') ? s : `${lead}\\${rest}`
  if (/^\d{1,9}[.)](\s|$)/.test(rest)) return `${lead}${rest.replace(/^(\d{1,9})([.)])/, '$1\\$2')}`
  if (/^(=+|-{3,}|_{3,}|\*{3,})\s*$/.test(rest)) return `${lead}\\${rest}`
  if (/^(`{3,}|~{3,})/.test(rest)) return rest.startsWith('\\') ? s : `${lead}\\${rest}`
  return s
}

type MdNode = { type?: string; marks?: (string | { type: string })[]; content?: MdNode[] }

/**
 * Swap the editor's text escaping for escapeMarkdownText. Relies on
 * MarkdownManager's (private) encodeTextForMarkdown hook; if a tiptap upgrade
 * renames it, this becomes a no-op and the stock escaping applies.
 */
export function installMarkdownEscaping(manager: unknown) {
  const m = manager as { encodeTextForMarkdown?: unknown; codeTypes?: Set<string> } | undefined
  if (!m || typeof m.encodeTextForMarkdown !== 'function') return
  const codeTypes = m.codeTypes instanceof Set ? m.codeTypes : new Set(['code', 'codeBlock'])
  m.encodeTextForMarkdown = (text: string, node: MdNode, parent?: MdNode) => {
    const inCode = (parent?.type && codeTypes.has(parent.type))
      || (node.marks ?? []).some((mk) => codeTypes.has(typeof mk === 'string' ? mk : mk.type))
    if (inCode) return text
    const lineStart = !!parent && ['paragraph', 'heading'].includes(parent.type ?? '') && parent.content?.[0] === node
    return escapeMarkdownText(text, { lineStart })
  }
}

/**
 * Tidies serializer output: runs of blank lines collapse to one (outside fenced
 * code, where they are content) and trailing blank lines go.
 */
export function tidyMarkdown(md: string): string {
  const out: string[] = []
  let fence: string | null = null
  let blank = false
  for (const line of md.split('\n')) {
    const marker = /^\s{0,3}(`{3,}|~{3,})/.exec(line)?.[1]
    if (fence) {
      out.push(line)
      if (marker && marker[0] === fence[0] && marker.length >= fence.length && line.trim() === marker) fence = null
      continue
    }
    if (marker) fence = marker
    const isBlank = line.trim() === ''
    if (isBlank && blank) continue
    blank = isBlank
    out.push(isBlank ? '' : line)
  }
  while (out.length && out[out.length - 1] === '') out.pop()
  return out.join('\n')
}
