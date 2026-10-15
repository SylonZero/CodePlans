'use client'

import { ClipboardCheck, Lock, TriangleAlert } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { REASON_LABELS } from '@/components/review-panel'
import type { ApprovalNeeds } from '@/lib/review-needs'

export type { ApprovalNeeds }

/** Opens the review panel's request form on this page, or on the plan's Overview tab when it isn't shown. */
export function requestReviewHere() {
  if (document.getElementById('review')) window.dispatchEvent(new CustomEvent('review:request'))
  else window.location.assign(`${window.location.pathname}?tab=overview#request-review`)
}

/**
 * The one explanation of a review-workflow block or warning, used for activating
 * a spec or plan and for starting a plan's tasks: what's missing, who would
 * approve it, and the next step.
 */
export function ActivationNotice({ tone, title, needs, otherReasons = [], onActivateAnyway, pending, className }: {
  tone: 'blocked' | 'warning'
  title: string
  needs: ApprovalNeeds
  /** Reasons an extension gave, shown after the workflow's own. */
  otherReasons?: string[]
  /** Guided workflow: let the user go ahead after reading the warning. */
  onActivateAnyway?: () => void
  pending?: boolean
  className?: string
}) {
  const facts = [
    `Needs an approval covering v${needs.version}`,
    needs.lastApprovedVersion ? `last approved v${needs.lastApprovedVersion}` : 'not approved yet',
  ]
  if (needs.selfReview) facts.push('you are the only member who can review it, so you can approve it yourself')
  else if (needs.reviewers.length) {
    facts.push(`${needs.openReview ? 'waiting on' : 'required'}: ${needs.reviewers.map((r) => `${r.name} (${REASON_LABELS[r.reason]})`).join(', ')}`)
  } else if (!needs.openReview) facts.push('no required reviewer is assigned; choose who reviews it')
  const Icon = tone === 'blocked' ? Lock : TriangleAlert
  return (
    <div role={tone === 'blocked' ? 'alert' : 'status'} className={cn('flex w-full flex-col gap-3 rounded-md border px-3 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between',
      tone === 'blocked' ? 'border-destructive/40 bg-destructive/10' : 'border-warning/40 bg-warning/10', className)}>
      <div className="flex min-w-0 items-start gap-2">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone === 'blocked' ? 'text-destructive' : 'text-warning')} />
        <div className="min-w-0 space-y-0.5">
          <p className="font-medium">{title}</p>
          <p className="text-muted-foreground">{facts.join(' · ')}.</p>
          {otherReasons.map((r) => <p key={r} className="text-muted-foreground">{r}</p>)}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Button size="sm" variant={onActivateAnyway ? 'outline' : 'default'} onClick={requestReviewHere}>
          <ClipboardCheck className="mr-1.5 h-4 w-4" />{needs.openReview ? 'Go to review' : 'Request review'}
        </Button>
        {onActivateAnyway && <Button size="sm" disabled={pending} onClick={onActivateAnyway}>Activate anyway</Button>}
      </div>
    </div>
  )
}
