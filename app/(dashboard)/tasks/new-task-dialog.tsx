'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Plus } from 'lucide-react'
import { createTaskAction } from '../actions'

const PRIORITIES = [
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
  { value: 'high', label: 'High' },
  { value: 'critical', label: 'Critical' },
] as const

type Plan = { id: string; title: string }

export function NewTaskDialog({ plans }: { plans: Plan[] }) {
  const [open, setOpen] = useState(false)
  const [planId, setPlanId] = useState(plans[0]?.id ?? '')
  const [priority, setPriority] = useState<string>('medium')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (!planId) { setError('Please select a code plan.'); return }
    setError(null)
    const fd = new FormData(e.currentTarget)
    fd.set('priority', priority)
    startTransition(async () => {
      try {
        await createTaskAction(planId, fd)
        setOpen(false)
        ;(e.target as HTMLFormElement).reset()
        setPriority('medium')
      } catch (err: unknown) {
        if (err instanceof Error) setError(err.message)
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>New Task</DialogTitle>
          <DialogDescription>Add a task to an existing code plan.</DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-2">
            <Label htmlFor="nt-plan">Code Plan <span className="text-destructive">*</span></Label>
            <Select value={planId} onValueChange={setPlanId}>
              <SelectTrigger id="nt-plan">
                <SelectValue placeholder="Select a plan" />
              </SelectTrigger>
              <SelectContent>
                {plans.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.title}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nt-title">Title <span className="text-destructive">*</span></Label>
            <Input id="nt-title" name="title" placeholder="e.g. Update login handler" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="nt-description">Description</Label>
            <Textarea id="nt-description" name="description" placeholder="What needs to be done?" rows={2} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="nt-priority">Priority</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="nt-priority">
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
              <Label htmlFor="nt-effort">
                Effort (hours)
                <span className="ml-1 text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input id="nt-effort" name="estimatedEffort" type="number" min="0.5" step="0.5" placeholder="e.g. 4" />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="nt-tags">
              Tags
              <span className="ml-2 text-xs text-muted-foreground">(comma-separated)</span>
            </Label>
            <Input id="nt-tags" name="tags" placeholder="auth, backend" />
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
