'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Check, CircleDashed, ClipboardCheck, MessageSquare, X, XCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { timeAgo } from '@/components/comments-panel'
import { addReviewersAction, decideReviewAction, removeReviewerAction, requestReviewAction, withdrawReviewAction } from '@/app/(dashboard)/collab-actions'
import type { ReviewSummary, ReviewView, ParticipantView } from '@/lib/db/reviews'
import type { ReviewReason, ReviewState } from '@/lib/db/schema.sqlite'

export const REASON_LABELS: Record<ReviewReason, string> = {
  architect: 'Architect', code_owner: 'Code owner', eng_manager: 'Eng manager', requested: 'Requested',
}

export const REVIEW_STATE_LABELS: Record<ReviewState, string> = {
  open: 'In review', changes_requested: 'Changes requested', approved: 'Approved', withdrawn: 'Withdrawn', stale: 'Approval outdated',
}

export const REVIEW_STATE_STYLES: Record<ReviewState, string> = {
  open: 'bg-chart-2/20 text-chart-2',
  changes_requested: 'bg-destructive/20 text-destructive',
  approved: 'bg-chart-1/20 text-chart-1',
  withdrawn: 'bg-muted text-muted-foreground',
  stale: 'bg-warning/20 text-warning',
}

/** One-line review status for headers and lists. */
export function ReviewStatusBadge({ summary }: { summary: Pick<ReviewSummary, 'current' | 'approvedNow' | 'lastApprovedVersion' | 'currentVersion'> }) {
  if (summary.current) return <Badge variant="secondary" className={REVIEW_STATE_STYLES[summary.current.state]}>{REVIEW_STATE_LABELS[summary.current.state]}</Badge>
  if (summary.approvedNow) return <Badge variant="secondary" className={REVIEW_STATE_STYLES.approved}>Approved</Badge>
  if (summary.lastApprovedVersion) return <Badge variant="secondary" className={REVIEW_STATE_STYLES.stale}>Changed since v{summary.lastApprovedVersion} approval</Badge>
  return <Badge variant="secondary" className="bg-muted text-muted-foreground">Not reviewed</Badge>
}

function Decision({ p }: { p: ParticipantView }) {
  if (p.decision === 'pending' || p.outdated) {
    return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <CircleDashed className="h-3.5 w-3.5" />
      {p.outdated ? `${p.decision === 'approved' ? 'Approved' : p.decision === 'changes_requested' ? 'Requested changes on' : 'Commented on'} v${p.decidedAtVersion} · needs another look` : 'Pending'}
    </span>
  }
  if (p.decision === 'approved') return <span className="inline-flex items-center gap-1 text-xs text-chart-1"><Check className="h-3.5 w-3.5" />Approved v{p.decidedAtVersion}</span>
  if (p.decision === 'changes_requested') return <span className="inline-flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3.5 w-3.5" />Changes requested</span>
  return <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MessageSquare className="h-3.5 w-3.5" />Commented</span>
}

function useRun(path: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [error, setError] = useState('')
  function run(fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) {
    setError('')
    start(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? 'Failed')
      else { after?.(); router.refresh() }
    })
  }
  return { pending, error, run, path }
}

function CurrentReview({ review, summary, currentUserId, path }: { review: ReviewView; summary: ReviewSummary; currentUserId: string; path: string }) {
  const { pending, error, run } = useRun(path)
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState('')
  const me = review.participants.find((p) => p.userId === currentUserId)
  const addable = summary.audience.filter((u) => !review.participants.some((p) => p.userId === u.id) && u.id !== review.requestedById)
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">
      Requested by {review.requestedByName ?? 'someone'}{review.requestedByKind === 'agent' ? ' (agent)' : ''} {timeAgo(review.requestedAt)} on v{review.subjectVersion}
      {summary.currentVersion !== review.subjectVersion ? ` · now at v${summary.currentVersion}` : ''}
      {review.dueAt ? ` · due ${review.dueAt}` : ''}
    </p>
    {review.note && <p className="rounded-md bg-muted/50 px-3 py-2 text-sm">{review.note}</p>}
    <ul className="divide-y rounded-md border">
      {review.participants.map((p) => <li key={p.userId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-sm">
        <span className="font-medium">{p.name}</span>
        <Badge variant="outline" className="h-5 px-1.5 text-[10px]">{REASON_LABELS[p.reason]}</Badge>
        {p.required && <span className="text-[10px] uppercase tracking-wide text-muted-foreground">required</span>}
        <span className="ml-auto"><Decision p={p} /></span>
        {summary.viewer.canManage && p.decision === 'pending' && <button type="button" aria-label={`Remove ${p.name}`} disabled={pending}
          className="text-muted-foreground hover:text-foreground" onClick={() => run(() => removeReviewerAction(review.id, p.userId, path))}><X className="h-3.5 w-3.5" /></button>}
      </li>)}
    </ul>
    {me && <div className="space-y-2 rounded-md border border-accent/40 bg-accent/5 p-3">
      <p className="text-sm font-medium">Your review{me.outdated ? ' — the content changed since your last decision' : ''}</p>
      <textarea aria-label="Review note" value={note} onChange={(e) => setNote(e.target.value)} rows={2}
        placeholder="Optional note (required when requesting changes)"
        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground" />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={pending} onClick={() => run(() => decideReviewAction(review.id, 'approved', note || undefined, path), () => setNote(''))}><Check className="mr-1.5 h-4 w-4" />Approve v{summary.currentVersion}</Button>
        <Button size="sm" variant="outline" disabled={pending || !note.trim()} onClick={() => run(() => decideReviewAction(review.id, 'changes_requested', note, path), () => setNote(''))}>Request changes</Button>
        <Button size="sm" variant="ghost" disabled={pending || !note.trim()} onClick={() => run(() => decideReviewAction(review.id, 'commented', note, path), () => setNote(''))}>Comment only</Button>
      </div>
    </div>}
    {summary.viewer.canManage && <div className="flex flex-wrap items-center gap-2">
      {addable.length > 0 && <>
        <Select value={adding} onValueChange={setAdding}>
          <SelectTrigger className="h-8 w-[200px]" aria-label="Add reviewer"><SelectValue placeholder="Add a reviewer" /></SelectTrigger>
          <SelectContent>{addable.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
        </Select>
        <Button size="sm" variant="outline" disabled={!adding || pending} onClick={() => run(() => addReviewersAction(review.id, [{ userId: adding }], path), () => setAdding(''))}>Add</Button>
      </>}
      <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" disabled={pending} onClick={() => run(() => withdrawReviewAction(review.id, path))}>Withdraw review</Button>
    </div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

function RequestForm({ summary, path }: { summary: ReviewSummary; path: string }) {
  const { pending, error, run } = useRun(path)
  const guided = summary.workflowLevel !== 'open'
  const [chosen, setChosen] = useState<Record<string, { on: boolean; required: boolean }>>(
    Object.fromEntries(summary.suggestions.map((s) => [s.userId, { on: true, required: s.required }])),
  )
  const [extra, setExtra] = useState('')
  const [note, setNote] = useState('')
  const [due, setDue] = useState('')
  const extras = Object.keys(chosen).filter((id) => !summary.suggestions.some((s) => s.userId === id))
  const others = summary.audience.filter((u) => !(u.id in chosen))
  const selected = Object.entries(chosen).filter(([, v]) => v.on)

  return <div className="space-y-3">
    {summary.suggestions.length > 0
      ? <p className="text-sm text-muted-foreground">{guided ? 'This product uses a guided workflow, so these reviewers are always included.' : 'Suggested from responsibilities:'}</p>
      : <p className="text-sm text-muted-foreground">No architect or code owner is assigned for this yet. Choose reviewers below.</p>}
    <ul className="space-y-1.5">
      {summary.suggestions.map((s) => <li key={s.userId} className="flex flex-wrap items-center gap-2 text-sm">
        <input type="checkbox" aria-label={`Include ${s.name}`} checked={chosen[s.userId]?.on ?? false} disabled={guided}
          onChange={(e) => setChosen((c) => ({ ...c, [s.userId]: { ...c[s.userId], on: e.target.checked } }))} />
        <span className="font-medium">{s.name}</span>
        <span className="text-xs text-muted-foreground">{s.detail}</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={chosen[s.userId]?.required ?? false} disabled={guided && s.required}
            onChange={(e) => setChosen((c) => ({ ...c, [s.userId]: { ...c[s.userId], required: e.target.checked } }))} />required
        </label>
      </li>)}
      {extras.map((id) => <li key={id} className="flex items-center gap-2 text-sm">
        <input type="checkbox" aria-label="Include" checked={chosen[id].on} onChange={(e) => setChosen((c) => ({ ...c, [id]: { ...c[id], on: e.target.checked } }))} />
        <span className="font-medium">{summary.audience.find((u) => u.id === id)?.name}</span>
        <span className="text-xs text-muted-foreground">Requested</span>
        <label className="ml-auto flex items-center gap-1 text-xs text-muted-foreground">
          <input type="checkbox" checked={chosen[id].required} onChange={(e) => setChosen((c) => ({ ...c, [id]: { ...c[id], required: e.target.checked } }))} />required
        </label>
      </li>)}
    </ul>
    {others.length > 0 && <div className="flex gap-2">
      <Select value={extra} onValueChange={setExtra}>
        <SelectTrigger className="h-8 w-[220px]" aria-label="Another reviewer"><SelectValue placeholder="Add someone else" /></SelectTrigger>
        <SelectContent>{others.map((u) => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}</SelectContent>
      </Select>
      <Button size="sm" variant="outline" disabled={!extra} onClick={() => { setChosen((c) => ({ ...c, [extra]: { on: true, required: false } })); setExtra('') }}>Add</Button>
    </div>}
    <div className="grid gap-2 sm:grid-cols-[1fr_160px]">
      <Input aria-label="Note to reviewers" placeholder="Note to reviewers (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
      <Input aria-label="Due date" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
    </div>
    <Button disabled={pending || selected.length === 0} onClick={() => run(() => requestReviewAction({
      subjectType: summary.subjectType, subjectId: summary.subjectId,
      reviewers: selected.map(([userId, v]) => ({ userId, required: v.required })),
      note: note || undefined, dueAt: due || undefined,
    }, path))}>
      <ClipboardCheck className="mr-2 h-4 w-4" />Request review of v{summary.currentVersion}
    </Button>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
  </div>
}

export function ReviewPanel({ summary, currentUserId, path, noun }: { summary: ReviewSummary; currentUserId: string; path: string; noun: 'spec' | 'plan' }) {
  const [requesting, setRequesting] = useState(false)
  const current = summary.current
  return <section id="review" className="space-y-4 rounded-lg border bg-card p-5">
    <div className="flex flex-wrap items-center gap-2">
      <h2 className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4" />Review</h2>
      <ReviewStatusBadge summary={summary} />
      <span className="ml-auto text-xs text-muted-foreground">{summary.workflowLevel === 'open' ? 'Open' : summary.workflowLevel === 'guided' ? 'Guided' : 'Gated'} workflow</span>
    </div>

    {current && <CurrentReview review={current} summary={summary} currentUserId={currentUserId} path={path} />}

    {!current && <>
      <p className="text-sm text-muted-foreground">
        {summary.approvedNow
          ? `v${summary.lastApprovedVersion} was approved and still covers this ${noun}'s current content.`
          : summary.lastApprovedVersion
            ? `Last approved at v${summary.lastApprovedVersion}. The content has changed since, so that approval no longer covers v${summary.currentVersion}.`
            : `This ${noun} hasn't been reviewed.`}
      </p>
      {summary.viewer.canRequest && (requesting
        ? <RequestForm summary={summary} path={path} />
        : <Button variant="outline" onClick={() => setRequesting(true)}>Request review</Button>)}
    </>}

    {summary.history.length > 0 && <details>
      <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">Earlier reviews ({summary.history.length})</summary>
      <ul className="mt-2 space-y-1 text-sm">
        {summary.history.map((r) => <li key={r.id} className="flex flex-wrap items-center gap-2">
          <Badge variant="secondary" className={cn('h-5 px-1.5 text-[10px]', REVIEW_STATE_STYLES[r.state])}>{REVIEW_STATE_LABELS[r.state]}</Badge>
          <span className="text-muted-foreground">
            {r.approvedVersion ? `v${r.approvedVersion} approved` : `requested on v${r.subjectVersion}`} · {r.participants.map((p) => p.name).join(', ')} · {timeAgo(r.closedAt ?? r.requestedAt)}
          </span>
        </li>)}
      </ul>
    </details>}
  </section>
}
