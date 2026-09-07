import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { MarkdownContent } from '@/components/markdown-content'

describe('MarkdownContent', () => {
  it('preserves paragraphs and authored line breaks and renders safe GFM in narrow panels', () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { children: '# Heading\n\nFirst line\nSecond line\n\nNext paragraph with **bold**, ~~deleted~~ and `code`.\n\n| Column | Value |\n| --- | ---: |\n| Quota | 100 |\n\n- [x] Shipped\n- [ ] Pending\n\n<script>alert(1)</script>' }))
    expect(html).toContain('<h1>Heading</h1>')
    expect(html).toMatch(/First line<br\s*\/>\nSecond line/)
    expect(html).toContain('<p>Next paragraph')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<del>deleted</del>')
    expect(html).toContain('markdown-table-scroll')
    expect(html).toContain('<table>')
    expect(html).toContain('<th style="text-align:right">Value</th>')
    expect(html).toContain('type="checkbox"')
    expect(html).not.toContain('<script>')
  })
  it('keeps code block whitespace and disables unsafe links', () => {
    const html = renderToStaticMarkup(createElement(MarkdownContent, { children: '```ts\nconst x = 1\n\n  x + 1\n```\n\n[bad](javascript:alert%281%29)' }))
    expect(html).toContain('const x = 1\n\n  x + 1')
    expect(html).not.toContain('href="javascript:')
  })
})
