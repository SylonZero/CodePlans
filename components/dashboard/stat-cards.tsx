'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Package, FileCode2, CheckSquare, TrendingUp, ArrowUpRight } from 'lucide-react'
import type { DashboardStats } from '@/lib/types'
import { cn } from '@/lib/utils'

export function StatCards({ stats }: { stats: DashboardStats }) {
  const cards = [
    {
      title: 'Products',
      value: stats.totalProducts,
      subtitle: `${stats.totalAssets} assets`,
      icon: Package,
      trend: null,
    },
    {
      title: 'Active Plans',
      value: stats.activePlans,
      subtitle: `${stats.completedPlans} completed`,
      icon: FileCode2,
      trend: null,
    },
    {
      title: 'Tasks Done',
      value: stats.completedTasks,
      subtitle: `of ${stats.totalTasks} total`,
      icon: CheckSquare,
      trend: stats.tasksThisWeek > 0
        ? { value: stats.tasksThisWeek, positive: true, label: 'this week' }
        : null,
    },
    {
      title: 'Velocity',
      value: stats.velocity,
      subtitle: 'tasks / week',
      icon: TrendingUp,
      trend: null,
    },
  ]

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {cards.map((stat) => (
        <Card key={stat.title} className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <stat.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{stat.subtitle}</span>
              {stat.trend && (
                <span className={cn('flex items-center gap-0.5', 'text-accent')}>
                  <ArrowUpRight className="h-3 w-3" />
                  {stat.trend.value} {stat.trend.label}
                </span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
