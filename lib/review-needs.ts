// What an approval of a spec or plan still needs, for the activation notice.
// Shared by server pages (which compute it) and the client notice (which shows it).
import type { ReviewSummary } from '@/lib/db/reviews'
import type { ReviewReason } from '@/lib/db/schema.sqlite'

export type ApprovalNeeds = {
  version: number
  lastApprovedVersion: number | null
  /** Required reviewers still to approve on the open review, or who a request would ask. */
  reviewers: { name: string; reason: ReviewReason }[]
  openReview: boolean
  /** Nobody else can review, so requesting a review makes the viewer the reviewer. */
  selfReview: boolean
}

export function approvalNeeds(summary: ReviewSummary): ApprovalNeeds {
  const current = summary.current
  let reviewers: ApprovalNeeds['reviewers']
  if (current) {
    const undecided = current.participants.filter((p) => p.decision !== 'approved' || p.outdated)
    const required = undecided.filter((p) => p.required)
    reviewers = (required.length ? required : undecided).map((p) => ({ name: p.name, reason: p.reason }))
  } else {
    reviewers = summary.suggestions.filter((s) => s.required).map((s) => ({ name: s.name, reason: s.reason }))
  }
  return { version: summary.currentVersion, lastApprovedVersion: summary.lastApprovedVersion, reviewers, openReview: !!current, selfReview: summary.viewer.alone }
}

