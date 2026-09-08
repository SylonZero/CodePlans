import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { wikiOutline, resolveWikiLink, sourceKey } from '@/lib/wiki/markdown'
import { WikiMarkdown } from '@/components/wiki/markdown'
import { searchWiki, type WikiDocument } from '@/lib/wiki/model'
const doc = (patch: Partial<WikiDocument>): WikiDocument => ({
  key: 'spec:a',
  id: 'a',
  kind: 'spec',
  title: 'Upload pipeline',
  body: '## Configuration\n\nSet MAX_FILE_SIZE_BYTES = 25.',
  status: 'draft',
  tags: ['apps/uploader'],
  createdAt: '2026-09-01T12:00:00Z',
  updatedAt: '2026-09-02T12:00:00Z',
  createdBy: null,
  updatedBy: null,
  associations: [{ assetId: 'a', label: 'Direct' }],
  related: [],
  editUrl: '/specs/a',
  ...patch,
})
describe('wiki reading and search', () => {
  it('uses parsed headings including setext and duplicates, excluding fenced-code headings', () => {
    const body =
      '# Hello **world**\n\nHello world\n-----------\n\n```sh\n# Not a heading\n```\n\n## Café'
    const outline = wikiOutline(body)
    expect(outline.map((h) => h.id)).toEqual([
      'hello-world',
      'hello-world-1',
      'café',
    ])
    const html = renderToStaticMarkup(
      createElement(WikiMarkdown, { body, slug: 'demo', imported: {} }),
    )
    for (const h of outline) expect(html).toContain(`id="${h.id}"`)
  })
  it('resolves repository-relative sources to canonical wiki documents and keeps fragments', () => {
    const source =
      'https://gitlab.com/org/repo/-/blob/feature/slash/docs/plans/task.md'
    const target =
      'https://gitlab.com/org/repo/-/blob/feature/slash/docs/specs/contract.md'
    expect(
      resolveWikiLink('../specs/contract.md#limits', source, 'demo', {
        [sourceKey(target)]: 's',
      }),
    ).toBe('/wiki/demo?doc=spec%3As#limits')
    expect(resolveWikiLink('../other.md', source, 'demo', {})).toBe(
      'https://gitlab.com/org/repo/-/blob/feature/slash/docs/other.md',
    )
    expect(
      resolveWikiLink('javascript:alert(1)', source, 'demo', {}),
    ).toBeUndefined()
  })
  it('renders safe GFM, line breaks, and scrolling tables', () => {
    const html = renderToStaticMarkup(
      createElement(WikiMarkdown, {
        slug: 'demo',
        imported: {},
        body: 'First\nSecond\n\n|Name|Value|\n|---|---|\n|limit|25|\n\n<script>alert(1)</script>',
      }),
    )
    expect(html).toContain('markdown-table-scroll')
    expect(html).toContain('<br/>')
    expect(html).not.toContain('<script>')
  })
  it('ranks title matches over body matches and retains scoped metadata search', () => {
    const docs = [
      doc({}),
      doc({
        id: 'b',
        key: 'spec:b',
        title: 'MAX_FILE_SIZE_BYTES',
        body: 'Limits',
      }),
      doc({
        id: 'c',
        key: 'spec:c',
        body: 'Set MAX_FILE_SIZE_BYTES',
        associations: [],
      }),
    ]
    expect(
      searchWiki(docs, { q: 'MAX_FILE_SIZE_BYTES', asset: 'a' }).map(
        (r) => r.document.id,
      ),
    ).toEqual(['b', 'a'])
    expect(searchWiki(docs, { q: 'apps/uploader' })).toHaveLength(3)
  })
  it('filters review, archive, date, and area without dropping standalone documents', () => {
    const docs = [
      doc({ needsReview: true, area: 'Files' }),
      doc({ id: 'b', key: 'spec:b', status: 'archived', area: 'Files' }),
      doc({
        id: 'c',
        key: 'spec:c',
        associations: [],
        updatedAt: '2026-08-01T00:00:00Z',
      }),
    ]
    expect(searchWiki(docs, { review: true })).toHaveLength(1)
    expect(searchWiki(docs, { archived: true })).toHaveLength(3)
    expect(searchWiki(docs, { status: 'archived' })).toHaveLength(1)
    expect(
      searchWiki(docs, { since: '2026-09-01', area: 'Files' }),
    ).toHaveLength(1)
    expect(searchWiki(docs, {}).some((r) => r.document.id === 'c')).toBe(true)
  })
})
