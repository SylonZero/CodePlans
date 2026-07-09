'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Trash2, ArrowUpRight, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { createTaskAction, updateTaskAction, deleteTaskAction } from '../actions'

export type TaskRow = {
  id: string
  codePlanId: string
  title: string
  description: string
  tags: string[]
  status: TaskStatus
  priority: 'low' | 'medium' | 'high' | 'critical'
  estimatedEffort?: number
  actualEffort?: number
  assigneeId?: string
  startDate?: string
  endDate?: string
  source?: string
  externalKey?: string
  externalUrl?: string
  planTitle: string
  assetName: string | null
  assigneeName: string | null
}

export type PlanOption = { id: string; title: string }
export type MemberOption = { id: string; name: string }

const STATUSES = [
  { value: 'not_started', label: 'Not Started' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
] as const

const PRIORITIES = [
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

const priorityStyles = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const statusStyles: Record<TaskStatus, string> = {
  not_started: 'bg-muted text-muted-foreground',
  in_progress: 'bg-chart-1/20 text-chart-1',
  done: 'bg-accent/20 text-accent',
}

type TaskPanelProps = {
  open: boolean
  mode: 'create' | 'view'
  task: TaskRow | null
  plans: PlanOption[]
  members: MemberOption[]
  onClose: () => void
}

export function TaskPanel({ open, mode, task, plans, members, onClose }: TaskPanelProps) {
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        {mode === 'create' ? (
          <>
            <SheetHeader>
              <SheetTitle>New Task</SheetTitle>
              <SheetDescription>Add a task to an existing code plan.</SheetDescription>
            </SheetHeader>
            <TaskForm plans={plans} members={members} onDone={onClose} />
          </>
        ) : task ? (
          <TaskEditor key={task.id} task={task} members={members} onDeleted={onClose} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

function TaskEditor({ task, members, onDeleted }: { task: TaskRow; members: MemberOption[]; onDeleted: () => void }) {
  const [isPending, startTransition] = useTransition()
  const formRef = useRef<HTMLFormElement>(null)
  const [status, setStatus] = useState<string>(task.status)
  const [priority, setPriority] = useState<string>(task.priority)
  const [assigneeId, setAssigneeId] = useState<string>(task.assigneeId ?? 'none')
  const lastSaved = useRef<string>('')

  // Baseline the dirty-check on mount: focusing/blurring without edits must not save.
  useEffect(() => {
    const form = formRef.current
    if (form) lastSaved.current = JSON.stringify([...new FormData(form).entries()])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isMirrored = !!task.source && task.source !== 'native'

  function commit(overrides: Record<string, string> = {}) {
    const form = formRef.current
    if (!form) return
    const fd = new FormData(form)
    fd.set('status', overrides.status ?? status)
    fd.set('priority', overrides.priority ?? priority)
    const a = overrides.assigneeId ?? assigneeId
    fd.set('assigneeId', a === 'none' ? '' : a)
    const isSelectChange = Object.keys(overrides).length > 0
    const snapshot = JSON.stringify([...new FormData(form).entries()])
    if (!isSelectChange && snapshot === lastSaved.current) return
    lastSaved.current = snapshot
    startTransition(async () => {
      await updateTaskAction(task.id, fd)
      toast.success('Saved')
    })
  }

  function handleDelete() {
    startTransition(async () => {
      await deleteTaskAction(task.id, task.codePlanId)
      onDeleted()
    })
  }

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2 pr-8 flex-wrap">
          <Select value={status} onValueChange={(v) => { setStatus(v); commit({ status: v }) }} disabled={isMirrored}>
            <SelectTrigger className={cn('h-7 w-auto gap-1 border-none text-xs', statusStyles[status as TaskStatus])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={priority} onValueChange={(v) => { setPriority(v); commit({ priority: v }) }}>
            <SelectTrigger className={cn('h-7 w-auto gap-1 border-none text-xs capitalize', priorityStyles[priority as keyof typeof priorityStyles])}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          {isMirrored && (
            <Badge variant="outline" className="text-xs capitalize">
              {task.source}{task.externalKey ? ` · ${task.externalKey}` : ''}
            </Badge>
          )}
        </div>
        <SheetTitle className="sr-only">{task.title}</SheetTitle>
        <SheetDescription asChild>
          <span className="flex items-center gap-3">
            <Link href={`/plans/${task.codePlanId}`} className="flex items-center gap-1 hover:text-accent transition-colors w-fit">
              {task.planTitle}
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Link>
            {task.externalUrl && (
              <a href={task.externalUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-accent transition-colors w-fit">
                View in {task.source}
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </span>
        </SheetDescription>
      </SheetHeader>

      {/* Auto-save: selects commit on change, inputs commit on blur */}
      <form ref={formRef} onBlur={() => commit()} onSubmit={(e) => e.preventDefault()} className="space-y-4 px-4">
        <Input name="title" defaultValue={task.title} disabled={isMirrored} className="font-medium" aria-label="Title" />
        <Textarea name="description" defaultValue={task.description} disabled={isMirrored} rows={3} placeholder="Description" aria-label="Description" />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="te-start" className="text-xs">Start date</Label>
            <Input id="te-start" name="startDate" type="date" defaultValue={task.startDate?.slice(0, 10) ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te-end" className="text-xs">End date</Label>
            <Input id="te-end" name="endDate" type="date" defaultValue={task.endDate?.slice(0, 10) ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te-est" className="text-xs">Estimated (h)</Label>
            <Input id="te-est" name="estimatedEffort" type="number" min="0.5" step="0.5" defaultValue={task.estimatedEffort ?? ''} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="te-act" className="text-xs">Actual (h)</Label>
            <Input id="te-act" name="actualEffort" type="number" min="0.5" step="0.5" defaultValue={task.actualEffort ?? ''} />
          </div>
        </div>
        {members.length > 0 && (
          <div className="space-y-1.5">
            <Label className="text-xs">Assignee</Label>
            <Select value={assigneeId} onValueChange={(v) => { setAssigneeId(v); commit({ assigneeId: v }) }}>
              <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Unassigned</SelectItem>
                {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-1.5">
          <Label htmlFor="te-tags" className="text-xs">Tags (comma-separated)</Label>
          <Input id="te-tags" name="tags" defaultValue={task.tags.join(', ')} disabled={isMirrored} />
        </div>
        {task.assetName && (
          <p className="text-xs text-muted-foreground">Asset: {task.assetName}</p>
        )}
        <p className="text-xs text-muted-foreground">{isPending ? 'Saving…' : 'Changes save automatically'}</p>
      </form>

      <SheetFooter className="flex-row justify-end gap-2">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="outline" size="sm" className="text-destructive hover:text-destructive">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete task?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently delete &ldquo;{task.title}&rdquo;. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} disabled={isPending} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                {isPending ? 'Deleting…' : 'Delete'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetFooter>
    </>
  )
}

function TaskForm({
  task,
  plans,
  members,
  onDone,
}: {
  task?: TaskRow
  plans: PlanOption[]
  members: MemberOption[]
  onDone: () => void
}) {
  const isEdit = !!task
  const [planId, setPlanId] = useState(task?.codePlanId ?? plans[0]?.id ?? '')
  const [status, setStatus] = useState<string>(task?.status ?? 'not_started')
  const [priority, setPriority] = useState<string>(task?.priority ?? 'medium')
  const [assigneeId, setAssigneeId] = useState<string>(task?.assigneeId ?? 'none')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!isEdit && !planId) { setError('Please select a code plan.'); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('priority', priority)
    fd.set('assigneeId', assigneeId === 'none' ? '' : assigneeId)
    if (isEdit) fd.set('status', status)
    startTransition(async () => {
      try {
        if (isEdit) {
          await updateTaskAction(task.id, fd)
        } else {
          await createTaskAction(planId, fd)
        }
        onDone()
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
      {!isEdit && (
        <div className="space-y-2">
          <Label htmlFor="tp-plan">Code Plan <span className="text-destructive">*</span></Label>
          <Select value={planId} onValueChange={setPlanId}>
            <SelectTrigger id="tp-plan">
              <SelectValue placeholder="Select a plan" />
            </SelectTrigger>
            <SelectContent>
              {plans.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tp-title">Title <span className="text-destructive">*</span></Label>
        <Input id="tp-title" name="title" defaultValue={task?.title} placeholder="e.g. Update login handler" required />
      </div>

      <div className="space-y-2">
        <Label htmlFor="tp-description">Description</Label>
        <Textarea
          id="tp-description"
          name="description"
          defaultValue={task?.description}
          placeholder="What needs to be done?"
          rows={3}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="tp-status">Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger id="tp-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className="space-y-2">
          <Label htmlFor="tp-priority">Priority</Label>
          <Select value={priority} onValueChange={setPriority}>
            <SelectTrigger id="tp-priority">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PRIORITIES.map((p) => (
                <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label htmlFor="tp-effort">
            Effort (hours)
            <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="tp-effort"
            name="estimatedEffort"
            type="number"
            min="0.5"
            step="0.5"
            defaultValue={task?.estimatedEffort ?? ''}
            placeholder="e.g. 4"
          />
        </div>
        {isEdit && (
          <div className="space-y-2">
            <Label htmlFor="tp-actual-effort">
              Actual (hours)
              <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="tp-actual-effort"
              name="actualEffort"
              type="number"
              min="0.5"
              step="0.5"
              defaultValue={task?.actualEffort ?? ''}
              placeholder="e.g. 6"
            />
          </div>
        )}
      </div>

      {members.length > 0 && (
        <div className="space-y-2">
          <Label htmlFor="tp-assignee">Assignee</Label>
          <Select value={assigneeId} onValueChange={setAssigneeId}>
            <SelectTrigger id="tp-assignee">
              <SelectValue placeholder="Unassigned" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Unassigned</SelectItem>
              {members.map((m) => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="tp-tags">
          Tags
          <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
        </Label>
        <Input id="tp-tags" name="tags" defaultValue={task?.tags.join(', ')} placeholder="auth, backend" />
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onDone}>Cancel</Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Task'}
        </Button>
      </div>
    </form>
  )
}
