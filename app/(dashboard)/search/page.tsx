// Full search results: every visible product, all types or one type at a time.
// The header palette links here with "See all results".
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Search } from 'lucide-react'
import { authAdapter } from '@/lib/auth'
import { search, SEARCH_TYPES, SEARCH_TYPE_LABELS, MIN_QUERY_LENGTH, type SearchResult, type SearchType } from '@/lib/db/search'
import { SEARCH_TYPE_ICONS, statusLabel } from '@/components/search-icons'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const PER_GROUP = 5
const PER_PAGE = 25

interface Props {
  searchParams: Promise<{ q?: string; type?: string; page?: string }>
}

function href(q: string, type?: SearchType, page?: number) {
  const params = new URLSearchParams({ q })
  if (type) params.set('type', type)
  if (page && page > 1) params.set('page', String(page))
  return `/search?${params}`
}

/** Wraps each search term in <mark>. */
function Highlight({ text, terms }: { text: string; terms: string[] }) {
  if (terms.length === 0) return <>{text}</>
  const pattern = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi')
  return (
    <>
      {text.split(pattern).map((part, i) =>
        i % 2 === 1 ? <mark key={i} className="rounded-sm bg-brand/25 px-0.5 text-foreground">{part}</mark> : part,
      )}
    </>
  )
}

function ResultRow({ result, terms }: { result: SearchResult; terms: string[] }) {
  const Icon = SEARCH_TYPE_ICONS[result.type]
  return (
    <li>
      <Link href={result.url} className="flex gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-muted/60">
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium"><Highlight text={result.title} terms={terms} /></span>
            {result.key && <span className="font-mono text-xs text-muted-foreground">{result.key}</span>}
            {result.status && <Badge variant="outline" className="text-xs font-normal capitalize">{statusLabel(result.status)}</Badge>}
          </div>
          <div className="text-xs text-muted-foreground">
            {[result.context && `in ${result.context}`, result.productName].filter(Boolean).join(' · ')}
          </div>
          {result.snippet && (
            <p className="line-clamp-2 text-sm text-muted-foreground"><Highlight text={result.snippet} terms={terms} /></p>
          )}
        </div>
      </Link>
    </li>
  )
}

export default async function SearchPage({ searchParams }: Props) {
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')

  const params = await searchParams
  const q = (params.q ?? '').trim()
  const type = SEARCH_TYPES.find((t) => t === params.type)
  const page = Math.max(1, Number(params.page) || 1)

  const response = q.length >= MIN_QUERY_LENGTH
    ? await search(user.id, q, type
      ? { types: [type], limit: PER_PAGE, offset: (page - 1) * PER_PAGE, withCounts: true }
      : { limit: PER_GROUP, withCounts: true })
    : null
  // Counts for the tabs come from an all-types count when filtered to one type.
  const counts = response && type
    ? (await search(user.id, q, { limit: 1, withCounts: true })).counts!
    : response?.counts
  const total = counts ? SEARCH_TYPES.reduce((sum, t) => sum + counts[t], 0) : 0

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <form action="/search" className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              name="q"
              defaultValue={q}
              autoFocus={!q}
              placeholder="Search plans, tasks, assets, specs..."
              aria-label="Search"
              className="h-10 w-full rounded-md border border-input bg-input pl-9 pr-3 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>
          {type && <input type="hidden" name="type" value={type} />}
          <Button type="submit">Search</Button>
        </form>
        <p className="text-xs text-muted-foreground">
          Searches every product you can see. Every word must match the title or text; use &quot;quotes&quot; for a phrase.
          Press <kbd className="rounded border bg-muted px-1">/</kbd> anywhere to search.
          {q && (
            <>
              {' '}For design decisions, capabilities and filters by asset or date,{' '}
              <Link href={`/wiki?q=${encodeURIComponent(q)}`} className="font-medium text-primary hover:underline">search the Product Wiki</Link>.
            </>
          )}
        </p>
      </div>

      {q.length > 0 && q.length < MIN_QUERY_LENGTH && (
        <p className="text-sm text-muted-foreground">Type at least {MIN_QUERY_LENGTH} characters.</p>
      )}

      {response && counts && (
        <>
          <nav className="flex flex-wrap gap-1.5 border-b pb-3" aria-label="Result types">
            <Link
              href={href(q)}
              className={cn('rounded-md px-2.5 py-1 text-sm', !type ? 'bg-brand/15 font-medium text-foreground ring-1 ring-inset ring-brand/40' : 'text-muted-foreground hover:bg-muted/60')}
            >
              All <span className="text-xs text-muted-foreground">{total}</span>
            </Link>
            {SEARCH_TYPES.map((t) => (
              <Link
                key={t}
                href={href(q, t)}
                aria-current={type === t ? 'page' : undefined}
                className={cn(
                  'rounded-md px-2.5 py-1 text-sm',
                  type === t ? 'bg-brand/15 font-medium text-foreground ring-1 ring-inset ring-brand/40' : 'text-muted-foreground hover:bg-muted/60',
                  counts[t] === 0 && type !== t && 'opacity-50',
                )}
              >
                {SEARCH_TYPE_LABELS[t]} <span className="text-xs text-muted-foreground">{counts[t]}</span>
              </Link>
            ))}
          </nav>

          {total === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No matches for “{q}”.</p>
          ) : type ? (
            <section className="space-y-3">
              <ul className="space-y-1">
                {response.results.map((r) => <ResultRow key={r.id} result={r} terms={response.terms} />)}
              </ul>
              {counts[type] > PER_PAGE && (
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {(page - 1) * PER_PAGE + 1}–{Math.min(page * PER_PAGE, counts[type])} of {counts[type]}
                  </span>
                  <div className="flex gap-2">
                    {page > 1 && <Button asChild variant="outline" size="sm"><Link href={href(q, type, page - 1)}>Previous</Link></Button>}
                    {page * PER_PAGE < counts[type] && <Button asChild variant="outline" size="sm"><Link href={href(q, type, page + 1)}>Next</Link></Button>}
                  </div>
                </div>
              )}
            </section>
          ) : (
            SEARCH_TYPES.filter((t) => counts[t] > 0).map((t) => (
              <section key={t} className="space-y-1">
                <h2 className="px-3 text-sm font-medium text-muted-foreground">{SEARCH_TYPE_LABELS[t]}</h2>
                <ul className="space-y-1">
                  {response.results.filter((r) => r.type === t).map((r) => <ResultRow key={r.id} result={r} terms={response.terms} />)}
                </ul>
                {counts[t] > PER_GROUP && (
                  <Link href={href(q, t)} className="block px-3 text-sm font-medium text-primary hover:underline">
                    Show all {counts[t]} {SEARCH_TYPE_LABELS[t].toLowerCase()}
                  </Link>
                )}
              </section>
            ))
          )}
        </>
      )}
    </div>
  )
}
