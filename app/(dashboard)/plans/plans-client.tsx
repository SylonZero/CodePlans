'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Plus, Calendar, Users, Filter, ArrowUpRight, Clock, List, LayoutGrid } from 'lucide-react'
import type { CodePlanStatus, CodePlanType } from '@/lib/types'
import { cn, formatDate } from '@/lib/utils'
import { PlanCreatePanel } from './plan-create-panel'

type Plan = {
  ownerId?: string
  id: string
  title: string
  description: string
  productId: string
  productName?: string
  type: CodePlanType
  status: CodePlanStatus
  tags: string[]
  deadline?: string
  assigneeIds: string[]
  progress: number
  taskCount: number
  completedTaskCount: number
}

type Product = { id: string; name: string }

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

export function PlansClient({ plans, products, currentUserId }: { plans: Plan[]; products: Product[]; currentUserId?: string }) {
  const [mineOnly, setMineOnly] = useState(false)
  const [statusFilter, setStatusFilter] = useState<CodePlanStatus | 'all' | 'open'>('open')
  const [productFilter, setProductFilter] = useState<string>('all')
  const [view, setView] = useState<'card' | 'list'>('card')

  const filteredPlans = plans.filter((plan) => {
    if (mineOnly && plan.ownerId !== currentUserId && !plan.assigneeIds.includes(currentUserId ?? '')) return false
    if (statusFilter === 'open') {
      if (plan.status === 'completed' || plan.status === 'cancelled') return false
    } else if (statusFilter !== 'all' && plan.status !== statusFilter) return false
    if (productFilter !== 'all' && plan.productId !== productFilter) return false
    return true
  })

  const stats = {
    active: plans.filter((p) => p.status === 'active').length,
    draft: plans.filter((p) => p.status === 'draft').length,
    completed: plans.filter((p) => p.status === 'completed').length,
  }

  return (
    <>
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Active</p>
                <p className="text-2xl font-bold">{stats.active}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-chart-1/20 flex items-center justify-center">
                <ArrowUpRight className="h-5 w-5 text-chart-1" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Draft</p>
                <p className="text-2xl font-bold">{stats.draft}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                <Clock className="h-5 w-5 text-muted-foreground" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-2xl font-bold">{stats.completed}</p>
              </div>
              <div className="h-10 w-10 rounded-full bg-accent/20 flex items-center justify-center">
                <svg className="h-5 w-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center mb-6">
        <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as CodePlanStatus | 'all' | 'open')} className="w-full sm:w-auto">
          <TabsList className="bg-muted">
            <TabsTrigger value="open">Open</TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="active">Active</TabsTrigger>
            <TabsTrigger value="draft">Draft</TabsTrigger>
            <TabsTrigger value="completed">Completed</TabsTrigger>
          </TabsList>
        </Tabs>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <Switch checked={mineOnly} onCheckedChange={setMineOnly} />
          <span className="text-muted-foreground">My plans</span>
        </label>
        <div className="flex items-center gap-2 sm:ml-auto">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={productFilter} onValueChange={setProductFilter}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="All Products" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Products</SelectItem>
              {products.map((product) => (
                <SelectItem key={product.id} value={product.id}>{product.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex border border-border rounded-md">
            <Button variant={view === 'card' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-r-none" title="Card view" onClick={() => setView('card')}>
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button variant={view === 'list' ? 'secondary' : 'ghost'} size="icon" className="h-9 w-9 rounded-l-none" title="List view" onClick={() => setView('list')}>
              <List className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Plans */}
      {filteredPlans.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Plus className="h-12 w-12 text-muted-foreground mb-4" />
            <h3 className="text-lg font-medium mb-1">No plans found</h3>
            <p className="text-sm text-muted-foreground mb-4">
              {statusFilter !== 'all' || productFilter !== 'all'
                ? 'Try adjusting your filters'
                : 'Create your first code plan to get started'}
            </p>
            <PlanCreatePanel
              products={products}
              defaultProductId={productFilter !== 'all' ? productFilter : undefined}
              trigger={
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Create Plan
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : view === 'list' ? (
        <Card className="bg-card border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Plan</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Deadline</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredPlans.map((plan) => (
                <TableRow key={plan.id}>
                  <TableCell className="max-w-[240px]">
                    <Link
                      href={`/plans/${plan.id}`}
                      title={plan.title}
                      className="font-medium hover:text-accent transition-colors truncate block"
                    >
                      {plan.title}
                    </Link>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-xs', typeStyles[plan.type])}>
                      {typeLabels[plan.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary" className={cn('text-xs', statusStyles[plan.status])}>
                      {plan.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground max-w-[160px]">
                    <div className="truncate" title={plan.productName}>{plan.productName}</div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2 w-32">
                      <Progress value={plan.progress} className="h-1.5" />
                      <span className="text-xs text-muted-foreground shrink-0">{plan.progress}%</span>
                    </div>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {plan.deadline ? formatDate(plan.deadline) : '-'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredPlans.map((plan) => (
            <Card key={plan.id} className="bg-card border-border hover:border-muted-foreground/30 transition-colors flex flex-col">
              <CardContent className="p-6 flex flex-col gap-4 flex-1">
                <div>
                  <div className="mb-2">
                    <Link href={`/plans/${plan.id}`} className="text-base font-semibold hover:text-accent transition-colors line-clamp-1">
                      {plan.title}
                    </Link>
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap mb-2">
                    <Badge variant="secondary" className={cn('text-xs', typeStyles[plan.type])}>
                      {typeLabels[plan.type]}
                    </Badge>
                    <Badge variant="secondary" className={cn('text-xs', statusStyles[plan.status])}>
                      {plan.status}
                    </Badge>
                  </div>
                  <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{plan.description}</p>
                  <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
                    <span className="text-foreground font-medium">{plan.productName}</span>
                    {plan.deadline && (
                      <div className="flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>Due {formatDate(plan.deadline)}</span>
                      </div>
                    )}
                    {plan.assigneeIds.length > 0 && (
                      <div className="flex items-center gap-1">
                        <Users className="h-3.5 w-3.5" />
                        <span>{plan.assigneeIds.length} assignee{plan.assigneeIds.length > 1 ? 's' : ''}</span>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-auto">
                  <div className="flex items-center justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">{plan.progress}%</span>
                  </div>
                  <Progress value={plan.progress} className="h-2" />
                  <div className="text-xs text-muted-foreground mt-1.5 text-right">
                    {plan.completedTaskCount} / {plan.taskCount} tasks
                  </div>
                </div>
                {plan.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-4 border-t border-border">
                    {plan.tags.map((tag) => (
                      <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </>
  )
}
