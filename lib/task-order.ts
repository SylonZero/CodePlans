// Plan tasks read in title order. Agents number their tasks ("T1 …", "T2 …",
// "Phase 10 …"), so numbers inside titles compare as numbers: T2 before T10.
type Orderable = { title: string; createdAt: string | Date }

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
const time = (v: string | Date) => (v instanceof Date ? v.getTime() : Date.parse(v) || 0)

export function compareTasks(a: Orderable, b: Orderable): number {
  return collator.compare(a.title.trim(), b.title.trim()) || time(a.createdAt) - time(b.createdAt)
}

export function sortTasks<T extends Orderable>(tasks: T[]): T[] {
  return [...tasks].sort(compareTasks)
}
