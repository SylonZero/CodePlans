'use client'

import { isValidElement, useEffect, useId, useState, type ReactNode } from 'react'
import { Code2, GitBranch, Maximize2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

/** Renders Mermaid source to sanitized SVG on the client, with a toggle back to the raw source for copying/editing. */
export function MermaidDiagram({ source }: { source: string }) {
  const rawId = useId().replace(/[^a-zA-Z0-9]/g, '')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    let cancelled = false
    setSvg(null)
    setError(null)
    import('mermaid').then(async ({ default: mermaid }) => {
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: 'neutral' })
      try {
        const result = await mermaid.render(`mermaid-${rawId}`, source)
        if (!cancelled) setSvg(result.svg)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Invalid diagram syntax')
      }
    })
    return () => {
      cancelled = true
    }
  }, [rawId, source])

  const failed = error !== null
  const displaySource = showSource || failed || svg === null
  const canExpand = svg !== null && !failed && !showSource

  return (
    <div className="not-prose my-4 overflow-hidden rounded-lg border bg-card">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <span className="text-xs font-medium text-muted-foreground">Diagram</span>
        <div className="flex items-center gap-1">
          {canExpand && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setExpanded(true)}
              title="View fullscreen"
            >
              <Maximize2 className="h-3 w-3" />
              Expand
            </Button>
          )}
          {!failed && svg !== null && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={() => setShowSource((s) => !s)}
            >
              {showSource ? <GitBranch className="h-3 w-3" /> : <Code2 className="h-3 w-3" />}
              {showSource ? 'View diagram' : 'View source'}
            </Button>
          )}
        </div>
      </div>
      <div className="p-3">
        {failed && (
          <p className="mb-2 text-xs text-destructive">Couldn&apos;t render diagram: {error}</p>
        )}
        {displaySource ? (
          <pre className="overflow-x-auto text-xs"><code>{source}</code></pre>
        ) : (
          <div className="overflow-x-auto [&_svg]:mx-auto" dangerouslySetInnerHTML={{ __html: svg }} />
        )}
      </div>
      {canExpand && (
        <Dialog open={expanded} onOpenChange={setExpanded}>
          <DialogContent className="flex max-h-[92vh] w-full max-w-[96vw] flex-col overflow-hidden sm:max-w-[96vw]">
            <DialogTitle className="sr-only">Diagram, fullscreen</DialogTitle>
            <div
              className="min-h-0 flex-1 overflow-auto [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

/** Extracts fenced-code text from a `pre > code` react-markdown element tree. */
function codeText(children: ReactNode): string {
  if (Array.isArray(children)) return children.map(codeText).join('')
  if (typeof children === 'string') return children
  return ''
}

/**
 * react-markdown `pre` override: swaps ```mermaid fences for a rendered diagram
 * (with a source toggle) while leaving every other fenced/code block untouched.
 */
export function markdownPreWithMermaid({
  children,
  ...props
}: { children?: ReactNode } & React.HTMLAttributes<HTMLPreElement>) {
  const code = Array.isArray(children) ? children[0] : children
  const codeClassName =
    isValidElement<{ className?: string; children?: ReactNode }>(code) ? code.props.className : undefined

  if (codeClassName?.split(/\s+/).includes('language-mermaid')) {
    const source = codeText(code.props.children).replace(/\n$/, '')
    return <MermaidDiagram source={source} />
  }

  return <pre {...props}>{children}</pre>
}
