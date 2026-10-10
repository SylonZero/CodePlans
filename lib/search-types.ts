// Search types and constants shared by the server (lib/db/search.ts) and the
// browser (the search palette). No database imports here.

export const SEARCH_TYPES = ['product', 'asset', 'plan', 'task', 'work_item', 'spec', 'release'] as const
export type SearchType = (typeof SEARCH_TYPES)[number]

export const SEARCH_TYPE_LABELS: Record<SearchType, string> = {
  product: 'Products',
  asset: 'Assets',
  plan: 'Code plans',
  task: 'Tasks',
  work_item: 'Work items',
  spec: 'Specs',
  release: 'Releases',
}

export type SearchResult = {
  type: SearchType
  id: string
  title: string
  /** A short excerpt of the text around the first match, or null when only the title matched. */
  snippet: string | null
  url: string
  productId: string
  productName: string
  status: string | null
  /** External key such as JIRA-123, for synced items. */
  key: string | null
  /** For tasks: the code plan they belong to. */
  context: string | null
  updatedAt: string | null
}

export type SearchOptions = {
  types?: readonly SearchType[]
  /** Only this product (must be visible to the user). */
  productId?: string
  /** Results per type. Default 5. */
  limit?: number
  /** Skip this many results per type (paging within one type). */
  offset?: number
  /** Also count all matches per type. */
  withCounts?: boolean
}

export type SearchResponse = {
  query: string
  terms: string[]
  results: SearchResult[]
  counts?: Record<SearchType, number>
}

export const MIN_QUERY_LENGTH = 2
