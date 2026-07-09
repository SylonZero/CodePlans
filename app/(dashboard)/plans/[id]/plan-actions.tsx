'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Settings, Plus } from 'lucide-react'
import {
  activatePlanAction,
  completePlanAction,
  updateCodePlanAction,
  createTaskAction,
} from '../../actions'
import type { CodePlanDetail } from '@/lib/db/queries'
import type { TeamMember } from '@/lib/types'

const PLAN_TYPES = [
  { value: 'feature', label: 'Feature' },
  { value: 'refactor', label: 'Refactor' },
  { value: 'improvement', label: 'Improvement' },
  { value: 'bugfix', label: 'Bug Fix' },
] as const

const PRIORITIES = [
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

interface Props {
  plan: CodePlanDetail
  teamMembers: TeamMember[]
}

export function PlanStatusButtons({ plan }: { plan: CodePlanDetail }) {
  const [isPending, startTransition] = useTransition()

  return (
    <>
      {plan.status === 'draft' && (
        <Button
          disabled={isPending}
          onClick={() => startTransition(() => activatePlanAction(plan.id))}
        >
          {isPending ? 'Activating…' : 'Activate Plan'}
        </Button>
      )}
      {plan.status === 'active' && (
        <Button
          variant="secondary"
          disabled={isPending}
          onClick={() => startTransition(() => completePlanAction(plan.id))}
        >
          {isPending ? 'Completing…' : 'Mark Complete'}
        </Button>
      )}
    </>
  )
}

export function PlanEditSheet({ plan, members = [] }: { plan: CodePlanDetail; members?: { id: string; name: string }[] }) {
  const [ownerId, setOwnerId] = useState<string>(plan.ownerId ?? 'none')
  const [open, setOpen] = useState(false)
  const [type, setType] = useState(plan.type)
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('type', type)
    startTransition(async () => {
      try {
        await updateCodePlanAction(plan.id, fd)
        setOpen(false)
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">
          <Settings className="mr-2 h-4 w-4" />
          Edit
        </Button>
      </SheetTrigger>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Edit Plan</SheetTitle>
          <SheetDescription>Update the plan details.</SheetDescription>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="space-y-4 px-4 pb-4">
          <div className="space-y-2">
            <Label htmlFor="edit-title">Title <span className="text-destructive">*</span></Label>
            <Input id="edit-title" name="title" defaultValue={plan.title} required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" name="description" defaultValue={plan.description} rows={3} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="edit-type">Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as typeof plan.type)}>
                <SelectTrigger id="edit-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PLAN_TYPES.map((t) => (
                    <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-deadline">Deadline</Label>
              <Input
                id="edit-deadline"
                name="deadline"
                type="date"
                defaultValue={plan.deadline ? plan.deadline.slice(0, 10) : ''}
              />
            </div>
          </div>
          <input type="hidden" name="ownerId" value={ownerId === 'none' ? '' : ownerId} />
          {members.length > 0 && (
            <div className="space-y-2">
              <Label>Owner</Label>
              <Select value={ownerId} onValueChange={setOwnerId}>
                <SelectTrigger><SelectValue placeholder="Unowned" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unowned</SelectItem>
                  {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="edit-spec">
              Spec URL
              <span className="ml-1 text-xs text-muted-foreground">(markdown in your repo, optional)</span>
            </Label>
            <Input
              id="edit-spec"
              name="specUrl"
              type="url"
              defaultValue={plan.specUrl ?? ''}
              placeholder="https://github.com/org/repo/blob/main/docs/specs/my-plan.md"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="edit-tags" name="tags" defaultValue={plan.tags.join(', ')} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  )
}

export function AddTaskDialog({ plan, teamMembers }: Props) {
  const [open, setOpen] = useState(false)
  const [priority, setPriority] = useState<string>('medium')
  const [assigneeId, setAssigneeId] = useState<string>('none')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('priority', priority)
    fd.set('assigneeId', assigneeId === 'none' ? '' : assigneeId)
    startTransition(async () => {
      try {
        await createTaskAction(plan.id, fd)
        setOpen(false)
        ;(e.target as HTMLFormElement).reset()
        setPriority('medium')
        setAssigneeId('none')
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-2 h-4 w-4" />
          Add Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Add Task</DialogTitle>
          <DialogDescription>Add a task to <span className="font-medium">{plan.title}</span>.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="task-title">Title <span className="text-destructive">*</span></Label>
            <Input id="task-title" name="title" placeholder="e.g. Update login handler" required />
          </div>
          <div className="space-y-2">
            <Label htmlFor="task-description">Description</Label>
            <Textarea id="task-description" name="description" placeholder="What needs to be done?" rows={2} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="task-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="task-priority">
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
              <Label htmlFor="task-effort">
                Effort (hours)
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="task-effort" name="estimatedEffort" type="number" min="0.5" step="0.5" placeholder="e.g. 4" />
            </div>
          </div>
          {teamMembers.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="task-assignee">Assignee</Label>
              <Select value={assigneeId} onValueChange={setAssigneeId}>
                <SelectTrigger id="task-assignee">
                  <SelectValue placeholder="Unassigned" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Unassigned</SelectItem>
                  {teamMembers.map((m) => (
                    <SelectItem key={m.userId} value={m.userId}>{m.user.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="task-tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="task-tags" name="tags" placeholder="auth, backend" />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <DialogFooter className="pt-2">
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? 'Adding…' : 'Add Task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
