'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts'
import {
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  CalendarClock,
} from 'lucide-react'
import type { DashboardStats } from '@/lib/types'
import type { AnalyticsData, AnalyticsInsight } from '@/lib/db/queries'

const TYPE_COLORS = [
  'oklch(0.6 0.2 300)',
  'oklch(0.65 0.2 250)',
  'oklch(0.65 0.18 25)',
  'oklch(0.7 0.15 145)',
  'oklch(0.75 0.15 85)',
]

const insightIcons: Record<AnalyticsInsight['kind'], typeof AlertTriangle> = {
  debt: AlertTriangle,
  velocity: TrendingUp,
  deadline: CalendarClock,
}

const insightStyles: Record<AnalyticsInsight['kind'], string> = {
  debt: 'text-warning',
  velocity: 'text-accent',
  deadline: 'text-chart-2',
}

interface Props {
  stats: DashboardStats
  analytics: AnalyticsData
}

export function AnalyticsClient({ stats, analytics }: Props) {
  const tasksByType = analytics.tasksByType.map((t, i) => ({
    ...t,
    color: TYPE_COLORS[i % TYPE_COLORS.length],
  }))

  const insightDown = analytics.insights.find((i) => i.kind === 'velocity' && i.title.includes('down'))

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
        <p className="text-muted-foreground">
          Insights into your team&apos;s performance and delivery
        </p>
      </div>

      {/* Key Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Velocity</p>
                <p className="text-2xl font-bold">{stats.velocity}</p>
                <p className="text-xs text-muted-foreground">tasks/week</p>
              </div>
              <div className={insightDown ? 'text-destructive' : 'text-accent'}>
                {insightDown ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completion Rate</p>
                <p className="text-2xl font-bold">
                  {stats.totalTasks > 0
                    ? Math.round((stats.completedTasks / stats.totalTasks) * 100)
                    : 0}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.completedTasks} of {stats.totalTasks} tasks
                </p>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <CheckCircle2 className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Avg. Cycle Time</p>
                <p className="text-2xl font-bold">{analytics.avgCycleTimeDays ?? '—'}</p>
                <p className="text-xs text-muted-foreground">days per completed task</p>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <Clock className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estimation Accuracy</p>
                <p className="text-2xl font-bold">
                  {analytics.estimationAccuracy != null ? `${analytics.estimationAccuracy}%` : '—'}
                </p>
                <p className="text-xs text-muted-foreground">within 20% variance</p>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <Clock className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-2 mb-6">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Team Velocity</CardTitle>
            <CardDescription>Tasks completed vs created per week (last 8 weeks)</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={analytics.velocityByWeek} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorVelocity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" vertical={false} />
                  <XAxis dataKey="week" stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'oklch(0.11 0 0)', border: '1px solid oklch(0.22 0 0)', borderRadius: '8px', color: 'oklch(0.95 0 0)' }} />
                  <Area type="monotone" dataKey="created" stroke="oklch(0.6 0 0)" strokeWidth={1} strokeDasharray="4 4" fill="none" name="Created" />
                  <Area type="monotone" dataKey="completed" stroke="oklch(0.7 0.15 145)" strokeWidth={2} fill="url(#colorVelocity)" name="Completed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Tasks by Type</CardTitle>
            <CardDescription>Distribution of work by the parent plan&apos;s type</CardDescription>
          </CardHeader>
          <CardContent>
            {tasksByType.length === 0 ? (
              <div className="h-[250px] flex items-center justify-center text-sm text-muted-foreground">
                No tasks yet
              </div>
            ) : (
              <div className="h-[250px] flex items-center">
                <ResponsiveContainer width="50%" height="100%">
                  <PieChart>
                    <Pie data={tasksByType} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={2} dataKey="value">
                      {tasksByType.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: 'oklch(0.11 0 0)', border: '1px solid oklch(0.22 0 0)', borderRadius: '8px', color: 'oklch(0.95 0 0)' }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex-1 space-y-3">
                  {tasksByType.map((item) => (
                    <div key={item.name} className="flex items-center gap-3">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: item.color }} />
                      <span className="text-sm flex-1">{item.name}</span>
                      <span className="text-sm font-medium">{item.value}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border mb-6">
        <CardHeader>
          <CardTitle className="text-base">Effort Estimation Accuracy</CardTitle>
          <CardDescription>Estimated vs actual hours on completed tasks, by month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={analytics.effortByMonth} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" vertical={false} />
                <XAxis dataKey="month" stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ backgroundColor: 'oklch(0.11 0 0)', border: '1px solid oklch(0.22 0 0)', borderRadius: '8px', color: 'oklch(0.95 0 0)' }} />
                <Bar dataKey="estimated" fill="oklch(0.6 0 0)" radius={[4, 4, 0, 0]} name="Estimated" />
                <Bar dataKey="actual" fill="oklch(0.7 0.15 145)" radius={[4, 4, 0, 0]} name="Actual" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-muted-foreground" />
              <span className="text-muted-foreground">Estimated Hours</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded bg-accent" />
              <span className="text-muted-foreground">Actual Hours</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Tech Debt by Product</CardTitle>
            <CardDescription>Average effective debt score across each product&apos;s assets</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.techDebtByProduct.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">No products yet</div>
            ) : (
              <div className="space-y-4">
                {analytics.techDebtByProduct.map((product) => (
                  <div key={product.name} className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{product.name}</span>
                      <span className="text-sm">{product.score}</span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={`h-full rounded-full ${product.score < 25 ? 'bg-accent' : product.score < 40 ? 'bg-warning' : 'bg-destructive'}`}
                        style={{ width: `${Math.min(product.score, 100)}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <CardTitle className="text-base">Insights</CardTitle>
            </div>
            <CardDescription>Observations computed from your delivery data</CardDescription>
          </CardHeader>
          <CardContent>
            {analytics.insights.length === 0 ? (
              <div className="py-8 text-center text-sm text-muted-foreground">
                Not enough data yet — insights appear as plans and tasks accumulate
              </div>
            ) : (
              <div className="space-y-4">
                {analytics.insights.map((insight) => {
                  const Icon = insightIcons[insight.kind]
                  return (
                    <div key={insight.title} className="rounded-lg bg-muted/50 p-4">
                      <div className="flex items-start gap-3">
                        <Icon className={`h-5 w-5 shrink-0 mt-0.5 ${insightStyles[insight.kind]}`} />
                        <div>
                          <p className="font-medium text-sm">{insight.title}</p>
                          <p className="text-sm text-muted-foreground mt-1">{insight.description}</p>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
