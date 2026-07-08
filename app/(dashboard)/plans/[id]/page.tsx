import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getCodePlan, getTeamMembers, getWorkItems, getAssetOptions, getImpactedAssets } from '@/lib/db/queries'
import { PlanAssetsSection } from './plan-assets-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Calendar, Users, Clock, AlertCircle, CheckCircle2, Circle, Play } from 'lucide-react'
import type { CodePlanStatus, CodePlanType, TaskStatus } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { PlanStatusButtons, PlanEditSheet, AddTaskDialog } from './plan-actions'

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

const priorityStyles = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await authAdapter.getUser()
  if (!user) return null

  const plan = await getCodePlan(id, user.id)
  if (!plan) notFound()

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) })
  const [teamMembers, linkedItems, assetOptions, impactedAssets] = await Promise.all([
    profile?.organizationId ? getTeamMembers(profile.organizationId) : Promise.resolve([]),
    getWorkItems(user.id, { planId: id }),
    getAssetOptions(user.id),
    getImpactedAssets(id),
  ])
  const productAssetOptions = assetOptions
    .filter((a) => a.productId === plan.productId)
    .map((a) => ({ id: a.id, name: a.name }))

  const tasksByStatus = {
    not_started: plan.tasks.filter((t) => t.status === 'not_started'),
    in_progress: plan.tasks.filter((t) => t.status === 'in_progress'),
    done: plan.tasks.filter((t) => t.status === 'done'),
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/plans" className="hover:text-foreground transition-colors">Code Plans</Link>
        <span>/</span>
        <span className="text-foreground">{plan.title}</span>
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3 flex-wrap mb-2">
            <h1 className="text-2xl font-bold tracking-tight">{plan.title}</h1>
            <Badge variant="secondary" className={cn(typeStyles[plan.type])}>{typeLabels[plan.type]}</Badge>
            <Badge variant="secondary" className={cn(statusStyles[plan.status])}>{plan.status}</Badge>
          </div>
          <p className="text-muted-foreground mb-4">{plan.description}</p>
          <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
            <Link
              href={`/products/${plan.productSlug}`}
              className="font-medium text-foreground hover:text-accent transition-colors"
            >
              {plan.productName}
            </Link>
            {plan.startDate && plan.endDate && (
              <div className="flex items-center gap-1">
                <Calendar className="h-4 w-4" />
                <span>{formatDate(plan.startDate)} - {formatDate(plan.endDate)}</span>
              </div>
            )}
            {plan.deadline && (
              <div className="flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                <span>Due {formatDate(plan.deadline)}</span>
              </div>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <PlanEditSheet plan={plan} />
          <PlanStatusButtons plan={plan} />
        </div>
      </div>

      {/* Progress & Stats */}
      <div className="grid gap-6 md:grid-cols-4">
        <Card className="md:col-span-2 bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Overall Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-4">
              <span className="text-4xl font-bold">{plan.progress}%</span>
              <span className="text-sm text-muted-foreground mb-1">
                {plan.completedTaskCount} of {plan.taskCount} tasks
              </span>
            </div>
            <Progress value={plan.progress} className="h-2 mt-4" />
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Target Assets</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-2xl font-bold">{plan.targetAssets.length}</span>
            <div className="flex flex-wrap gap-1 mt-2">
              {plan.targetAssets.slice(0, 2).map((asset) => (
                <Badge key={asset.id} variant="outline" className="text-xs">{asset.name}</Badge>
              ))}
              {plan.targetAssets.length > 2 && (
                <Badge variant="outline" className="text-xs">+{plan.targetAssets.length - 2}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Assignees</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2">
              <div className="flex -space-x-2">
                {plan.assignees.slice(0, 3).map((u) => (
                  <Avatar key={u.id} className="h-8 w-8 border-2 border-card">
                    <AvatarFallback className="text-xs bg-accent text-accent-foreground">
                      {u.name.split(' ').map((n) => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                ))}
              </div>
              {plan.assignees.length > 3 && (
                <span className="text-sm text-muted-foreground">+{plan.assignees.length - 3}</span>
              )}
              {plan.assignees.length === 0 && (
                <span className="text-sm text-muted-foreground">Unassigned</span>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {plan.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {plan.tags.map((tag) => <Badge key={tag} variant="secondary">{tag}</Badge>)}
        </div>
      )}

      {/* Per-asset delivery: branch + PR per targeted asset */}
      <PlanAssetsSection planId={plan.id} planAssets={plan.planAssets} assetOptions={productAssetOptions} />

      {/* Impact analysis: assets that depend on this plan's targets */}
      {impactedAssets.length > 0 && (
        <Card className="bg-card border-border border-l-2 border-l-warning">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Impact Analysis — {impactedAssets.length} dependent asset{impactedAssets.length > 1 ? 's' : ''}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              These assets depend on what this plan changes. Review them for breakage and coordinate their owners.
            </p>
            <ul className="space-y-2">
              {impactedAssets.map((impacted) => (
                <li key={`${impacted.id}-${impacted.viaAssetId}`} className="flex items-center gap-2 text-sm flex-wrap">
                  <span className="font-medium">{impacted.name}</span>
                  <Badge variant="secondary" className="text-xs capitalize">{impacted.type}</Badge>
                  <span className="text-muted-foreground text-xs">
                    {impacted.dependencyType.replace('_', ' ')} → {impacted.viaAssetName}
                  </span>
                  {impacted.health !== 'healthy' && (
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs capitalize',
                        impacted.health === 'critical' ? 'bg-destructive/20 text-destructive' : 'bg-warning/20 text-warning',
                      )}
                    >
                      {impacted.health}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Linked work items — what this plan delivers or fixes */}
      {linkedItems.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Linked Work Items ({linkedItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {linkedItems.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link
                    href={`/work-items?item=${item.id}`}
                    className="min-w-0 text-sm font-medium truncate hover:text-accent transition-colors"
                  >
                    {item.title}
                  </Link>
                  <div className="flex items-center gap-2 shrink-0">
                    <Badge variant="secondary" className="text-xs capitalize">
                      {item.type.replace('_', ' ')}
                    </Badge>
                    <Badge variant="outline" className="text-xs capitalize">
                      {item.status.replace('_', ' ')}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Tasks */}
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Tasks</h2>
          <AddTaskDialog plan={plan} teamMembers={teamMembers} />
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((status) => {
            const statusTasks = tasksByStatus[status]
            const labels = { not_started: 'Not Started', in_progress: 'In Progress', done: 'Done' }
            const icons = { not_started: Circle, in_progress: Play, done: CheckCircle2 }
            const iconStyles = { not_started: 'text-muted-foreground', in_progress: 'text-chart-1', done: 'text-accent' }
            const badgeStyles = { not_started: '', in_progress: 'bg-chart-1/20 text-chart-1', done: 'bg-accent/20 text-accent' }
            const StatusIcon = icons[status]

            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-4">
                  <StatusIcon className={cn('h-4 w-4', iconStyles[status])} />
                  <h3 className="font-medium">{labels[status]}</h3>
                  <Badge variant="secondary" className={cn('text-xs', badgeStyles[status])}>
                    {statusTasks.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {statusTasks.slice(0, status === 'done' ? 5 : undefined).map((task) => (
                    <Card
                      key={task.id}
                      className={cn(
                        'bg-card border-border',
                        status === 'in_progress' && 'border-l-2 border-l-chart-1',
                        status === 'done' && 'opacity-75'
                      )}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <span className={cn('font-medium text-sm', status === 'done' && 'line-through text-muted-foreground')}>
                            {task.title}
                          </span>
                          {status !== 'done' && (
                            <Badge variant="secondary" className={cn('text-xs shrink-0', priorityStyles[task.priority])}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-between">
                          <div />
                          {(task.estimatedEffort || task.actualEffort) && (
                            <div className="flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {task.actualEffort ?? task.estimatedEffort}h
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                  {status === 'done' && statusTasks.length > 5 && (
                    <p className="text-sm text-muted-foreground text-center py-2">
                      +{statusTasks.length - 5} more completed
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
