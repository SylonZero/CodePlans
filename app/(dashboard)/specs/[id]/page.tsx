import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getSpec, listSpecRevisions } from '@/lib/db/specs'
import { canWriteProduct } from '@/lib/db/authz'
import { SpecEditor } from '@/components/native-specs'
import { SpecActionBar, type SpecActionState } from '@/components/spec-actions'
import { SpecHistory, SpecDiff } from '@/components/spec-history'
import { ReviewPanel } from '@/components/review-panel'
import { AnchorProvider, SelectableArticle, AnchoredCommentsPanel } from '@/components/anchored-discussion'
import { getReviewSummary } from '@/lib/db/reviews'
import { listComments, getProductAudience } from '@/lib/db/comments'
import { checkActivation } from '@/lib/db/workflow'
import { MarkdownContent } from '@/components/markdown-content'
import { db } from '@/lib/db'
import { assets, codePlans, workItems } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'

/** Display names for a spec's link targets (all in the spec's product, which the viewer can already see). */
async function linkTargetNames(links: { targetType: string; targetId: string }[]) {
  const ids = (type: string) => links.filter((l) => l.targetType === type).map((l) => l.targetId)
  const [a, p, w] = await Promise.all([
    ids('asset').length ? db.select({ id: assets.id, name: assets.name }).from(assets).where(inArray(assets.id, ids('asset'))) : [],
    ids('code_plan').length ? db.select({ id: codePlans.id, name: codePlans.title }).from(codePlans).where(inArray(codePlans.id, ids('code_plan'))) : [],
    ids('work_item').length ? db.select({ id: workItems.id, name: workItems.title }).from(workItems).where(inArray(workItems.id, ids('work_item'))) : [],
  ])
  return new Map([...a, ...p, ...w].map((r) => [r.id, r.name]))
}

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
  const [revisions, canEdit, targetNames, review, threads, audience] = await Promise.all([
    listSpecRevisions(id, user.id), canWriteProduct(user.id, spec.productId), linkTargetNames(spec.links),
    getReviewSummary('spec', id, user.id), listComments('spec', id, user.id), getProductAudience(spec.productId),
  ])
  const activation = canEdit && (spec.status === 'draft' || spec.status === 'in_review')
    ? await checkActivation({ subjectType: 'spec', subjectId: id, transition: 'activate', actor: { id: user.id } })
    : null
  const open = review.current
  const actionState: SpecActionState = {
    specId: id, status: spec.status as SpecActionState['status'], version: spec.version, canEdit, imported: spec.sourceType === 'git_import',
    approvedNow: review.approvedNow, lastApprovedVersion: review.lastApprovedVersion,
    openReview: open ? {
      total: open.participants.length,
      waiting: open.participants.filter((p) => p.decision !== 'approved' || p.outdated).length,
      changesRequested: open.state === 'changes_requested',
    } : null,
    activation: activation ? { allowed: activation.allowed, warning: activation.warning, reasons: activation.reasons } : null,
  }

  const requested = v ? Number.parseInt(v, 10) : undefined
  const viewing = requested && requested !== spec.version ? revisions.find((r) => r.version === requested) : undefined
  if (requested && requested !== spec.version && !viewing) notFound()
  const shown = viewing ?? revisions.find((r) => r.version === spec.version)
  const previous = shown ? revisions.find((r) => r.version === shown.version - 1) : undefined
  const showDiff = diff === '1' && shown && previous

  const path = `/specs/${id}`
  return <AnchorProvider><div className="mx-auto max-w-4xl space-y-6">
    <div>
      <Link href="/specs" className="text-sm text-muted-foreground hover:underline">← Specs</Link>
      <h1 className="mt-1 text-2xl font-bold">{viewing?.title ?? spec.title}</h1>
      <p className="text-sm text-muted-foreground">{spec.specType}{spec.area ? ` · ${spec.area}` : ''} · v{spec.version} · authored by {spec.authorType}</p>
    </div>
    {!viewing && !showDiff && <SpecActionBar state={actionState} />}
    {viewing && <div role="status" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm">
      <span>You are viewing <strong>v{viewing.version}</strong> ({viewing.status}). The current version is v{spec.version}.</span>
      <Link className="underline" href={`/specs/${id}`}>Back to current</Link>
    </div>}
    {spec.sourceUrl && /^https?:\/\//.test(spec.sourceUrl) && <a className="text-sm underline" href={spec.sourceUrl} target="_blank" rel="noreferrer">Original {spec.sourceType === 'git_import' ? 'git import' : 'source'} citation</a>}
    {spec.supersedes && <p>Replaces <Link className="underline" href={`/specs/${spec.supersedes}`}>previous spec</Link></p>}
    {spec.supersededBy && <p>Superseded by <Link className="underline" href={`/specs/${spec.supersededBy}`}>replacement spec</Link></p>}
    {showDiff
      ? <><SpecDiff before={previous} after={shown} /><Link className="text-sm underline" href={viewing ? `/specs/${id}?v=${shown.version}` : `/specs/${id}`}>Show v{shown.version} in full</Link></>
      : <SelectableArticle enabled={!viewing} className="prose dark:prose-invert max-w-none rounded-lg border bg-card p-6"><MarkdownContent>{viewing?.body ?? spec.body}</MarkdownContent></SelectableArticle>}
    {!viewing && !showDiff && spec.status !== 'superseded' && <ReviewPanel summary={review} currentUserId={user.id} path={path} noun="spec" />}
    {!viewing && !showDiff && <AnchoredCommentsPanel subjectType="spec" subjectId={id} threads={threads} currentUserId={user.id} canModerate={canEdit}
      currentVersion={spec.version} path={path} audience={audience.map((u) => ({ id: u.id, name: u.name }))} />}
    {!viewing && !showDiff && canEdit && <SpecEditor key={`${spec.id}:${spec.version}:${spec.updatedAt.toString()}`} spec={spec} />}
    <SpecHistory specId={id} revisions={revisions} currentVersion={spec.version} viewing={shown?.version} />
    <section className="space-y-2"><h2 className="font-semibold">Linked assets, plans and work items</h2><ul>{spec.links.map((l) => <li key={l.id}><Link className="text-sm underline" href={l.targetType === 'asset' ? `/assets/${l.targetId}` : l.targetType === 'code_plan' ? `/plans/${l.targetId}` : `/work-items?item=${l.targetId}`}>{targetNames.get(l.targetId) ?? l.targetType.replace('_', ' ')}</Link> <span className="text-xs text-muted-foreground">{l.targetType.replace('_', ' ')}{l.relationshipType ? ` · ${l.relationshipType}` : ''}</span></li>)}</ul>{spec.links.length === 0 && <p className="text-sm text-muted-foreground">Not linked yet.</p>}</section>
  </div></AnchorProvider>
}
