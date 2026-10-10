import { redirect } from 'next/navigation'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { tasks } from '@/lib/db/schema'

// Tasks live on their code plan. Old /tasks?task=<id> links (bookmarks,
// notification emails) open the task on its plan; access is checked there.
export default async function TasksRedirect({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = (await searchParams).task
  const id = typeof raw === 'string' ? raw : undefined
  const task = id ? await db.query.tasks.findFirst({ where: eq(tasks.id, id), columns: { codePlanId: true } }) : undefined
  redirect(task ? `/plans/${task.codePlanId}?task=${id}` : '/plans')
}
