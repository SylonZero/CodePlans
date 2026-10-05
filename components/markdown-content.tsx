import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/lib/utils'
import { markdownPreWithMermaid } from '@/components/mermaid-diagram'
import { rehypeMentions } from '@/lib/rehype-mentions'

/** One safe GFM renderer for full pages and narrow panels; raw HTML stays disabled. */
export function MarkdownContent({ children, className, compact = false, mentions }: {
  children: string
  className?: string
  /** Comment-sized typography: smaller headings, tighter spacing. */
  compact?: boolean
  /** Names to highlight as "@Name" mentions. */
  mentions?: string[]
}) {
  return <div className={cn('markdown-body min-w-0', compact && 'markdown-compact', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} rehypePlugins={mentions?.length ? [rehypeMentions(mentions)] : []} components={{
      table: ({ node: _node, ...props }) => <div className="markdown-table-scroll" role="region" aria-label="Markdown table" tabIndex={0}><table {...props} /></div>,
      pre: markdownPreWithMermaid,
    }}>{children}</ReactMarkdown>
  </div>
}
