'use client'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

const velocityData = [
  { week: 'W1', tasks: 8, planned: 10 },
  { week: 'W2', tasks: 12, planned: 10 },
  { week: 'W3', tasks: 10, planned: 12 },
  { week: 'W4', tasks: 15, planned: 12 },
  { week: 'W5', tasks: 11, planned: 14 },
  { week: 'W6', tasks: 14, planned: 14 },
  { week: 'W7', tasks: 13, planned: 14 },
  { week: 'W8', tasks: 16, planned: 15 },
]

export function VelocityChart() {
  return (
    <Card className="bg-card border-border">
      <CardHeader>
        <CardTitle className="text-base font-semibold">Team Velocity</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-[200px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={velocityData} margin={{ top: 5, right: 5, left: -20, bottom: 5 }}>
              <defs>
                <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="oklch(0.7 0.15 145)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.22 0 0)" vertical={false} />
              <XAxis
                dataKey="week"
                stroke="oklch(0.6 0 0)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                stroke="oklch(0.6 0 0)"
                fontSize={12}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'oklch(0.11 0 0)',
                  border: '1px solid oklch(0.22 0 0)',
                  borderRadius: '8px',
                  color: 'oklch(0.95 0 0)',
                }}
                labelStyle={{ color: 'oklch(0.6 0 0)' }}
              />
              <Area
                type="monotone"
                dataKey="planned"
                stroke="oklch(0.6 0 0)"
                strokeWidth={1}
                strokeDasharray="4 4"
                fill="none"
                name="Planned"
              />
              <Area
                type="monotone"
                dataKey="tasks"
                stroke="oklch(0.7 0.15 145)"
                strokeWidth={2}
                fill="url(#colorTasks)"
                name="Completed"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-4 flex items-center justify-center gap-6 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full bg-accent" />
            <span className="text-muted-foreground">Completed Tasks</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded-full border border-dashed border-muted-foreground" />
            <span className="text-muted-foreground">Planned</span>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
