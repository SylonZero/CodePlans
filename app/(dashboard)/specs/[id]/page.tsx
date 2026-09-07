import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getSpec } from '@/lib/db/specs'
import { db } from '@/lib/db'
import { specEvents } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { SpecEditor } from '@/components/native-specs'
import { MarkdownContent } from '@/components/markdown-content'

export default async function SpecPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await authAdapter.getUser()
  if (!user) return null
  const { id } = await params
  const spec = await getSpec(id, user.id).catch(() => null)
  if (!spec) notFound()
  const events = await db.select().from(specEvents).where(eq(specEvents.specId, id)).orderBy(desc(specEvents.createdAt))
  const versions = [...new Map(events.filter((e) => e.kind === 'spec_updated').map((e) => [e.toVersion, e])).values()]
  return <div className="mx-auto max-w-4xl space-y-6">
    <div><h1 className="text-2xl font-bold">{spec.title}</h1><p className="text-sm text-muted-foreground">{spec.specType}{spec.area ? ` · ${spec.area}` : ''} · v{spec.version} · {spec.status} · authored by {spec.authorType}</p></div>
    {spec.sourceUrl && /^https?:\/\//.test(spec.sourceUrl) && <a className="text-sm underline" href={spec.sourceUrl} target="_blank" rel="noreferrer">Original {spec.sourceType === 'git_import' ? 'git import' : 'source'} citation</a>}
    {spec.needsReview && <p className="text-sm text-muted-foreground">Imported spec: review the classification and content.</p>}
    {spec.supersedes && <p>Replaces <Link className="underline" href={`/specs/${spec.supersedes}`}>previous spec</Link></p>}
    {spec.supersededBy && <p>Superseded by <Link className="underline" href={`/specs/${spec.supersededBy}`}>replacement spec</Link></p>}
    <article className="prose dark:prose-invert max-w-none rounded-lg border bg-card p-6"><MarkdownContent>{spec.body}</MarkdownContent></article>
    <SpecEditor key={`${spec.id}:${spec.version}`} spec={spec} />
    <section className="space-y-2"><h2 className="font-semibold">Linked assets, plans and work items</h2><ul>{spec.links.map((l) => <li key={l.id}><Link className="text-sm underline" href={l.targetType === 'asset' ? `/assets/${l.targetId}` : l.targetType === 'code_plan' ? `/plans/${l.targetId}` : `/work-items?item=${l.targetId}`}>{l.targetType.replace('_', ' ')}{l.relationshipType ? ` · ${l.relationshipType}` : ''}</Link></li>)}</ul></section>
    <section className="space-y-2"><h2 className="font-semibold">Version activity</h2><p className="text-sm text-muted-foreground">Current body only; earlier body snapshots and diffs are not retained in v1.</p><ul className="text-sm">{versions.map((e) => <li key={e.id}>v{e.fromVersion} → v{e.toVersion} · {e.createdAt.toISOString().slice(0, 10)}</li>)}<li>v1 created · {spec.createdAt.toISOString().slice(0, 10)}</li></ul></section>
  </div>
}
