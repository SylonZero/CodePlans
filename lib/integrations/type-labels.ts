// Label → work item type, shared by tracker sync and external imports.
import type { WorkItemType } from '@/lib/types'

export const DEFAULT_TYPE_LABEL_MAP: Record<string, WorkItemType> = {
  bug: 'bug',
  enhancement: 'enhancement',
  ux: 'ux',
  design: 'ux',
  'tech-debt': 'tech_debt',
  'tech debt': 'tech_debt',
  debt: 'tech_debt',
  feature: 'feature',
}

export function inferType(labels: string[], typeLabelMap: Record<string, WorkItemType> = DEFAULT_TYPE_LABEL_MAP): WorkItemType {
  for (const label of labels) {
    const mapped = typeLabelMap[label.toLowerCase()]
    if (mapped) return mapped
  }
  return 'feature'
}
