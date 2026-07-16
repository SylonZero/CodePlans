import Link from 'next/link'
import { authAdapter } from '@/lib/auth'
import { getTasks, getCodePlans, getWorkItems, getOwnedAssets } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Circle, Play, CheckSquare, FileCode2, ClipboardList, CalendarClock, Box } from 'lucide-react'
import { cn, formatDateShort } from '@/lib/utils'

const priorityStyles: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

export default async function MyWorkPage() {
  const user = await authAdapter.getUser()
  if (!user) return null
  const scope = await getProductScope()

  const [allMyTasks, plans, items, ownedAssets] = await Promise.all([
    getTasks(user.id, { assigneeId: user.id, productId: scope ?? undefined }),
    getCodePlans(user.id, { productId: scope ?? undefined }),
    getWorkItems(user.id, { productId: scope ?? undefined }),
    getOwnedAssets(user.id),
  ])

  const myTasks = allMyTasks
    .filter((t) => t.status !== 'done')
    .sort((a, b) => (a.endDate ?? '9999') < (b.endDate ?? '9999') ? -1 : 1)
  const myPlans = plans.filter((p) => p.ownerId === user.id && p.status !== 'completed' && p.status !== 'cancelled')
  const myItems = items.filter(
    (i) => i.ownerId === user.id && ['open', 'planned', 'in_progress'].includes(i.status),
  )
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Work</h1>
        <p className="text-muted-foreground">
          What&apos;s assigned to you and what you own — the personal slice of the workspace
        </p>
      </div>

      {/* My open tasks */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <CheckSquare className="h-4 w-4" />
            My Open Tasks ({myTasks.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {myTasks.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing assigned to you right now.</p>
          ) : (
            <ul className="divide-y divide-border">
              {myTasks.slice(0, 25).map((task) => (
                <li key={task.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="flex items-center gap-2 min-w-0">
                    {task.status === 'in_progress'
                      ? <Play className="h-4 w-4 shrink-0 text-chart-1" />
                      : <Circle className="h-4 w-4 shrink-0 text-muted-foreground" />}
                    <div className="min-w-0">
                      <Link href={`/tasks?task=${task.id}`} className="text-sm font-medium truncate block hover:text-accent transition-colors">
                        {task.title}
                      </Link>
                      <Link href={`/plans/${task.codePlanId}`} className="text-xs text-muted-foreground hover:text-accent transition-colors">
                        {task.planTitle}
                      </Link>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {task.endDate && (
                      <span className={cn(
                        'flex items-center gap-1 text-xs',
                        task.endDate.slice(0, 10) < today ? 'text-destructive' : 'text-muted-foreground',
                      )}>
                        <CalendarClock className="h-3.5 w-3.5" />
                        {formatDateShort(new Date(task.endDate))}
                      </span>
                    )}
                    <Badge variant="secondary" className={cn('text-xs capitalize', priorityStyles[task.priority])}>
                      {task.priority}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Plans I own */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <FileCode2 className="h-4 w-4" />
              Plans I Own ({myPlans.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myPlans.length === 0 ? (
              <p className="text-sm text-muted-foreground">You don&apos;t own any open plans.</p>
            ) : (
              <ul className="space-y-3">
                {myPlans.map((plan) => (
                  <li key={plan.id}>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <Link href={`/plans/${plan.id}`} className="text-sm font-medium truncate hover:text-accent transition-colors">
                        {plan.title}
                      </Link>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {plan.completedTaskCount}/{plan.taskCount}
                      </span>
                    </div>
                    <Progress value={plan.progress} className="h-1.5" />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Work items I own */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Work Items I Own ({myItems.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {myItems.length === 0 ? (
              <p className="text-sm text-muted-foreground">You don&apos;t own any open work items.</p>
            ) : (
              <ul className="space-y-2">
                {myItems.slice(0, 10).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-2">
                    <Link href={`/work-items?item=${item.id}`} className="text-sm truncate hover:text-accent transition-colors">
                      {item.title}
                    </Link>
                    <Badge variant="secondary" className="text-xs capitalize shrink-0">{item.type.replace('_', ' ')}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Assets I own */}
      {ownedAssets.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Box className="h-4 w-4" />
              Assets I Own ({ownedAssets.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {ownedAssets.map((asset) => (
                <li key={asset.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <Link href={`/products/${asset.productSlug}`} className="text-sm font-medium truncate block hover:text-accent transition-colors">
                      {asset.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{asset.productName}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {asset.openItemCount} open item{asset.openItemCount === 1 ? '' : 's'}
                    </span>
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                        <div
                          className={cn(
                            'h-full rounded-full',
                            asset.effectiveDebtScore < 25 ? 'bg-accent' : asset.effectiveDebtScore < 50 ? 'bg-warning' : 'bg-destructive'
                          )}
                          style={{ width: `${Math.min(asset.effectiveDebtScore, 100)}%` }}
                        />
                      </div>
                      <span className="text-xs font-medium w-6 text-right">{asset.effectiveDebtScore}</span>
                    </div>
                    <Badge
                      variant="secondary"
                      className={cn(
                        'text-xs capitalize',
                        asset.health === 'healthy' && 'bg-accent/20 text-accent',
                        asset.health === 'warning' && 'bg-warning/20 text-warning',
                        asset.health === 'critical' && 'bg-destructive/20 text-destructive',
                      )}
                    >
                      {asset.health}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
