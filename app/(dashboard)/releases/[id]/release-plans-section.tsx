'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { attachPlanToReleaseAction, detachPlanFromReleaseAction } from '../../actions'
import type { ReleasePlanRow } from '@/lib/db/queries'
import type { CodePlanStatus } from '@/lib/types'

const planStatusStyles: Record<CodePlanStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-chart-1/20 text-chart-1',
  completed: 'bg-accent/20 text-accent',
  cancelled: 'bg-destructive/20 text-destructive',
}

type AttachablePlan = { id: string; title: string; status: CodePlanStatus }

export function ReleasePlansSection({
  releaseId,
  plans,
  attachable,
  editable,
}: {
  releaseId: string
  plans: ReleasePlanRow[]
  attachable: AttachablePlan[]
  editable: boolean
}) {
  const [selected, setSelected] = useState('')
  const [isPending, startTransition] = useTransition()

  const attach = () => {
    if (!selected) return
    startTransition(async () => {
      await attachPlanToReleaseAction(selected, releaseId)
      setSelected('')
    })
  }

  const detach = (planId: string) =>
    startTransition(async () => {
      await detachPlanFromReleaseAction(planId, releaseId)
    })

  return (
    <div className="space-y-4">
      {editable && attachable.length > 0 && (
        <div className="flex items-center gap-2">
          <Select value={selected} onValueChange={setSelected}>
            <SelectTrigger className="w-72">
              <SelectValue placeholder="Attach a plan…" />
            </SelectTrigger>
            <SelectContent>
              {attachable.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" onClick={attach} disabled={!selected || isPending}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            Attach
          </Button>
        </div>
      )}

      {plans.length === 0 ? (
        <Card className="bg-card border-border">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            No plans attached. Attach the plans that ship in this release — their work items become the
            release notes.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {plans.map((plan) => {
            const progress =
              plan.taskCount > 0 ? Math.round((plan.completedTaskCount / plan.taskCount) * 100) : 0
            return (
              <Card key={plan.planId} className="bg-card border-border">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2 min-w-0">
                      <Link
                        href={`/plans/${plan.planId}`}
                        className="text-sm font-medium truncate hover:text-accent transition-colors"
                      >
                        {plan.title}
                      </Link>
                      <Badge variant="secondary" className={cn('text-xs', planStatusStyles[plan.status])}>
                        {plan.status}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {plan.completedTaskCount}/{plan.taskCount} tasks
                      </span>
                      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${progress}%` }} />
                      </div>
                      {editable && (
                        <Button size="sm" variant="ghost" onClick={() => detach(plan.planId)} disabled={isPending}>
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
