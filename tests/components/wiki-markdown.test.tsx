import { describe, it, expect } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { WikiMarkdown } from '@/components/wiki/markdown'

describe('WikiMarkdown', () => {
  it('renders mermaid fences through the diagram widget, same as spec markdown', () => {
    const html = renderToStaticMarkup(
      createElement(WikiMarkdown, {
        body: '```mermaid\nsequenceDiagram\n  A->>B: hi\n```',
        sourceUrl: null,
        slug: 'home',
        imported: {},
      }),
    )
    expect(html).toContain('Diagram')
    expect(html).toContain('sequenceDiagram')
    expect(html).not.toContain('language-mermaid')
  })
})
