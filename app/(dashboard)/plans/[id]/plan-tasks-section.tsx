'use client'

import { useRef, useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createTaskAction } from '../../actions'
import { Badge } from '@/components/ui/badge'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Circle, Play, CheckCircle2, Clock, List, LayoutGrid, ExternalLink } from 'lucide-react'
import type { Task, TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

const statusLabels: Record<TaskStatus, string> = {
  not_started: 'Not Started',
  in_progress: 'In Progress',
  done: 'Done',
}
const statusIcons: Record<TaskStatus, typeof Circle> = {
  not_started: Circle,
  in_progress: Play,
  done: CheckCircle2,
}
const statusStyles: Record<TaskStatus, string> = {
  not_started: 'text-muted-foreground',
  in_progress: 'text-chart-1',
  done: 'text-accent',
}
const priorityStyles = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

/** Plan tasks: list view by default (paginated), kanban behind a toggle. */
function QuickAddRow({ planId }: { planId: string }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    const title = inputRef.current?.value.trim()
    if (!title) return
    const fd = new FormData()
    fd.set('title', title)
    if (inputRef.current) inputRef.current.value = ''
    startTransition(() => createTaskAction(planId, fd))
  }

  return (
    <div className="border-b border-border px-4 py-2">
      <Input
        ref={inputRef}
        placeholder="Quick add: type a task title and press Enter"
        disabled={isPending}
        className="border-none shadow-none focus-visible:ring-0 px-0"
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit() } }}
      />
    </div>
  )
}

export function PlanTasksSection({ tasks, planId }: { tasks: Task[]; planId: string }) {
  const [view, setView] = useState<'list' | 'board'>('list')
  const [page, setPage] = useState(0)

  const start = page * PAGE_SIZE
  const pageTasks = tasks.slice(start, start + PAGE_SIZE)

  const tasksByStatus = {
    not_started: tasks.filter((t) => t.status === 'not_started'),
    in_progress: tasks.filter((t) => t.status === 'in_progress'),
    done: tasks.filter((t) => t.status === 'done'),
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <div className="flex border border-border rounded-md">
          <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 rounded-r-none" title="List view" onClick={() => setView('list')}>
            <List className="h-4 w-4" />
          </Button>
          <Button variant={view === 'board' ? 'secondary' : 'ghost'} size="icon" className="h-8 w-8 rounded-l-none" title="Board view" onClick={() => setView('board')}>
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {view === 'list' ? (
        <Card className="bg-card border-border">
          <QuickAddRow planId={planId} />
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Status</TableHead>
                <TableHead>Task</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Effort</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageTasks.map((task) => {
                const StatusIcon = statusIcons[task.status]
                return (
                  <TableRow key={task.id}>
                    <TableCell>
                      <div className={cn('flex items-center gap-1.5 whitespace-nowrap', statusStyles[task.status])}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm">{statusLabels[task.status]}</span>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className={cn('font-medium text-sm', task.status === 'done' && 'line-through text-muted-foreground')}>
                        {task.title}
                      </span>
                      {task.externalKey && (
                        <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-muted-foreground">
                          {task.externalKey}
                          {task.externalUrl && (
                            <a href={task.externalUrl} target="_blank" rel="noreferrer">
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={cn('text-xs capitalize', priorityStyles[task.priority])}>
                        {task.priority}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {task.estimatedEffort || task.actualEffort ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {task.actualEffort ?? task.estimatedEffort}h
                        </div>
                      ) : '-'}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {tasks.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">No tasks yet</div>
          )}
          {tasks.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>{start + 1}–{Math.min(start + PAGE_SIZE, tasks.length)} of {tasks.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={start + PAGE_SIZE >= tasks.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-3">
          {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((status) => {
            const statusTasks = tasksByStatus[status]
            const StatusIcon = statusIcons[status]
            const badgeStyles = { not_started: '', in_progress: 'bg-chart-1/20 text-chart-1', done: 'bg-accent/20 text-accent' }
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-4">
                  <StatusIcon className={cn('h-4 w-4', statusStyles[status])} />
                  <h3 className="font-medium">{statusLabels[status]}</h3>
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
                            {task.externalKey && (
                              <span className="ml-1.5 text-xs text-muted-foreground font-normal">{task.externalKey}</span>
                            )}
                          </span>
                          {status !== 'done' && (
                            <Badge variant="secondary" className={cn('text-xs shrink-0', priorityStyles[task.priority])}>
                              {task.priority}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center justify-end">
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
      )}
    </div>
  )
}
