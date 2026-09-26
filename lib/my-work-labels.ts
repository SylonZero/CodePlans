// Display labels shared by the My Work data layer and its client components.

export type Lens = 'developer' | 'code_owner' | 'architect' | 'eng_manager'

export const LENS_LABELS: Record<Lens, string> = { developer: 'Developer', code_owner: 'Code owner', architect: 'Architect', eng_manager: 'Eng manager' }

const REASON_TEXT: Record<string, string> = {
  architect: 'architect', code_owner: 'code owner', eng_manager: 'eng manager', requested: 'reviewer', reviewer: 'reviewer',
  mentioned: 'mentioned', thread: 'in thread', author: 'author', plan_owner: 'plan owner', owner: 'owner', reporter: 'reporter',
  assignee: 'assignee', requester: 'requested review', approver: 'approved earlier', contributor: 'contributor',
}

/** "code_owner:API Gateway" → "code owner · API Gateway". */
export function reasonLabel(reason: string) {
  const [head, rest] = reason.split(':')
  const base = REASON_TEXT[head] ?? head.replace('_', ' ')
  return rest ? `${base} · ${rest}` : base
}
