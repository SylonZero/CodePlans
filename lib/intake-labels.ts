// Display labels for external intake (client-safe; the rules live in lib/db/intake.ts).
export const TRIAGE_LABELS: Record<string, string> = {
  untriaged: 'Untriaged',
  accepted: 'Accepted',
  needs_info: 'Needs info',
  declined: 'Declined',
}

export const DECLINE_REASON_LABELS: Record<string, string> = {
  already_shipped: 'Already shipped',
  question: 'Question',
  question_answered: 'Question answered',
  duplicate: 'Duplicate',
  out_of_scope: 'Out of scope',
  cannot_reproduce: "Can't reproduce",
  show_and_tell: 'Show and tell',
  spam: 'Spam',
}
