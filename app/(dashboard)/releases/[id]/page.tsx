import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { authAdapter } from '@/lib/auth'
import { getRelease, getSuggestedReleaseAssets, getCodePlans } from '@/lib/db/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn, formatDateShort } from '@/lib/utils'
import { releaseStatusStyles, releaseStatusLabels } from '../releases-client'
import { ReleaseActions } from './release-actions'
import { ReleaseAssetsSection } from './release-assets-section'
import { ReleasePlansSection } from './release-plans-section'
import type { WorkItemType, WorkItemSeverity } from '@/lib/types'

const itemTypeLabels: Record<WorkItemType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  enhancement: 'Enhancement',
  ux: 'UX',
  tech_debt: 'Tech Debt',
}

const itemGroups: { title: string; types: WorkItemType[] }[] = [
  { title: 'Features', types: ['feature', 'enhancement'] },
  { title: 'Bugs & UX', types: ['bug', 'ux'] },
  { title: 'Tech Debt', types: ['tech_debt'] },
]

const severityStyles: Record<WorkItemSeverity, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

export default async function ReleaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await authAdapter.getUser()
  if (!user) return null

  const release = await getRelease(id, user.id)
  if (!release) notFound()

  const [suggestions, productPlans] = await Promise.all([
    getSuggestedReleaseAssets(id),
    getCodePlans(user.id, { productId: release.productId }),
  ])
  // Plans available to attach: same product, not cancelled, not already in a release.
  const attachable = productPlans
    .filter((p) => p.status !== 'cancelled' && !p.releaseId)
    .map((p) => ({ id: p.id, title: p.title, status: p.status }))

  const editable = release.status !== 'shipped' && release.status !== 'abandoned'
  const unversioned = release.assets.filter((a) => !a.version).map((a) => a.assetName)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/releases" className="hover:text-foreground transition-colors">
          Releases
        </Link>
        <span>/</span>
        <span className="text-foreground">{release.name}</span>
      </div>

      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex items-center gap-3 flex-wrap mb-1">
            <h1 className="text-2xl font-bold tracking-tight">{release.name}</h1>
            <Badge variant="secondary" className={cn('text-xs', releaseStatusStyles[release.status])}>
              {releaseStatusLabels[release.status]}
            </Badge>
          </div>
          <div className="flex items-center gap-3 text-sm text-muted-foreground flex-wrap">
            <span>{release.productName}</span>
            {release.shippedAt && <span>shipped {formatDateShort(release.shippedAt)}</span>}
            {release.tags.map((tag) => (
              <Badge key={tag} variant="outline" className="text-xs">
                {tag}
              </Badge>
            ))}
          </div>
        </div>
        <ReleaseActions releaseId={release.id} status={release.status} unversionedAssets={unversioned} />
      </div>

      {release.description && (
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Description</CardTitle>
          </CardHeader>
          <CardContent className="prose prose-sm dark:prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{release.description}</ReactMarkdown>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="assets">
        <TabsList className="bg-muted">
          <TabsTrigger value="assets">Assets &amp; Versions ({release.assets.length})</TabsTrigger>
          <TabsTrigger value="plans">Plans ({release.plans.length})</TabsTrigger>
          <TabsTrigger value="work-items">Work Items ({release.workItems.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-4">
          <ReleaseAssetsSection
            releaseId={release.id}
            assets={release.assets}
            suggestions={suggestions}
            prChips={Object.fromEntries(release.assetPrChips)}
            editable={editable}
          />
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          <ReleasePlansSection
            releaseId={release.id}
            plans={release.plans}
            attachable={attachable}
            editable={editable}
          />
        </TabsContent>

        <TabsContent value="work-items" className="mt-4">
          {release.workItems.length === 0 ? (
            <Card className="bg-card border-border">
              <CardContent className="py-8 text-center text-sm text-muted-foreground">
                Work items linked to this release&apos;s plans appear here — the release-notes rollup.
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {itemGroups.map((group) => {
                const items = release.workItems.filter((i) => group.types.includes(i.type))
                if (items.length === 0) return null
                return (
                  <Card key={group.title} className="bg-card border-border">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">
                        {group.title} ({items.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="divide-y divide-border">
                        {items.map((item) => (
                          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                            <Link
                              href={`/work-items?item=${item.id}`}
                              className="text-sm font-medium truncate hover:text-accent transition-colors"
                            >
                              {item.title}
                            </Link>
                            <div className="flex items-center gap-2 shrink-0">
                              <Badge variant="secondary" className="text-xs">
                                {itemTypeLabels[item.type]}
                              </Badge>
                              <Badge
                                variant="secondary"
                                className={cn('text-xs capitalize', severityStyles[item.severity])}
                              >
                                {item.severity}
                              </Badge>
                              <Badge variant="secondary" className="text-xs capitalize">
                                {item.status.replace('_', ' ')}
                              </Badge>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
