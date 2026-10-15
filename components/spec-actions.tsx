'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, ClipboardCheck, GitBranch, PenLine, Rocket } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { setSpecStatusAction } from '@/app/(dashboard)/specs/actions'
import { ActivationNotice, type ApprovalNeeds } from '@/components/activation-notice'

export type SpecActionState = {
  specId: string
  status: 'draft' | 'in_review' | 'active' | 'archived' | 'superseded'
  version: number
  canEdit: boolean
  /** Imported from git: arrives in review so someone checks it before it's current intent. */
  imported: boolean
  approvedNow: boolean
  lastApprovedVersion: number | null
  /** The open review, if any: how many reviewers still need to (re)decide. */
  openReview: { waiting: number; total: number; changesRequested: boolean; changesRequestedBy: string[] } | null
  /** From checkActivation, for editors of a spec that isn't active. */
  activation: { allowed: boolean; warning: string | null; reasons: string[]; blockedByWorkflow: boolean; level: string } | null
  /** What an approval still needs, for the activation notice. */
  needs: ApprovalNeeds
}

/** Ask the editor or review panel on this page to open (they listen for these). */
export function openSpecEditor(section: 'revise' | 'details' | 'supersede') {
  window.dispatchEvent(new CustomEvent('spec-editor:open', { detail: section }))
}
export function openReviewRequest() {
  window.dispatchEvent(new CustomEvent('review:request'))
}

const STATUS_STYLES: Record<SpecActionState['status'], string> = {
  draft: 'bg-muted text-muted-foreground',
  in_review: 'bg-chart-2/20 text-chart-2',
  active: 'bg-chart-1/20 text-chart-1',
  archived: 'bg-muted text-muted-foreground',
  superseded: 'bg-muted text-muted-foreground',
}

function explain(s: SpecActionState) {
  const v = `v${s.version}`
  switch (s.status) {
    case 'draft': return s.approvedNow ? `${v} is approved. Activate it when it's ready.` : 'Request a review, or activate it when it’s ready.'
    case 'in_review':
      if (s.openReview?.changesRequested) return 'Changes were requested. Revise the content, then ask the reviewers to look again.'
      if (s.openReview) {
        const waiting = `Waiting on ${s.openReview.waiting} of ${s.openReview.total} reviewer${s.openReview.total === 1 ? '' : 's'}.`
        const by = s.openReview.changesRequestedBy
        return by.length ? `${by.join(', ')} requested changes. ${s.openReview.waiting ? waiting : ''}`.trim() : waiting
      }
      if (s.approvedNow) return `${v} is approved and ready to activate.`
      return s.imported
        ? 'Imported from git. Check the content and classification, then activate it or ask for a review.'
        : 'In review, with no reviewers asked yet.'
    case 'active': return s.approvedNow || !s.lastApprovedVersion
      ? `This is the current design intent. Revising the content creates v${s.version + 1}.`
      : `Active, but the last approval covers v${s.lastApprovedVersion} only.`
    case 'archived': return 'Archived. Restore it to draft to work on it again.'
    case 'superseded': return 'Superseded by a replacement spec and read-only.'
  }
}

/**
 * What can be done with this spec right now, at the top of its page. Status
 * moves never create a version; only revising the content does.
 */
export function SpecActionBar({ state }: { state: SpecActionState }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [confirming, setConfirming] = useState(false)
  const [error, setError] = useState('')
  const s = state

  function move(status: 'draft' | 'active' | 'archived') {
    setError('')
    start(async () => {
      const r = await setSpecStatusAction(s.specId, status, s.version)
      if (!r.ok) setError(r.error)
      else { setConfirming(false); router.refresh() }
    })
  }

  const canActivate = s.canEdit && (s.status === 'draft' || s.status === 'in_review')
  const blocked = canActivate && s.activation && !s.activation.allowed
  const needsConfirm = canActivate && !blocked && !!s.activation?.warning
  const activateLabel = s.approvedNow && s.status === 'in_review' ? `Activate v${s.version}` : needsConfirm ? 'Activate…' : 'Activate'
  const primaryActivate = s.approvedNow || s.status === 'draft'

  return (
    <section aria-label="Spec actions" className="space-y-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <Badge variant="secondary" className={cn('mt-0.5 shrink-0 capitalize', STATUS_STYLES[s.status])}>{s.status.replace('_', ' ')}</Badge>
          <p className="text-sm">{explain(s)}</p>
        </div>
        {s.canEdit && s.status !== 'superseded' && (
          <div className="flex shrink-0 flex-wrap gap-2">
            {(s.status === 'draft' || (s.status === 'in_review' && !s.openReview && !s.approvedNow)) && (
              <Button size="sm" variant="outline" onClick={openReviewRequest}><ClipboardCheck className="mr-1.5 h-4 w-4" />Request review</Button>
            )}
            {canActivate && (
              <Button size="sm" variant={primaryActivate ? 'default' : 'outline'} disabled={pending || !!blocked}
                onClick={() => (needsConfirm ? setConfirming(true) : move('active'))}>
                <Rocket className="mr-1.5 h-4 w-4" />{activateLabel}
              </Button>
            )}
            {s.status === 'archived'
              ? <Button size="sm" disabled={pending} onClick={() => move('draft')}><ArchiveRestore className="mr-1.5 h-4 w-4" />Restore to draft</Button>
              : <Button size="sm" variant="outline" onClick={() => openSpecEditor('revise')}><PenLine className="mr-1.5 h-4 w-4" />Edit</Button>}
            {s.status === 'active' && (
              <>
                <Button size="sm" variant="ghost" disabled={pending} onClick={() => move('archived')}><Archive className="mr-1.5 h-4 w-4" />Archive</Button>
                <Button size="sm" variant="ghost" onClick={() => openSpecEditor('supersede')} title="Replace this spec with a new one when the approach changes"><GitBranch className="mr-1.5 h-4 w-4" />Supersede</Button>
              </>
            )}
          </div>
        )}
      </div>
      {blocked && (
        <ActivationNotice tone="blocked" needs={s.needs}
          title={s.activation!.blockedByWorkflow ? 'This spec can’t be activated yet: the product uses a gated review workflow.' : 'Activation is blocked.'}
          otherReasons={s.activation!.blockedByWorkflow ? s.activation!.reasons.slice(1) : s.activation!.reasons} />
      )}
      {confirming && (
        <ActivationNotice tone="warning" needs={s.needs} pending={pending} onActivateAnyway={() => move('active')}
          title={`Activate without an approval? The product uses a ${s.activation?.level ?? 'guided'} review workflow.`} />
      )}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {s.canEdit && s.status !== 'superseded' && <p className="text-xs text-muted-foreground">Changing the status doesn’t create a new version; only revising the title or text does.</p>}
    </section>
  )
}
