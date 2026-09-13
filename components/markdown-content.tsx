import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import { cn } from '@/lib/utils'
import { markdownPreWithMermaid } from '@/components/mermaid-diagram'

/** One safe GFM renderer for full pages and narrow panels; raw HTML stays disabled. */
export function MarkdownContent({ children, className }: { children: string; className?: string }) {
  return <div className={cn('markdown-body min-w-0', className)}>
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={{
      table: ({ node: _node, ...props }) => <div className="markdown-table-scroll" role="region" aria-label="Markdown table" tabIndex={0}><table {...props} /></div>,
      pre: markdownPreWithMermaid,
    }}>{children}</ReactMarkdown>
  </div>
}
