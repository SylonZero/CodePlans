import { authAdapter } from '@/lib/auth'
import { getTasks, getCodePlans } from '@/lib/db/queries'
import { NewTaskDialog } from './new-task-dialog'
import { TasksClient } from './tasks-client'

export default async function TasksPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const [tasks, plans] = await Promise.all([
    getTasks(user.id),
    getCodePlans(user.id, { status: 'active' }),
  ])

  const planList = plans.map((p) => ({ id: p.id, title: p.title }))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tasks</h1>
          <p className="text-muted-foreground">Track and manage tasks across all code plans</p>
        </div>
        <NewTaskDialog plans={planList} />
      </div>

      <TasksClient tasks={tasks} plans={planList} />
    </div>
  )
}
