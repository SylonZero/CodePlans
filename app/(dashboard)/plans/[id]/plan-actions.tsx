'use client'

import { useEffect, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { RichTextField } from '@/components/rich-text-field'
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
import { Settings, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  activatePlanAction,
  completePlanAction,
  updateCodePlanAction,
  createTaskAction,
  deleteCodePlanAction,
} from '../../actions'
import type { CodePlanDetail } from '@/lib/db/queries'
import type { TeamMember } from '@/lib/types'
import { ActivationNotice, type ApprovalNeeds } from '@/components/activation-notice'

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

export type PlanActivation = { allowed: boolean; warning: string | null; reasons: string[]; blockedByWorkflow: boolean; level: string }

export function PlanStatusButtons({ plan, activation = null }: {
  plan: CodePlanDetail
  /** From checkActivation, for editors of a draft plan. Explained by PlanActivationNotice. */
  activation?: PlanActivation | null
}) {
  const [isPending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const activate = () => startTransition(async () => {
    setError(null)
    const res = await activatePlanAction(plan.id)
    if (res?.error) { setError(res.error); toast.error(res.error) }
  })
  const blocked = plan.status === 'draft' && !!activation && !activation.allowed
  const needsConfirm = plan.status === 'draft' && !blocked && !!activation?.warning

  return (
    <>
      {plan.status === 'draft' && (
        <Button disabled={isPending || blocked} onClick={() => (needsConfirm ? window.dispatchEvent(new CustomEvent('plan-activation:confirm')) : activate())}>
          {isPending ? 'Activating…' : needsConfirm ? 'Activate Plan…' : 'Activate Plan'}
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
      {error && <span role="alert" className="text-sm text-destructive">{error}</span>}
    </>
  )
}

/**
 * Under the plan's header: why activation is blocked (gated workflow or an
 * extension), or, after Activate in a guided workflow, the warning to confirm.
 */
export function PlanActivationNotice({ plan, activation, needs }: { plan: CodePlanDetail; activation: PlanActivation | null; needs: ApprovalNeeds }) {
  const [isPending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState(false)
  useEffect(() => {
    const open = () => setConfirming(true)
    window.addEventListener('plan-activation:confirm', open)
    return () => window.removeEventListener('plan-activation:confirm', open)
  }, [])
  if (plan.status !== 'draft' || !activation) return null
  const activate = () => startTransition(async () => {
    const res = await activatePlanAction(plan.id)
    if (res?.error) toast.error(res.error)
    else setConfirming(false)
  })
  if (!activation.allowed) {
    return <ActivationNotice tone="blocked" needs={needs}
      title={activation.blockedByWorkflow ? 'This plan can’t be activated yet: the product uses a gated review workflow.' : 'Activation is blocked.'}
      otherReasons={activation.blockedByWorkflow ? activation.reasons.slice(1) : activation.reasons} />
  }
  return confirming
    ? <ActivationNotice tone="warning" needs={needs} pending={isPending} onActivateAnyway={activate}
      title={`Activate without an approval? The product uses a ${activation.level} review workflow.`} />
    : null
}

export function DeletePlanButton({
  planId,
  planTitle,
  taskCount,
  targetAssetCount,
  linkedWorkItemCount,
}: {
  planId: string
  planTitle: string
  taskCount: number
  targetAssetCount: number
  linkedWorkItemCount: number
}) {
  const [isPending, startTransition] = useTransition()
  const parts: string[] = []
  if (taskCount > 0) parts.push(`${taskCount} task${taskCount === 1 ? '' : 's'}`)
  if (targetAssetCount > 0) parts.push(`${targetAssetCount} target asset${targetAssetCount === 1 ? '' : 's'}`)
  if (linkedWorkItemCount > 0) parts.push(`${linkedWorkItemCount} linked work item${linkedWorkItemCount === 1 ? '' : 's'}`)

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant="outline" size="icon" className="text-destructive hover:text-destructive">
          <Trash2 className="h-4 w-4" />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete &ldquo;{planTitle}&rdquo;?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently delete this plan{parts.length > 0 ? `, including ${parts.join(', ')}` : ''}. Linked
            work items are unlinked, not deleted. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            disabled={isPending}
            onClick={() => startTransition(async () => {
              const result = await deleteCodePlanAction(planId)
              if (result?.error) toast.error(result.error)
            })}
          >
            {isPending ? 'Deleting…' : 'Delete Plan'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
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
            <Label>Description</Label>
            <RichTextField name="description" defaultValue={plan.description} />
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
          <p className="text-sm text-muted-foreground">Manage linked specs in the plan’s Specs panel.</p>
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
            <Label>Description</Label>
            <RichTextField name="description" />
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
