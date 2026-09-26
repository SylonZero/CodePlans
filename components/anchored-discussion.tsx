'use client'

import { createContext, useContext, useRef, useState, type ComponentProps, type ReactNode } from 'react'
import { MessageSquarePlus } from 'lucide-react'
import { CommentsPanel } from '@/components/comments-panel'
import type { CommentAnchor } from '@/lib/db/schema.sqlite'

type Ctx = { anchor: CommentAnchor | null; setAnchor: (a: CommentAnchor | null) => void }
const AnchorContext = createContext<Ctx>({ anchor: null, setAnchor: () => {} })

/** Shares a pending text selection between the document and its discussion panel. */
export function AnchorProvider({ children }: { children: ReactNode }) {
  const [anchor, setAnchor] = useState<CommentAnchor | null>(null)
  return <AnchorContext.Provider value={{ anchor, setAnchor }}>{children}</AnchorContext.Provider>
}

/**
 * Wraps rendered prose. Selecting text shows a "Comment" button that quotes
 * the selection (with a little surrounding context) into the discussion.
 */
export function SelectableArticle({ children, className, enabled = true }: { children: ReactNode; className?: string; enabled?: boolean }) {
  const { setAnchor } = useContext(AnchorContext)
  const ref = useRef<HTMLDivElement>(null)
  const [button, setButton] = useState<{ top: number; left: number; anchor: CommentAnchor } | null>(null)

  function onMouseUp() {
    if (!enabled) return
    const sel = window.getSelection()
    const root = ref.current
    if (!sel || sel.isCollapsed || !root || !root.contains(sel.anchorNode) || !root.contains(sel.focusNode)) { setButton(null); return }
    const quote = sel.toString().replace(/\s+/g, ' ').trim()
    if (quote.length < 3) { setButton(null); return }
    const text = (root.textContent ?? '').replace(/\s+/g, ' ')
    const at = text.indexOf(quote)
    const anchor: CommentAnchor = {
      quote: quote.slice(0, 1000),
      prefix: at > 0 ? text.slice(Math.max(0, at - 40), at) : undefined,
      suffix: at >= 0 ? text.slice(at + quote.length, at + quote.length + 40) || undefined : undefined,
    }
    const rect = sel.getRangeAt(0).getBoundingClientRect()
    const box = root.getBoundingClientRect()
    setButton({ top: rect.top - box.top - 40, left: Math.max(0, rect.left - box.left + rect.width / 2 - 60), anchor })
  }

  return <div ref={ref} className="relative" onMouseUp={onMouseUp}>
    <div className={className}>{children}</div>
    {button && <button
      type="button"
      className="absolute z-10 inline-flex items-center gap-1.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs font-medium shadow-md hover:bg-muted"
      style={{ top: button.top, left: button.left }}
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        setAnchor(button.anchor)
        setButton(null)
        window.getSelection()?.removeAllRanges()
        document.getElementById('discussion')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }}
    ><MessageSquarePlus className="h-3.5 w-3.5" />Comment on selection</button>}
  </div>
}

/** CommentsPanel wired to the shared selection. */
export function AnchoredCommentsPanel(props: Omit<ComponentProps<typeof CommentsPanel>, 'anchor' | 'onClearAnchor'>) {
  const { anchor, setAnchor } = useContext(AnchorContext)
  return <CommentsPanel {...props} anchor={anchor} onClearAnchor={() => setAnchor(null)} />
}
