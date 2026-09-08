export const wikiKinds = [
  'asset',
  'asset-notes',
  'spec',
  'plan',
  'work-item',
  'note',
  'capability',
  'release',
] as const
export type WikiKind = (typeof wikiKinds)[number]
export const kindLabels: Record<WikiKind, string> = {
  asset: 'Asset',
  'asset-notes': 'Asset notes',
  spec: 'Spec',
  plan: 'Plan',
  'work-item': 'Work item',
  note: 'Design decision',
  capability: 'Capability',
  release: 'Release',
}
export type WikiAssociation = {
  assetId: string
  via?: string
  label: string
  relationship?: string
}
export type WikiDocument = {
  key: string
  id: string
  kind: WikiKind
  title: string
  body: string
  status: string
  area?: string | null
  tags: string[]
  searchContext?: string
  createdAt: string
  updatedAt: string
  createdBy: string | null
  updatedBy: string | null
  createdByKind?: string | null
  updatedByKind?: string | null
  version?: number
  specType?: string
  sourceUrl?: string | null
  sourceType?: string
  needsReview?: boolean
  placeholder?: boolean
  associations: WikiAssociation[]
  related: string[]
  editUrl: string
  supersedes?: string | null
  supersededBy?: string | null
}
export type WikiAsset = {
  id: string
  name: string
  type: string
  layer: string
  explicitLayer: boolean
  status: string
  health: string
  repositoryUrl?: string | null
  repoPath?: string | null
  documentationUrl?: string | null
  owners: string[]
  version?: string
  shippedAt?: string
}
export type WikiActivity = {
  id: string
  title: string
  date: string
  kind: string
  documentKeys: string[]
  assetIds: string[]
  count?: number
}
export type WikiData = {
  product: { id: string; name: string; slug: string; description: string }
  assets: WikiAsset[]
  documents: WikiDocument[]
  dependencies: {
    sourceAssetId: string
    targetAssetId: string
    description: string | null
  }[]
  activity: WikiActivity[]
  receipts: {
    assetId: string
    specId: string
    version: number
    capabilityKey: string
    removed: boolean
  }[]
}
export function wikiHref(
  slug: string,
  params: Record<string, string | undefined> = {},
) {
  const query = new URLSearchParams(
    Object.entries(params).filter(
      (x): x is [string, string] => x[1] !== undefined && x[1] !== '',
    ),
  )
  return `/wiki/${encodeURIComponent(slug)}${query.size ? `?${query}` : ''}`
}
export const inactiveStatuses = new Set([
  'archived',
  'superseded',
  'removed',
  'cancelled',
  'abandoned',
  'wont_do',
  'deprecated',
])
export function plainText(value: string) {
  return value
    .replace(/```[^\n]*\n|~~~[^\n]*\n/g, '')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#*`>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
export function searchWiki(
  documents: WikiDocument[],
  filters: {
    q?: string
    asset?: string
    kind?: string
    status?: string
    since?: string
    archived?: boolean
    review?: boolean
    area?: string
  },
) {
  const terms = (filters.q ?? '')
    .trim()
    .toLocaleLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 20)
  return documents
    .flatMap((doc) => {
      if (
        filters.asset &&
        !doc.associations.some((a) => a.assetId === filters.asset)
      )
        return []
      if (filters.kind && filters.kind !== doc.kind) return []
      if (
        filters.status
          ? doc.status !== filters.status
          : !filters.archived && inactiveStatuses.has(doc.status)
      )
        return []
      if (filters.review && !doc.needsReview) return []
      if (filters.area && doc.area !== filters.area) return []
      if (
        filters.since &&
        /^\d{4}-\d{2}-\d{2}$/.test(filters.since) &&
        doc.updatedAt.slice(0, 10) < filters.since
      )
        return []
      const body = plainText(doc.body),
        title = doc.title.toLocaleLowerCase()
      const headings = doc.body
        .split('\n')
        .filter((l) => /^#{1,6}\s/.test(l))
        .join(' ')
        .toLocaleLowerCase()
      const metadata = [doc.area, doc.specType, doc.searchContext, ...doc.tags]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase()
      const haystack = `${title} ${metadata} ${body.toLocaleLowerCase()}`
      if (!terms.every((t) => haystack.includes(t))) return []
      const score = terms.reduce(
        (n, t) =>
          n +
          (title === t ? 100 : title.includes(t) ? 30 : 0) +
          (headings.includes(t) ? 15 : 0) +
          (metadata.includes(t) ? 8 : 0) +
          (body.toLocaleLowerCase().includes(t) ? 1 : 0),
        0,
      )
      const position = terms.length
        ? Math.max(
            0,
            body
              .toLocaleLowerCase()
              .indexOf(
                terms.find((t) => body.toLocaleLowerCase().includes(t)) ?? '',
              ) - 70,
          )
        : 0
      const excerpt =
        (position ? '…' : '') +
        body.slice(position, position + 220) +
        (body.length > position + 220 ? '…' : '')
      return [{ document: doc, score, excerpt }]
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.document.updatedAt.localeCompare(a.document.updatedAt) ||
        a.document.key.localeCompare(b.document.key),
    )
}
