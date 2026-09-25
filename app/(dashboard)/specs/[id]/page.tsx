import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getSpec, listSpecRevisions } from '@/lib/db/specs'
import { canWriteProduct } from '@/lib/db/authz'
import { SpecEditor } from '@/components/native-specs'
import { SpecHistory, SpecDiff } from '@/components/spec-history'
import { MarkdownContent } from '@/components/markdown-content'

export default async function SpecPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ v?: string; diff?: string }>
}) {
  const user = await authAdapter.getUser()
  if (!user) return null
  const { id } = await params
  const { v, diff } = await searchParams
  const spec = await getSpec(id, user.id).catch(() => null)
  if (!spec) notFound()
  const [revisions, canEdit] = await Promise.all([listSpecRevisions(id, user.id), canWriteProduct(user.id, spec.productId)])

  const requested = v ? Number.parseInt(v, 10) : undefined
  const viewing = requested && requested !== spec.version ? revisions.find((r) => r.version === requested) : undefined
  if (requested && requested !== spec.version && !viewing) notFound()
  const shown = viewing ?? revisions.find((r) => r.version === spec.version)
  const previous = shown ? revisions.find((r) => r.version === shown.version - 1) : undefined
  const showDiff = diff === '1' && shown && previous

  return <div className="mx-auto max-w-4xl space-y-6">
    <div>
      <Link href="/specs" className="text-sm text-muted-foreground hover:underline">← Specs</Link>
      <h1 className="mt-1 text-2xl font-bold">{viewing?.title ?? spec.title}</h1>
      <p className="text-sm text-muted-foreground">{spec.specType}{spec.area ? ` · ${spec.area}` : ''} · v{spec.version} · {spec.status} · authored by {spec.authorType}</p>
    </div>
    {viewing && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <span>You are viewing <strong>v{viewing.version}</strong> ({viewing.status}). The current version is v{spec.version}.</span>
      <Link className="underline" href={`/specs/${id}`}>Back to current</Link>
    </div>}
    {spec.sourceUrl && /^https?:\/\//.test(spec.sourceUrl) && <a className="text-sm underline" href={spec.sourceUrl} target="_blank" rel="noreferrer">Original {spec.sourceType === 'git_import' ? 'git import' : 'source'} citation</a>}
    {spec.needsReview && <p className="text-sm text-muted-foreground">Imported spec: review the classification and content.</p>}
    {spec.supersedes && <p>Replaces <Link className="underline" href={`/specs/${spec.supersedes}`}>previous spec</Link></p>}
    {spec.supersededBy && <p>Superseded by <Link className="underline" href={`/specs/${spec.supersededBy}`}>replacement spec</Link></p>}
    {showDiff
      ? <SpecDiff before={previous} after={shown} />
      : <article className="prose dark:prose-invert max-w-none rounded-lg border bg-card p-6"><MarkdownContent>{viewing?.body ?? spec.body}</MarkdownContent></article>}
    {!viewing && canEdit && <SpecEditor key={`${spec.id}:${spec.version}`} spec={spec} />}
    <SpecHistory specId={id} revisions={revisions} currentVersion={spec.version} viewing={shown?.version} />
    <section className="space-y-2"><h2 className="font-semibold">Linked assets, plans and work items</h2><ul>{spec.links.map((l) => <li key={l.id}><Link className="text-sm underline" href={l.targetType === 'asset' ? `/assets/${l.targetId}` : l.targetType === 'code_plan' ? `/plans/${l.targetId}` : `/work-items?item=${l.targetId}`}>{l.targetType.replace('_', ' ')}{l.relationshipType ? ` · ${l.relationshipType}` : ''}</Link></li>)}</ul></section>
  </div>
}
