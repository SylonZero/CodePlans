'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { FileCode2, CheckSquare, Package, UserPlus, Trophy, Play, ClipboardList, CircleCheck, Link2, Pencil } from 'lucide-react'
import type { ActivityItem } from '@/lib/types'
import { cn, formatDateShort } from '@/lib/utils'

const activityIcons: Record<ActivityItem['type'], typeof FileCode2> = {
  plan_created: FileCode2,
  plan_activated: Play,
  plan_completed: Trophy,
  plan_updated: Pencil,
  task_created: CheckSquare,
  task_completed: CheckSquare,
  asset_added: Package,
  member_joined: UserPlus,
  item_created: ClipboardList,
  item_resolved: CircleCheck,
  item_linked: Link2,
  item_updated: Pencil,
}

const activityStyles: Record<ActivityItem['type'], string> = {
  plan_created: 'bg-chart-2/20 text-chart-2',
  plan_activated: 'bg-chart-1/20 text-chart-1',
  plan_completed: 'bg-accent/20 text-accent',
  plan_updated: 'bg-muted text-muted-foreground',
  task_created: 'bg-chart-1/10 text-chart-1',
  task_completed: 'bg-chart-1/20 text-chart-1',
  asset_added: 'bg-chart-4/20 text-chart-4',
  member_joined: 'bg-chart-3/20 text-chart-3',
  item_created: 'bg-chart-2/20 text-chart-2',
  item_resolved: 'bg-accent/20 text-accent',
  item_linked: 'bg-chart-4/20 text-chart-4',
  item_updated: 'bg-muted text-muted-foreground',
}

function formatTimeAgo(timestamp: string): string {
  const now = new Date()
  const date = new Date(timestamp)
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000)
  if (diffInSeconds < 60) return 'just now'
  if (diffInSeconds < 3600) return `${Math.floor(diffInSeconds / 60)}m ago`
  if (diffInSeconds < 86400) return `${Math.floor(diffInSeconds / 3600)}h ago`
  if (diffInSeconds < 604800) return `${Math.floor(diffInSeconds / 86400)}d ago`
  return formatDateShort(date)
}

export function ActivityFeed({ activities = [] }: { activities?: ActivityItem[] }) {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Recent Activity</CardTitle>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            No recent activity yet.
          </div>
        ) : (
          <div className="space-y-4">
            {activities.map((activity) => {
              const Icon = activityIcons[activity.type] ?? Pencil
              return (
                <div key={activity.id} className="flex items-start gap-3">
                  <div className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-full', activityStyles[activity.type] ?? 'bg-muted text-muted-foreground')}>
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">{activity.userName}</span>
                      <span className="text-xs text-muted-foreground">{formatTimeAgo(activity.timestamp)}</span>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {activity.title}: <span className="text-foreground">{activity.description}</span>
                    </p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
