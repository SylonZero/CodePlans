'use client'

import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlignLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Long-form plan description in its own card, collapsed to a preview with an expander. */
export function PlanDescriptionCard({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = contentRef.current
    if (el) setClamped(el.scrollHeight > el.clientHeight + 1)
  }, [description])

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <AlignLeft className="h-4 w-4" />
          Description
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* Descriptions are markdown (authored via the rich text editor or MCP) — render, don't show syntax. */}
        <div
          ref={contentRef}
          className={cn(
            'prose prose-sm prose-invert max-w-none text-muted-foreground',
            '[&_h1]:text-base [&_h2]:text-sm [&_h3]:text-sm [&_pre]:bg-muted [&_pre]:p-2 [&_pre]:rounded [&_code]:text-xs [&_table]:text-xs [&_ul.contains-task-list]:list-none [&_ul.contains-task-list]:pl-1',
            !expanded && 'max-h-36 overflow-hidden',
          )}
        >
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{description}</ReactMarkdown>
        </div>
        {(clamped || expanded) && (
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <>
                Show less
                <ChevronUp className="ml-1 h-3.5 w-3.5" />
              </>
            ) : (
              <>
                Show more
                <ChevronDown className="ml-1 h-3.5 w-3.5" />
              </>
            )}
          </Button>
        )}
      </CardContent>
    </Card>
  )
}
