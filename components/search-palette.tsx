'use client'

// The header search box and its palette. "/" or Cmd/Ctrl+K opens it; results
// come from /api/search as you type, grouped by type. Enter opens the
// highlighted result; "See all results" opens /search.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Command as CommandPrimitive } from 'cmdk'
import { ArrowRight, Loader2, Search } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { SEARCH_TYPE_ICONS, statusLabel } from '@/components/search-icons'
import { SEARCH_TYPES, SEARCH_TYPE_LABELS, MIN_QUERY_LENGTH, type SearchResponse, type SearchResult } from '@/lib/search-types'

const DEBOUNCE_MS = 150

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null
  if (!el) return false
  return el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)
}

export function SearchPalette() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const abort = useRef<AbortController | null>(null)

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen((o) => !o)
      } else if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !isTypingTarget(e.target)) {
        e.preventDefault()
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    const q = query.trim()
    if (q.length < MIN_QUERY_LENGTH) {
      abort.current?.abort()
      setResponse(null)
      setLoading(false)
      return
    }
    setLoading(true)
    const timer = setTimeout(async () => {
      abort.current?.abort()
      const controller = new AbortController()
      abort.current = controller
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        if (res.ok) setResponse(await res.json())
      } catch {
        // aborted by a newer query, or offline: keep the last results
      } finally {
        if (abort.current === controller) setLoading(false)
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [query])

  const go = useCallback((url: string) => {
    setOpen(false)
    router.push(url)
  }, [router])

  const onOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) {
      setQuery('')
      setResponse(null)
    }
  }

  const q = query.trim()
  const groups = SEARCH_TYPES
    .map((type) => ({ type, items: (response?.results ?? []).filter((r) => r.type === type) }))
    .filter((g) => g.items.length > 0)
  const allUrl = `/search?q=${encodeURIComponent(q)}`

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="relative flex h-9 w-full max-w-md flex-1 items-center rounded-md border border-input bg-input pl-9 pr-10 text-left text-sm text-muted-foreground transition-colors hover:border-ring/60 focus:outline-none focus:ring-2 focus:ring-ring"
        aria-label="Search"
        aria-keyshortcuts="/ Control+K Meta+K"
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" />
        <span className="truncate">Search plans, tasks, assets...</span>
        <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border bg-muted px-1.5 text-xs">/</kbd>
      </button>

      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogHeader className="sr-only">
          <DialogTitle>Search</DialogTitle>
          <DialogDescription>Search products, assets, plans, tasks, work items, specs and releases.</DialogDescription>
        </DialogHeader>
        <DialogContent className="top-[15%] translate-y-0 overflow-hidden p-0 sm:max-w-2xl" showCloseButton={false}>
          <Command shouldFilter={false} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2">
            <div className="relative">
              <CommandInput value={query} onValueChange={setQuery} placeholder="Search plans, tasks, assets, specs..." className="h-12" />
              {loading && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
            </div>
            <CommandList className="max-h-[60vh]">
              {q.length < MIN_QUERY_LENGTH ? (
                <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                  Type at least {MIN_QUERY_LENGTH} characters. Every word must match; use &quot;quotes&quot; for a phrase.
                </p>
              ) : (
                <>
                  {!loading && response && <CommandEmpty>No matches for “{q}”.</CommandEmpty>}
                  {groups.map((g) => (
                    <CommandGroup key={g.type} heading={SEARCH_TYPE_LABELS[g.type]}>
                      {g.items.map((r) => <ResultItem key={`${r.type}:${r.id}`} result={r} onSelect={() => go(r.url)} />)}
                    </CommandGroup>
                  ))}
                  {response && response.results.length > 0 && (
                    <CommandPrimitive.Group>
                      <CommandItem value="__all__" onSelect={() => go(allUrl)} className="mx-2 mb-2 text-sm data-[selected=true]:bg-brand/15 data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_2px_0_0_var(--brand)]">
                        <ArrowRight className="h-4 w-4" />
                        See all results for “{q}”
                      </CommandItem>
                    </CommandPrimitive.Group>
                  )}
                </>
              )}
            </CommandList>
            <div className="flex items-center gap-3 border-t px-3 py-2 text-xs text-muted-foreground">
              <span><kbd className="rounded border bg-muted px-1">↑</kbd> <kbd className="rounded border bg-muted px-1">↓</kbd> to move</span>
              <span><kbd className="rounded border bg-muted px-1">Enter</kbd> to open</span>
              <span><kbd className="rounded border bg-muted px-1">Esc</kbd> to close</span>
            </div>
          </Command>
        </DialogContent>
      </Dialog>
    </>
  )
}

function ResultItem({ result, onSelect }: { result: SearchResult; onSelect: () => void }) {
  const Icon = SEARCH_TYPE_ICONS[result.type]
  const meta = [result.key, result.context, result.productName, statusLabel(result.status)].filter(Boolean).join(' · ')
  return (
    <CommandItem value={`${result.type}:${result.id}`} onSelect={onSelect} className="items-start py-2 data-[selected=true]:bg-brand/15 data-[selected=true]:text-foreground data-[selected=true]:shadow-[inset_2px_0_0_var(--brand)]">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">{result.title}</div>
        {meta && <div className="truncate text-xs text-muted-foreground">{meta}</div>}
        {result.snippet && <div className="line-clamp-1 text-xs text-muted-foreground/80">{result.snippet}</div>}
      </div>
    </CommandItem>
  )
}
