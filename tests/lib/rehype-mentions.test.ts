import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MarkdownContent } from '@/components/markdown-content'

const html = (body: string, mentions?: string[]) =>
  renderToStaticMarkup(createElement(MarkdownContent, { compact: true, mentions, children: body }))

describe('comment markdown', () => {
  it('renders agent-style markdown as structure', () => {
    const out = html('## Suggested additions\n\n4. **Main workspace** maps to `mainWorkspaceId`.\n\n- Logout message is visible **after** the redirect\n- Guard runs *before* restore')
    expect(out).toContain('<h2>Suggested additions</h2>')
    expect(out).toContain('<ol start="4">')
    expect(out).toContain('<strong>Main workspace</strong>')
    expect(out).toContain('<code>mainWorkspaceId</code>')
    expect(out).toContain('<em>before</em>')
    expect(out).toContain('markdown-compact')
  })
  it('keeps single line breaks and never renders raw HTML', () => {
    const out = html('line one\nline two\n\n<img src=x onerror=alert(1)>')
    expect(out).toContain('line one<br/>')
    expect(out).not.toContain('<img')
  })
  it('highlights mentions outside code and links only', () => {
    const out = html('Thanks @Alex Chen, see `@Alex Chen` and [@Alex Chen](https://x.test). @Sam stays plain.', ['Alex Chen'])
    expect(out.match(/<span class="mention">@Alex Chen<\/span>/g)).toHaveLength(1)
    expect(out).toContain('<code>@Alex Chen</code>')
    expect(out).toContain('>@Alex Chen</a>')
    expect(out).toContain('@Sam stays plain')
  })
  it('prefers the longest matching name', () => {
    const out = html('cc @Alex Chen', ['Alex', 'Alex Chen'])
    expect(out).toContain('<span class="mention">@Alex Chen</span>')
  })
})
