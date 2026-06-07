'use client'

import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Button } from '@/components/ui/button'
import { ArrowRight, Calendar, Users } from 'lucide-react'
import type { CodePlanStatus, CodePlanType } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'

type Plan = {
  id: string
  title: string
  type: CodePlanType
  status: CodePlanStatus
  productName?: string
  deadline?: string
  assigneeIds: string[]
  progress: number
  taskCount: number
  completedTaskCount: number
}

const statusStyles: Record<CodePlanStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-chart-1/20 text-chart-1',
  completed: 'bg-accent/20 text-accent',
  cancelled: 'bg-destructive/20 text-destructive',
}

const typeLabels: Record<CodePlanType, string> = {
  refactor: 'Refactor',
  feature: 'Feature',
  improvement: 'Improvement',
  bugfix: 'Bug Fix',
}

const typeStyles: Record<CodePlanType, string> = {
  refactor: 'bg-chart-2/20 text-chart-2',
  feature: 'bg-chart-4/20 text-chart-4',
  improvement: 'bg-chart-1/20 text-chart-1',
  bugfix: 'bg-chart-5/20 text-chart-5',
}

export function PlansOverview({ plans }: { plans: Plan[] }) {
  const activePlans = plans
    .filter((plan) => plan.status === 'active')
    .sort((a, b) => b.progress - a.progress)
    .slice(0, 5)

  return (
    <Card className="bg-card border-border">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base font-semibold">Active Code Plans</CardTitle>
        <Button variant="ghost" size="sm" asChild>
          <Link href="/plans" className="flex items-center gap-1 text-sm text-muted-foreground">
            View all
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {activePlans.map((plan) => (
          <Link
            key={plan.id}
            href={`/plans/${plan.id}`}
            className="block rounded-lg border border-border bg-muted/30 p-4 transition-colors hover:bg-muted/50"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-medium truncate">{plan.title}</h3>
                  <Badge variant="secondary" className={cn('text-xs', typeStyles[plan.type])}>
                    {typeLabels[plan.type]}
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-muted-foreground truncate">{plan.productName}</p>
              </div>
              <Badge variant="secondary" className={cn('shrink-0', statusStyles[plan.status])}>
                {plan.status}
              </Badge>
            </div>

            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Progress</span>
                <span>{plan.completedTaskCount} / {plan.taskCount} tasks</span>
              </div>
              <Progress value={plan.progress} className="h-1.5" />
            </div>

            <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
              {plan.deadline && (
                <div className="flex items-center gap-1">
                  <Calendar className="h-3 w-3" />
                  <span>Due {formatDate(plan.deadline)}</span>
                </div>
              )}
              {plan.assigneeIds.length > 0 && (
                <div className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  <span>{plan.assigneeIds.length} assignee{plan.assigneeIds.length > 1 ? 's' : ''}</span>
                </div>
              )}
            </div>
          </Link>
        ))}

        {activePlans.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <p>No active code plans</p>
            <Button variant="outline" size="sm" className="mt-2" asChild>
              <Link href="/plans/new">Create your first plan</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
