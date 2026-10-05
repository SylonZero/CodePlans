import { describe, it, expect } from 'vitest'
import { MarkdownManager } from '@tiptap/markdown'
import { flattenExtensions } from '@tiptap/core'
import { editorExtensions, MARKED_OPTIONS } from '@/lib/editor-extensions'
import { escapeMarkdownText, installMarkdownEscaping, tidyMarkdown } from '@/lib/markdown-escape'
import { looksLikeMarkdown, isRichHtml, shouldParsePastedMarkdown } from '@/lib/markdown-paste'

function manager(smart = true) {
  const m = new MarkdownManager({ extensions: flattenExtensions(editorExtensions()), markedOptions: MARKED_OPTIONS })
  if (smart) installMarkdownEscaping(m)
  return m
}
const paragraph = (text: string) => ({ type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
const textOf = (doc: any): string => (doc.content ?? []).map((n: any) => n.text ?? textOf(n)).join('')

describe('markdown escaping', () => {
  const m = manager()

  it('leaves ordinary text alone', () => {
    for (const s of ['test_deepseek41 and snake_case_name', 'AT&T 3 < 4 > 2', 'a * b and 2 * 3', 'C:\\Users\\me', '~5 minutes', 'a [bracket', 'price: $5'])
      expect(m.serialize(paragraph(s)).trim()).toBe(s)
  })

  const tricky = [
    '*not italic*', '_not italic_', '**not bold**', '__init__', '[not](a-link)', '[not a ref]', 'x_', '_x', 'a*b*c',
    '~~not struck~~', '`not code`', '\\*literal\\*', 'ends with \\', '<div>raw</div>', 'a<b', '&amp; stays', '&#169;',
    '# not a heading', '## also not', '- not a list', '+ not a list', '* not a list', '1. not ordered', '2) not ordered',
    '> not a quote', '---', '***', '```not a fence', '   # indented hash', 'x * y * z', '**', '_', '~', '<', '&',
  ]
  it('round-trips text that looks like markdown as literal text', () => {
    for (const s of tricky) {
      const md = m.serialize(paragraph(s))
      expect(textOf(m.parse(md)), `${JSON.stringify(s)} → ${JSON.stringify(md)}`).toBe(s)
    }
  })

  it('round-trips the same text mid-paragraph', () => {
    for (const s of tricky) {
      const doc = { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Lead ' }, { type: 'text', text: 'bold', marks: [{ type: 'bold' }] }, { type: 'text', text: ` ${s}` }] }] }
      expect(textOf(m.parse(m.serialize(doc))), JSON.stringify(s)).toBe(`Lead bold ${s}`)
    }
  })

  it('is much smaller than the stock escaping on real specs', () => {
    const md = '## Tests\n\nRun `test_deepseek41` then test_deepseek41_long and check model_id, kv_cache & 3 < 4.\n\n| flag | default |\n|---|---|\n| --kv_cache | on |\n'
    const stock = manager(false), smart = manager()
    const a = stock.serialize(stock.parse(md)), b = smart.serialize(smart.parse(md))
    expect(b.length).toBeLessThan(a.length)
    expect(b).toContain('test_deepseek41_long and check model_id, kv_cache & 3 < 4')
    expect(smart.serialize(smart.parse(b))).toBe(b) // stable
  })

  it('escapes block markers only at the start of a block', () => {
    expect(escapeMarkdownText('# x', { lineStart: true })).toBe('\\# x')
    expect(escapeMarkdownText('# x')).toBe('# x')
    expect(escapeMarkdownText('10. ten', { lineStart: true })).toBe('10\\. ten')
  })
})

describe('markdown paste detection', () => {
  it('recognises markdown documents and snippets', () => {
    expect(looksLikeMarkdown('# Spec\n\nSome text')).toBe(true)
    expect(looksLikeMarkdown('- one\n- two')).toBe(true)
    expect(looksLikeMarkdown('| a | b |\n|---|---|\n| 1 | 2 |')).toBe(true)
    expect(looksLikeMarkdown('```ts\nconst x = 1\n```')).toBe(true)
    expect(looksLikeMarkdown('Run `pnpm test` first')).toBe(true)
    expect(looksLikeMarkdown('See [the guide](https://x.dev)')).toBe(true)
    expect(looksLikeMarkdown('This is **important**')).toBe(true)
  })

  it('leaves prose alone', () => {
    expect(looksLikeMarkdown('Just a sentence, with test_deepseek41 in it.')).toBe(false)
    expect(looksLikeMarkdown('2*3*4 = 24')).toBe(false)
    expect(looksLikeMarkdown('- just one dash line')).toBe(false)
    expect(looksLikeMarkdown('   ')).toBe(false)
  })

  it('prefers structured HTML from web pages and docs, but not code editors', () => {
    expect(isRichHtml('<meta charset="utf-8"><h2>Title</h2><p>x</p>')).toBe(true)
    expect(isRichHtml('<div style="color:#d4d4d4"><div><span style="color:#569cd6"># Spec</span></div></div>')).toBe(false)
    expect(shouldParsePastedMarkdown('# Spec', '<div><span># Spec</span></div>')).toBe(true)
    expect(shouldParsePastedMarkdown('# Spec', '<h1>Spec</h1>')).toBe(false)
    expect(shouldParsePastedMarkdown('# Spec', null)).toBe(true)
  })
})

describe('tidyMarkdown', () => {
  it('collapses blank-line runs and trailing blanks outside code fences', () => {
    expect(tidyMarkdown('- a\n- b\n\n\n| x |\n| - |\n\n\n\n- [ ] t\n\n')).toBe('- a\n- b\n\n| x |\n| - |\n\n- [ ] t')
  })
  it('keeps blank lines inside fenced code', () => {
    const md = 'intro\n\n```js\na()\n\n\n\nb()\n```\n\n\nafter'
    expect(tidyMarkdown(md)).toBe('intro\n\n```js\na()\n\n\n\nb()\n```\n\nafter')
    expect(tidyMarkdown('~~~~\n```\n\n\n~~~~\n\n\nx')).toBe('~~~~\n```\n\n\n~~~~\n\nx')
  })
  it('round-trips a structured doc to the same tidy source', () => {
    const m = manager()
    const src = '## Channels\n\n- **Push** for urgent alerts\n- Email digest at `09:00`\n\n| Channel | Default |\n| --- | --- |\n| Push | on |\n\n- [ ] Respect OS do-not-disturb'
    const once = tidyMarkdown(m.serialize(m.parse(src)))
    expect(once).not.toMatch(/\n{3,}/)
    expect(tidyMarkdown(m.serialize(m.parse(once)))).toBe(once)
  })
})
