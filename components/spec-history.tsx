import Link from 'next/link'
import { cn } from '@/lib/utils'
import { diffLines, diffStats } from '@/lib/text-diff'
import type { SpecRevision } from '@/lib/db/specs'

type RevisionRow = SpecRevision & { authorName: string | null }

function formatDate(d: Date) {
  return d.toISOString().slice(0, 16).replace('T', ' ')
}

/** Version list for a spec. Each row links to a read-only view and a diff against its predecessor. */
export function SpecHistory({ specId, revisions, currentVersion, viewing }: {
  specId: string
  revisions: RevisionRow[]
  currentVersion: number
  viewing?: number
}) {
  const oldest = revisions.at(-1)?.version ?? currentVersion
  return <section className="space-y-3 rounded-lg border bg-card p-5">
    <div className="flex items-baseline justify-between gap-3">
      <h2 className="font-semibold">Version history</h2>
      <span className="text-xs text-muted-foreground">{revisions.length} retained {revisions.length === 1 ? 'version' : 'versions'}</span>
    </div>
    <ol className="divide-y text-sm">
      {revisions.map((r) => {
        const hasPrev = revisions.some((p) => p.version === r.version - 1)
        return <li key={r.id} className={cn('flex flex-wrap items-center justify-between gap-2 py-2', viewing === r.version && 'font-medium')}>
          <div className="min-w-0">
            <span className="mr-2 inline-flex rounded bg-muted px-1.5 py-0.5 font-mono text-xs">v{r.version}</span>
            <span className="text-muted-foreground">{formatDate(r.createdAt)}{r.authorName ? ` · ${r.authorName}` : ''}{r.createdByKind === 'agent' ? ' (agent)' : ''} · {r.status}</span>
            {r.changeSummary && <p className="mt-0.5 truncate text-foreground">{r.changeSummary}</p>}
          </div>
          <div className="flex gap-3 text-xs">
            {r.version === currentVersion
              ? <Link className="underline" href={`/specs/${specId}`}>Current</Link>
              : <Link className="underline" href={`/specs/${specId}?v=${r.version}`}>View</Link>}
            {hasPrev && <Link className="underline" href={`/specs/${specId}?v=${r.version}&diff=1`}>Changes from v{r.version - 1}</Link>}
          </div>
        </li>
      })}
    </ol>
    {oldest > 1 && <p className="text-xs text-muted-foreground">Versions before v{oldest} were created before revision history was retained; their text was not stored.</p>}
  </section>
}

export function SpecDiff({ before, after }: { before: SpecRevision; after: SpecRevision }) {
  const lines = diffLines(before.body, after.body)
  const { added, removed } = diffStats(lines)
  const meta = [
    before.title !== after.title && `Title: "${before.title}" → "${after.title}"`,
    before.status !== after.status && `Status: ${before.status} → ${after.status}`,
    before.specType !== after.specType && `Type: ${before.specType} → ${after.specType}`,
  ].filter(Boolean) as string[]
  return <section className="space-y-3">
    <div className="flex flex-wrap items-baseline gap-3 text-sm">
      <h2 className="font-semibold">Changes from v{before.version} to v{after.version}</h2>
      <span className="text-emerald-600 dark:text-emerald-400">+{added}</span>
      <span className="text-red-600 dark:text-red-400">−{removed}</span>
    </div>
    {meta.length > 0 && <ul className="text-sm text-muted-foreground">{meta.map((m) => <li key={m}>{m}</li>)}</ul>}
    {added + removed === 0
      ? <p className="text-sm text-muted-foreground">The body did not change in this version.</p>
      : <pre className="overflow-x-auto rounded-lg border bg-card p-0 text-xs leading-relaxed" aria-label="Spec diff">
        {lines.map((l, i) => <div key={i} className={cn('whitespace-pre-wrap px-4',
          l.kind === 'add' && 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
          l.kind === 'del' && 'bg-red-500/10 text-red-700 line-through decoration-red-400/60 dark:text-red-300')}>
          <span className="mr-3 select-none text-muted-foreground">{l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}</span>{l.text || ' '}
        </div>)}
      </pre>}
  </section>
}
