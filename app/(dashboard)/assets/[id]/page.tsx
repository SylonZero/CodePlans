import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getAssetDetail, getWorkItems } from '@/lib/db/queries'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { OwnerAvatars } from '@/components/owner-avatars'
import { Box, Server, Library, Database, Globe, ExternalLink, BookOpen, GitBranch, ArrowUpRight, ArrowDownLeft } from 'lucide-react'
import type { AssetType, CodePlanStatus, CodePlanType, WorkItemSeverity, WorkItemStatus, WorkItemType, PrStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { AssetContentCard } from './asset-content-cards'

const assetTypeIcons: Record<AssetType, typeof Box> = {
  app: Box,
  service: Server,
  library: Library,
  datastore: Database,
  platform: Globe,
}

const assetTypeLabels: Record<AssetType, string> = {
  app: 'Application',
  service: 'Service',
  library: 'Library',
  datastore: 'Datastore',
  platform: 'Platform',
}

const healthStyles: Record<string, string> = {
  healthy: 'bg-accent/20 text-accent',
  warning: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const severityStyles: Record<WorkItemSeverity, string> = {
  low: 'bg-muted text-muted-foreground',
  medium: 'bg-chart-2/20 text-chart-2',
  high: 'bg-warning/20 text-warning',
  critical: 'bg-destructive/20 text-destructive',
}

const itemStatusStyles: Record<WorkItemStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  planned: 'bg-chart-4/20 text-chart-4',
  in_progress: 'bg-chart-1/20 text-chart-1',
  resolved: 'bg-accent/20 text-accent',
  wont_do: 'bg-muted text-muted-foreground line-through',
}

const typeLabel: Record<WorkItemType, string> = {
  feature: 'Feature',
  bug: 'Bug',
  enhancement: 'Enhancement',
  ux: 'UX',
  tech_debt: 'Tech Debt',
}

const planStatusStyles: Record<CodePlanStatus, string> = {
  draft: 'bg-muted text-muted-foreground',
  active: 'bg-chart-1/20 text-chart-1',
  completed: 'bg-accent/20 text-accent',
  cancelled: 'bg-destructive/20 text-destructive',
}

const planTypeLabels: Record<CodePlanType, string> = {
  refactor: 'Refactor',
  feature: 'Feature',
  improvement: 'Improvement',
  bugfix: 'Bug Fix',
}

const prStatusStyles: Record<PrStatus, string> = {
  none: 'bg-muted text-muted-foreground',
  draft: 'bg-muted text-muted-foreground',
  open: 'bg-chart-1/20 text-chart-1',
  merged: 'bg-accent/20 text-accent',
  closed: 'bg-destructive/20 text-destructive',
}

export default async function AssetDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await authAdapter.getUser()
  if (!user) return null

  const asset = await getAssetDetail(id, user.id)
  if (!asset) notFound()

  const items = await getWorkItems(user.id, { assetId: id })
  const openStatuses: WorkItemStatus[] = ['open', 'planned', 'in_progress']
  const openItems = items.filter((i) => openStatuses.includes(i.status))
  const severityRank: Record<WorkItemSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 }
  const debtItems = openItems
    .filter((i) => i.type === 'tech_debt')
    .sort((a, b) => severityRank[a.severity] - severityRank[b.severity])
  const upstream = asset.dependencyEdges.filter((e) => e.direction === 'upstream')
  const downstream = asset.dependencyEdges.filter((e) => e.direction === 'downstream')
  const effectiveScore = asset.techDebtScore ?? asset.derivedTechDebtScore
  const Icon = assetTypeIcons[asset.type]

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
        <span>/</span>
        <Link href={`/products/${asset.productSlug}`} className="hover:text-foreground transition-colors">
          {asset.productName}
        </Link>
        <span>/</span>
        <span className="text-foreground">{asset.name}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-4">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-muted shrink-0">
            <Icon className="h-6 w-6 text-muted-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap mb-1">
              <h1 className="text-2xl font-bold tracking-tight">{asset.name}</h1>
              <Badge variant="secondary" className="text-xs">{assetTypeLabels[asset.type]}</Badge>
              <Badge variant="secondary" className={cn('text-xs capitalize', healthStyles[asset.health])}>
                {asset.health}
              </Badge>
            </div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
              {asset.repositoryUrl && (
                <a href={asset.repositoryUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-accent transition-colors">
                  <GitBranch className="h-3.5 w-3.5" />
                  {asset.repoPath ?? 'Repository'}
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
              {asset.documentationUrl && (
                <a href={asset.documentationUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 hover:text-accent transition-colors">
                  <BookOpen className="h-3.5 w-3.5" />
                  Docs
                  <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            {asset.tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2">
                {asset.tags.map((tag) => (
                  <Badge key={tag} variant="outline" className="text-xs">{tag}</Badge>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          {asset.owners.length > 0 ? (
            <div className="flex items-center gap-2">
              <OwnerAvatars owners={asset.owners} size="md" />
              <span className="text-sm text-muted-foreground">
                {asset.owners.map((o) => o.name).join(', ')}
              </span>
            </div>
          ) : (
            <span className="text-sm text-muted-foreground">No owners</span>
          )}
        </div>
      </div>

      {/* Debt / activity summary */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Tech Debt Score</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex items-end gap-3">
              <span className="text-3xl font-bold">{effectiveScore}</span>
              <span className="text-xs text-muted-foreground mb-1">
                {asset.techDebtScore != null
                  ? 'manually set'
                  : `derived from ${asset.openDebtCount} open item${asset.openDebtCount === 1 ? '' : 's'}`}
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-3">
              <div
                className={cn(
                  'h-full rounded-full',
                  effectiveScore < 25 ? 'bg-accent' : effectiveScore < 50 ? 'bg-warning' : 'bg-destructive',
                )}
                style={{ width: `${Math.min(effectiveScore, 100)}%` }}
              />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Open Work Items</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{openItems.length}</span>
            <p className="text-xs text-muted-foreground mt-1">
              {debtItems.length} tech debt · {openItems.length - debtItems.length} other
            </p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Code Plans</CardTitle>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{asset.plans.length}</span>
            <p className="text-xs text-muted-foreground mt-1">
              {asset.plans.filter((p) => p.planStatus === 'active').length} active
            </p>
          </CardContent>
        </Card>
      </div>

      <AssetContentCard assetId={asset.id} productSlug={asset.productSlug} field="description" value={asset.description} />
      <AssetContentCard assetId={asset.id} productSlug={asset.productSlug} field="notes" value={asset.notes ?? ''} />

      <Tabs defaultValue="work-items">
        <TabsList className="bg-muted">
          <TabsTrigger value="work-items">Work Items ({items.length})</TabsTrigger>
          <TabsTrigger value="debt">Tech Debt ({debtItems.length})</TabsTrigger>
          <TabsTrigger value="plans">Code Plans ({asset.plans.length})</TabsTrigger>
          <TabsTrigger value="dependencies">Dependencies ({asset.dependencyEdges.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="work-items" className="mt-4">
          {items.length === 0 ? (
            <EmptyTab>No work items target this asset yet.</EmptyTab>
          ) : (
            <Card className="bg-card border-border">
              <CardContent className="pt-6">
                <ul className="divide-y divide-border">
                  {items.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link
                          href={`/work-items?item=${item.id}`}
                          className={cn(
                            'text-sm font-medium truncate block hover:text-accent transition-colors',
                            item.status === 'wont_do' && 'line-through text-muted-foreground',
                          )}
                        >
                          {item.title}
                        </Link>
                        {item.area && <p className="text-xs text-muted-foreground">{item.area}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="secondary" className="text-xs">{typeLabel[item.type]}</Badge>
                        <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[item.severity])}>
                          {item.severity}
                        </Badge>
                        <Badge variant="secondary" className={cn('text-xs capitalize', itemStatusStyles[item.status])}>
                          {item.status.replace('_', ' ')}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="debt" className="mt-4">
          {debtItems.length === 0 ? (
            <EmptyTab>No open tech debt on this asset.</EmptyTab>
          ) : (
            <Card className="bg-card border-border">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">
                  {asset.techDebtScore != null
                    ? `Score ${asset.techDebtScore} is a manual override — the derived score from these items is ${asset.derivedTechDebtScore}.`
                    : `Score ${asset.derivedTechDebtScore} is severity-weighted from the items below.`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="divide-y divide-border">
                  {debtItems.map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <Link href={`/work-items?item=${item.id}`} className="text-sm font-medium truncate block hover:text-accent transition-colors">
                          {item.title}
                        </Link>
                        {item.area && <p className="text-xs text-muted-foreground">{item.area}</p>}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {item.linkedPlans.length > 0 && (
                          <Badge variant="outline" className="text-xs">
                            {item.linkedPlans.length} plan{item.linkedPlans.length > 1 ? 's' : ''}
                          </Badge>
                        )}
                        <Badge variant="secondary" className={cn('text-xs capitalize', severityStyles[item.severity])}>
                          {item.severity}
                        </Badge>
                      </div>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plans" className="mt-4">
          {asset.plans.length === 0 ? (
            <EmptyTab>No code plans target this asset.</EmptyTab>
          ) : (
            <div className="space-y-3">
              {asset.plans.map((plan) => (
                <Card key={plan.planId} className="bg-card border-border">
                  <CardContent className="py-4">
                    <div className="flex items-center justify-between gap-3 flex-wrap">
                      <div className="flex items-center gap-2 min-w-0">
                        <Link href={`/plans/${plan.planId}`} className="text-sm font-medium truncate hover:text-accent transition-colors">
                          {plan.planTitle}
                        </Link>
                        <Badge variant="secondary" className="text-xs">{planTypeLabels[plan.planType]}</Badge>
                        <Badge variant="secondary" className={cn('text-xs', planStatusStyles[plan.planStatus])}>
                          {plan.planStatus}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {plan.branch && (
                          <span className="flex items-center gap-1 text-xs text-muted-foreground font-mono">
                            <GitBranch className="h-3 w-3" />
                            {plan.branch}
                          </span>
                        )}
                        {plan.prStatus !== 'none' && (
                          plan.prUrl ? (
                            <a href={plan.prUrl} target="_blank" rel="noreferrer">
                              <Badge variant="secondary" className={cn('text-xs', prStatusStyles[plan.prStatus])}>
                                PR {plan.prStatus}
                              </Badge>
                            </a>
                          ) : (
                            <Badge variant="secondary" className={cn('text-xs', prStatusStyles[plan.prStatus])}>
                              PR {plan.prStatus}
                            </Badge>
                          )
                        )}
                      </div>
                    </div>
                    {plan.notes && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-line">{plan.notes}</p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="dependencies" className="mt-4">
          {asset.dependencyEdges.length === 0 ? (
            <EmptyTab>No dependency edges recorded for this asset.</EmptyTab>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              <DependencyList
                title="Depends on"
                icon={ArrowUpRight}
                edges={upstream}
                empty="This asset doesn't depend on anything recorded."
              />
              <DependencyList
                title="Depended on by"
                icon={ArrowDownLeft}
                edges={downstream}
                empty="Nothing recorded depends on this asset."
              />
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}

function EmptyTab({ children }: { children: React.ReactNode }) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="py-8 text-center text-sm text-muted-foreground">{children}</CardContent>
    </Card>
  )
}

function DependencyList({
  title,
  icon: TitleIcon,
  edges,
  empty,
}: {
  title: string
  icon: typeof ArrowUpRight
  edges: import('@/lib/db/queries').AssetDependencyRow[]
  empty: string
}) {
  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <TitleIcon className="h-4 w-4" />
          {title} ({edges.length})
        </CardTitle>
      </CardHeader>
      <CardContent>
        {edges.length === 0 ? (
          <p className="text-sm text-muted-foreground">{empty}</p>
        ) : (
          <ul className="divide-y divide-border">
            {edges.map((edge) => (
              <li key={edge.edgeId} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Link href={`/assets/${edge.assetId}`} className="text-sm font-medium truncate hover:text-accent transition-colors">
                      {edge.assetName}
                    </Link>
                    <Badge variant="secondary" className="text-xs capitalize">{edge.assetType}</Badge>
                    {edge.health !== 'healthy' && (
                      <Badge variant="secondary" className={cn('text-xs capitalize', healthStyles[edge.health])}>
                        {edge.health}
                      </Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-xs text-muted-foreground">{edge.dependencyType.replace(/_/g, ' ')}</span>
                    <OwnerAvatars owners={edge.owners} />
                  </div>
                </div>
                {edge.description && (
                  <p className="text-xs text-muted-foreground mt-1">{edge.description}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
