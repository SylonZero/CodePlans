'use client'

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
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
  Calendar,
} from 'lucide-react'
import type { DashboardStats } from '@/lib/types'

const velocityData = [
  { week: 'W1', tasks: 8, estimated: 10 },
  { week: 'W2', tasks: 12, estimated: 10 },
  { week: 'W3', tasks: 10, estimated: 12 },
  { week: 'W4', tasks: 15, estimated: 12 },
  { week: 'W5', tasks: 11, estimated: 14 },
  { week: 'W6', tasks: 14, estimated: 14 },
  { week: 'W7', tasks: 13, estimated: 14 },
  { week: 'W8', tasks: 16, estimated: 15 },
]

const tasksByType = [
  { name: 'Feature', value: 35, color: 'oklch(0.6 0.2 300)' },
  { name: 'Refactor', value: 25, color: 'oklch(0.65 0.2 250)' },
  { name: 'Bug Fix', value: 20, color: 'oklch(0.65 0.18 25)' },
  { name: 'Improvement', value: 20, color: 'oklch(0.7 0.15 145)' },
]

const effortAccuracy = [
  { month: 'Jan', estimated: 120, actual: 135 },
  { month: 'Feb', estimated: 140, actual: 128 },
  { month: 'Mar', estimated: 100, actual: 105 },
  { month: 'Apr', estimated: 150, actual: 160 },
  { month: 'May', estimated: 130, actual: 125 },
  { month: 'Jun', estimated: 145, actual: 142 },
]

const techDebtByProduct = [
  { name: 'Codeplans Platform', score: 21, trend: 'down' },
  { name: 'Codeplans API', score: 31, trend: 'up' },
  { name: 'Codeplans Mobile', score: 19, trend: 'down' },
]

interface Props {
  stats: DashboardStats
}

export function AnalyticsClient({ stats }: Props) {
  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground">
            Insights into your team&apos;s performance and delivery
          </p>
        </div>
        <div className="flex gap-2">
          <Select defaultValue="30d">
            <SelectTrigger className="w-[140px]">
              <Calendar className="h-4 w-4 mr-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline">Export</Button>
        </div>
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
              <div className="flex items-center gap-1 text-accent">
                <TrendingUp className="h-4 w-4" />
                <span className="text-sm">+12%</span>
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
                <p className="text-2xl font-bold">3.2</p>
                <p className="text-xs text-muted-foreground">days per task</p>
              </div>
              <div className="flex items-center gap-1 text-accent">
                <TrendingDown className="h-4 w-4" />
                <span className="text-sm">-8%</span>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Estimation Accuracy</p>
                <p className="text-2xl font-bold">92%</p>
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
            <CardDescription>Tasks completed vs estimated per week</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-[250px]">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={velocityData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorVelocity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" vertical={false} />
                  <XAxis dataKey="week" stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
                  <YAxis stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: 'oklch(0.11 0 0)', border: '1px solid oklch(0.22 0 0)', borderRadius: '8px', color: 'oklch(0.95 0 0)' }} />
                  <Area type="monotone" dataKey="estimated" stroke="oklch(0.6 0 0)" strokeWidth={1} strokeDasharray="4 4" fill="none" name="Estimated" />
                  <Area type="monotone" dataKey="tasks" stroke="oklch(0.7 0.15 145)" strokeWidth={2} fill="url(#colorVelocity)" name="Completed" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-base">Tasks by Type</CardTitle>
            <CardDescription>Distribution of work across categories</CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>

      <Card className="bg-card border-border mb-6">
        <CardHeader>
          <CardTitle className="text-base">Effort Estimation Accuracy</CardTitle>
          <CardDescription>Estimated vs actual hours by month</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={effortAccuracy} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" vertical={false} />
                <XAxis dataKey="month" stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="oklch(0.6 0 0)" fontSize={12} tickLine={false} axisLine={false} />
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
            <CardDescription>Average tech debt score across assets</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {techDebtByProduct.map((product) => (
                <div key={product.name} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{product.name}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{product.score}</span>
                      {product.trend === 'down' ? (
                        <TrendingDown className="h-4 w-4 text-accent" />
                      ) : (
                        <TrendingUp className="h-4 w-4 text-destructive" />
                      )}
                    </div>
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
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-accent" />
              <CardTitle className="text-base">AI Insights</CardTitle>
              <Badge variant="secondary" className="text-xs bg-chart-1/20 text-chart-1">Beta</Badge>
            </div>
            <CardDescription>AI-generated recommendations</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Plan Engine needs attention</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Tech debt score increased 15% this month. Consider scheduling a refactoring sprint.
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <TrendingUp className="h-5 w-5 text-accent shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Velocity trending up</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Team velocity has increased 12% over the past 4 weeks. Great job!
                    </p>
                  </div>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 p-4">
                <div className="flex items-start gap-3">
                  <Clock className="h-5 w-5 text-chart-2 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-sm">Real-time Collaboration at risk</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Based on current velocity, the deadline may be at risk. Consider re-scoping or adding resources.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
