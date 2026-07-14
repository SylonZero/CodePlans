'use client'

import { useCallback, useMemo, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Switch } from '@/components/ui/switch'
import { Clock, Filter, CheckCircle2, Circle, Play, LayoutGrid, List, Plus } from 'lucide-react'
import type { TaskStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { updateTaskStatusAction, updateTaskPriorityAction, updateTaskAssigneeAction } from '../actions'
import { TaskPanel, type TaskRow, type PlanOption, type MemberOption } from './task-panel'

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

const PRIORITY_OPTIONS = ['low', 'medium', 'high', 'critical'] as const

function RowPrioritySelect({ task }: { task: TaskRow }) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(task.priority)
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v as typeof value)
        startTransition(() => updateTaskPriorityAction(task.id, v as typeof value))
      }}
    >
      <SelectTrigger
        disabled={isPending}
        className={cn('h-6 w-auto gap-1 border-none px-2 text-xs capitalize', priorityStyles[value])}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {PRIORITY_OPTIONS.map((prio) => (
          <SelectItem key={prio} value={prio} className="capitalize">{prio}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function RowAssigneeSelect({ task, members }: { task: TaskRow; members: MemberOption[] }) {
  const [isPending, startTransition] = useTransition()
  const [value, setValue] = useState(task.assigneeId ?? 'none')
  const name = members.find((m) => m.id === value)?.name
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        setValue(v)
        startTransition(() => updateTaskAssigneeAction(task.id, v === 'none' ? null : v))
      }}
    >
      <SelectTrigger disabled={isPending} className="h-7 w-auto gap-1 border-none px-1 text-sm">
        <span className="flex items-center gap-2">
          <Avatar className="h-6 w-6">
            <AvatarFallback className="text-xs bg-muted">
              {name ? name.split(' ').map((n) => n[0]).join('') : '–'}
            </AvatarFallback>
          </Avatar>
          <span className={cn('text-sm', !name && 'text-muted-foreground')}>{name ? name.split(' ')[0] : '-'}</span>
        </span>
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="none">Unassigned</SelectItem>
        {members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}

function nextStatus(current: TaskStatus): TaskStatus {
  if (current === 'not_started') return 'in_progress'
  if (current === 'in_progress') return 'done'
  return 'not_started'
}

function BoardTaskCard({ task, onOpen }: { task: TaskRow; onOpen: (task: TaskRow) => void }) {
  const [isPending, startTransition] = useTransition()
  const [optimisticStatus, setOptimisticStatus] = useState<TaskStatus>(task.status)
  const StatusIcon = statusIcons[optimisticStatus]

  const isMirrored = !!task.source && task.source !== 'native'

  function cycleStatus(e: React.MouseEvent) {
    e.stopPropagation()
    if (isPending || isMirrored) return
    const newStatus = nextStatus(optimisticStatus)
    setOptimisticStatus(newStatus)
    startTransition(() => updateTaskStatusAction(task.id, newStatus))
  }

  return (
    <Card
      className={cn(
        'bg-card border-border cursor-pointer hover:border-muted-foreground/40 transition-colors',
        optimisticStatus === 'in_progress' && 'border-l-2 border-l-chart-1',
        optimisticStatus === 'done' && 'opacity-75',
      )}
      onClick={() => onOpen(task)}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2 mb-2">
          <span className={cn('font-medium text-sm', optimisticStatus === 'done' && 'line-through text-muted-foreground')}>
            {task.title}
          </span>
          <Badge variant="secondary" className={cn('text-xs shrink-0', priorityStyles[task.priority])}>
            {task.priority}
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground mb-2 truncate">{task.planTitle}</p>
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={cycleStatus}
            title={`Mark as ${statusLabels[nextStatus(optimisticStatus)]}`}
            className={cn('flex items-center gap-1 text-xs hover:opacity-80', statusStyles[optimisticStatus])}
          >
            <StatusIcon className="h-3 w-3" />
            <span>{statusLabels[optimisticStatus]}</span>
          </button>
          {task.estimatedEffort && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {task.actualEffort ?? task.estimatedEffort}h
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export function TasksClient({
  tasks,
  plans,
  members,
  currentUserId,
}: {
  tasks: TaskRow[]
  plans: PlanOption[]
  members: MemberOption[]
  currentUserId?: string
}) {
  const [mineOnly, setMineOnly] = useState(false)
  const searchParams = useSearchParams()
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all' | 'open'>('open')
  const [planFilter, setPlanFilter] = useState<string>('all')
  const [view, setView] = useState<'list' | 'board'>('list')
  const [page, setPage] = useState(0)
  const [createOpen, setCreateOpen] = useState(false)

  const openTaskId = searchParams.get('task')
  const openTask = useMemo(
    () => (openTaskId ? tasks.find((t) => t.id === openTaskId) ?? null : null),
    [openTaskId, tasks],
  )

  // Shallow URL updates keep the panel deep-linkable without a server roundtrip
  const openPanel = useCallback((task: TaskRow) => {
    window.history.pushState(null, '', `/tasks?task=${task.id}`)
  }, [])

  const closePanel = useCallback(() => {
    setCreateOpen(false)
    if (openTaskId) window.history.pushState(null, '', '/tasks')
  }, [openTaskId])

  const filteredTasks = tasks.filter((task) => {
    if (mineOnly && task.assigneeId !== currentUserId) return false
    if (statusFilter === 'open') {
      if (task.status === 'done') return false
    } else if (statusFilter !== 'all' && task.status !== statusFilter) return false
    if (planFilter !== 'all' && task.codePlanId !== planFilter) return false
    return true
  })
  const pageTasks = filteredTasks.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  const stats = {
    total: tasks.length,
    not_started: tasks.filter((t) => t.status === 'not_started').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  return (
    <>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Track and manage tasks across all code plans</p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          New Task
        </Button>
      </div>

      <TaskPanel
        open={createOpen || !!openTask}
        mode={createOpen ? 'create' : 'view'}
        task={openTask}
        plans={plans}
        members={members}
        onClose={closePanel}
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-4 mb-8">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{stats.total}</div>
            <p className="text-sm text-muted-foreground">Total Tasks</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Circle className="h-5 w-5 text-muted-foreground" />
              <span className="text-2xl font-bold">{stats.not_started}</span>
            </div>
            <p className="text-sm text-muted-foreground">Not Started</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Play className="h-5 w-5 text-chart-1" />
              <span className="text-2xl font-bold">{stats.in_progress}</span>
            </div>
            <p className="text-sm text-muted-foreground">In Progress</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-accent" />
              <span className="text-2xl font-bold">{stats.done}</span>
            </div>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-6">
        <Tabs value={statusFilter} onValueChange={(v) => { setStatusFilter(v as TaskStatus | 'all' | 'open'); setPage(0) }} className="w-full sm:w-auto">
          <TabsList className="bg-muted">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="not_started">Not Started</TabsTrigger>
            <TabsTrigger value="in_progress">In Progress</TabsTrigger>
            <TabsTrigger value="done">Done</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Switch
            checked={mineOnly}
            onCheckedChange={(v) => { setMineOnly(v); setPage(0) }}
          />
          <span className="text-muted-foreground">Assigned to me</span>
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={planFilter} onValueChange={(v) => { setPlanFilter(v); setPage(0) }}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="All Plans" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Plans</SelectItem>
              {plans.map((plan) => (
                <SelectItem key={plan.id} value={plan.id}>{plan.title}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-md">
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-r-none" onClick={() => setView('list')}>
              <List className="h-4 w-4" />
            </Button>
            <Button variant={view === 'board' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-l-none" onClick={() => setView('board')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* List View */}
      {view === 'list' && (
        <Card className="bg-card border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Task</TableHead>
                <TableHead>Code Plan</TableHead>
                <TableHead>Asset</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Assignee</TableHead>
                <TableHead>Effort</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pageTasks.map((task) => {
                const StatusIcon = statusIcons[task.status]
                return (
                  <TableRow
                    key={task.id}
                    className="cursor-pointer"
                    onClick={() => openPanel(task)}
                  >
                    <TableCell className="max-w-md">
                      <div>
                        <p className={cn('font-medium whitespace-normal break-words', task.status === 'done' && 'line-through text-muted-foreground')}>
                          {task.title}
                          {task.externalKey && (
                            <span className="ml-1.5 text-xs text-muted-foreground font-normal">{task.externalKey}</span>
                          )}
                        </p>
                        {task.tags.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {task.tags.slice(0, 2).map((tag) => (
                              <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                            ))}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="max-w-[200px]" onClick={(e) => e.stopPropagation()}>
                      <Link
                        href={`/plans/${task.codePlanId}`}
                        title={task.planTitle}
                        className="text-sm hover:text-accent transition-colors truncate block"
                      >
                        {task.planTitle}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{task.assetName ?? '-'}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <RowPrioritySelect key={`${task.id}-${task.priority}`} task={task} />
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <RowAssigneeSelect key={`${task.id}-${task.assigneeId ?? 'none'}`} task={task} members={members} />
                    </TableCell>
                    <TableCell>
                      {task.estimatedEffort ? (
                        <div className="flex items-center gap-1 text-sm text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {task.actualEffort ?? task.estimatedEffort}h
                          {task.actualEffort && task.actualEffort !== task.estimatedEffort && (
                            <span className="text-xs">(est. {task.estimatedEffort}h)</span>
                          )}
                        </div>
                      ) : '-'}
                    </TableCell>
                    <TableCell>
                      <div className={cn('flex items-center gap-1.5', statusStyles[task.status])}>
                        <StatusIcon className="h-4 w-4" />
                        <span className="text-sm">{statusLabels[task.status]}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
          {filteredTasks.length === 0 && (
            <div className="py-12 text-center text-muted-foreground">
              <p>No tasks found</p>
              <p className="text-sm">Try adjusting your filters</p>
            </div>
          )}
          {filteredTasks.length > PAGE_SIZE && (
            <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted-foreground">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, filteredTasks.length)} of {filteredTasks.length}</span>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                <Button variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= filteredTasks.length} onClick={() => setPage((p) => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Board View */}
      {view === 'board' && (
        <div className="grid gap-6 lg:grid-cols-3">
          {(['not_started', 'in_progress', 'done'] as TaskStatus[]).map((status) => {
            const statusTasks = filteredTasks.filter((t) => t.status === status)
            const StatusIcon = statusIcons[status]
            return (
              <div key={status}>
                <div className="flex items-center gap-2 mb-4">
                  <StatusIcon className={cn('h-4 w-4', statusStyles[status])} />
                  <h3 className="font-medium">{statusLabels[status]}</h3>
                  <Badge variant="secondary" className={cn('text-xs', status === 'in_progress' && 'bg-chart-1/20 text-chart-1', status === 'done' && 'bg-accent/20 text-accent')}>
                    {statusTasks.length}
                  </Badge>
                </div>
                <div className="space-y-3">
                  {statusTasks.slice(0, 8).map((task) => (
                    <BoardTaskCard key={task.id} task={task} onOpen={openPanel} />
                  ))}
                  {statusTasks.length > 8 && (
                    <p className="text-sm text-muted-foreground text-center py-2">+{statusTasks.length - 8} more</p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </>
  )
}
