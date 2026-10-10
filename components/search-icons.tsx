import { Boxes, ClipboardList, FileCode2, FileText, ListChecks, Package, Rocket } from 'lucide-react'
import type { SearchType } from '@/lib/search-types'

/** The sidebar's icon for each searchable type. */
export const SEARCH_TYPE_ICONS: Record<SearchType, React.ComponentType<{ className?: string }>> = {
  product: Package,
  asset: Boxes,
  plan: FileCode2,
  task: ListChecks,
  work_item: ClipboardList,
  spec: FileText,
  release: Rocket,
}

/** "in_progress" -> "in progress" */
export function statusLabel(status: string | null): string | null {
  return status ? status.replace(/_/g, ' ') : null
}
