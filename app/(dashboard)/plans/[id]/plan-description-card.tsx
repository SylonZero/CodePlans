'use client'

import { useEffect, useRef, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlignLeft, ChevronDown, ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Long-form plan description in its own card, clamped to ~5 lines with an expander. */
export function PlanDescriptionCard({ description }: { description: string }) {
  const [expanded, setExpanded] = useState(false)
  const [clamped, setClamped] = useState(false)
  const textRef = useRef<HTMLParagraphElement>(null)

  useEffect(() => {
    const el = textRef.current
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
        <p
          ref={textRef}
          className={cn(
            'text-sm text-muted-foreground whitespace-pre-line',
            !expanded && 'line-clamp-5',
          )}
        >
          {description}
        </p>
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
