'use client'

import { useState, useTransition } from 'react'
import { formatDistanceToNow } from 'date-fns'
import { ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { TRIAGE_LABELS, DECLINE_REASON_LABELS } from '@/lib/intake-labels'
import type { WorkItemWithContext } from '@/lib/db/queries'
import type { WorkItemStatus } from '@/lib/types'
import { triageWorkItemAction } from '../actions'

type State = 'untriaged' | 'accepted' | 'needs_info' | 'declined'

export const triageStyles: Record<State, string> = {
  untriaged: 'border-amber-500/50 text-amber-700 dark:text-amber-300',
  accepted: 'border-emerald-500/50 text-emerald-700 dark:text-emerald-300',
  needs_info: 'border-sky-500/50 text-sky-700 dark:text-sky-300',
  declined: 'border-border text-muted-foreground',
}

/**
 * Where an outside report came from and the team's decision on it. Status
 * follows the decision: declining closes the item as won't-do, and moving a
 * declined item to another state reopens it.
 */
export function TriageBlock({ item, onStatusChange }: { item: WorkItemWithContext; onStatusChange: (status: WorkItemStatus) => void }) {
  const [pending, startTransition] = useTransition()
  const [state, setState] = useState<State>((item.triageState ?? 'untriaged') as State)
  const [declining, setDeclining] = useState(false)
  const [reason, setReason] = useState<string>('')
  const [note, setNote] = useState('')

  function decide(next: State, extra: { declineReason?: string; note?: string } = {}) {
    startTransition(async () => {
      const result = await triageWorkItemAction(item.id, { state: next, declineReason: extra.declineReason as never, note: extra.note })
      if ('error' in result) {
        toast.error(result.error)
        return
      }
      setState(next)
      setDeclining(false)
      onStatusChange(result.status as WorkItemStatus)
      toast.success(next === 'declined' ? 'Declined' : `Marked ${TRIAGE_LABELS[next].toLowerCase()}`)
    })
  }

  const decidedBy = item.triagedByName ?? (item.triagedByKind === 'agent' ? 'an agent' : null)
  return (
    <section aria-label="External report" className="mx-4 space-y-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">External report</span>
        <Badge variant="outline" className={cn('text-xs', triageStyles[state])}>{TRIAGE_LABELS[state]}</Badge>
        {item.externalState && (
          <Badge variant="outline" className="text-xs text-muted-foreground">{item.externalState} upstream</Badge>
        )}
      </div>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-muted-foreground">
        {item.externalUrl ? (
          <a href={item.externalUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-foreground hover:text-accent">
            {item.externalKey} <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <span className="font-mono text-xs text-foreground">{item.externalKey}</span>
        )}
        {item.externalAuthor && <span>reported by {item.externalAuthor}</span>}
      </p>

      {state !== 'untriaged' && item.triageState === state && item.triagedAt && (
        <p className="text-xs text-muted-foreground">
          {TRIAGE_LABELS[state]}
          {state === 'declined' && item.declineReason ? ` as ${DECLINE_REASON_LABELS[item.declineReason]?.toLowerCase() ?? item.declineReason}` : ''}
          {decidedBy ? ` by ${decidedBy}` : ''} {formatDistanceToNow(new Date(item.triagedAt), { addSuffix: true })}
          {item.triageNote ? <>: <span className="text-foreground">{item.triageNote}</span></> : null}
        </p>
      )}

      {declining ? (
        <div className="space-y-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Reason</Label>
            <Select value={reason} onValueChange={setReason}>
              <SelectTrigger aria-label="Decline reason"><SelectValue placeholder="Choose a reason" /></SelectTrigger>
              <SelectContent>
                {Object.entries(DECLINE_REASON_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="triage-note" className="text-xs">Why</Label>
            <Textarea id="triage-note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Fixed on main in e88a71e" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" disabled={pending || !reason || !note.trim()} onClick={() => decide('declined', { declineReason: reason, note })}>Decline</Button>
            <Button size="sm" variant="ghost" disabled={pending} onClick={() => setDeclining(false)}>Cancel</Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {state !== 'accepted' && <Button size="sm" variant="outline" disabled={pending} onClick={() => decide('accepted')}>Accept</Button>}
          {state !== 'needs_info' && <Button size="sm" variant="outline" disabled={pending} onClick={() => decide('needs_info')}>Needs info</Button>}
          {state !== 'declined' && <Button size="sm" variant="outline" disabled={pending} onClick={() => setDeclining(true)}>Decline…</Button>}
          {state !== 'untriaged' && <Button size="sm" variant="ghost" disabled={pending} onClick={() => decide('untriaged')}>Reset to untriaged</Button>}
        </div>
      )}
    </section>
  )
}
