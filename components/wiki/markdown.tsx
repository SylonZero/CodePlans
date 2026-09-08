import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { remarkWikiAnchors, resolveWikiLink } from '@/lib/wiki/markdown'
export function WikiMarkdown({
  body,
  sourceUrl,
  slug,
  imported,
}: {
  body: string
  sourceUrl?: string | null
  slug: string
  imported: Record<string, string>
}) {
  return (
    <div className="markdown-body wiki-prose">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkWikiAnchors]}
        components={{
          a: ({ node: _node, href, children, ...props }) => {
            const target = href
              ? resolveWikiLink(href, sourceUrl, slug, imported)
              : undefined
            return target ? (
              <a
                {...props}
                href={target}
                rel={target.startsWith('http') ? 'noreferrer' : undefined}
              >
                {children}
              </a>
            ) : (
              <span title="Source link could not be resolved">{children}</span>
            )
          },
          img: ({ node: _node, src, ...props }) => {
            const target =
              typeof src === 'string' && sourceUrl
                ? resolveWikiLink(src, sourceUrl, slug, {})
                : src
            return typeof target === 'string' && /^https?:/.test(target) ? (
              <img
                {...props}
                src={target}
                loading="lazy"
                referrerPolicy="no-referrer"
              />
            ) : null
          },
          table: ({ node: _node, ...props }) => (
            <div
              className="markdown-table-scroll"
              role="region"
              aria-label="Markdown table"
              tabIndex={0}
            >
              <table {...props} />
            </div>
          ),
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  )
}
