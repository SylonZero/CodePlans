import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProduct, getCodePlans } from '@/lib/db/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Plus,
  Settings,
  Box,
  Server,
  Library,
  Database,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
} from 'lucide-react'
import type { AssetType, Asset } from '@/lib/types'
import { cn } from '@/lib/utils'

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

const healthIcons = {
  healthy: CheckCircle2,
  warning: AlertTriangle,
  critical: XCircle,
}

const healthStyles = {
  healthy: 'text-accent',
  warning: 'text-warning',
  critical: 'text-destructive',
}

function AssetCard({ asset }: { asset: Asset }) {
  const Icon = assetTypeIcons[asset.type]
  const HealthIcon = healthIcons[asset.health]

  return (
    <Card className="bg-card border-border hover:border-muted-foreground/30 transition-colors">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted">
              <Icon className="h-5 w-5 text-muted-foreground" />
            </div>
            <div>
              <CardTitle className="text-base">{asset.name}</CardTitle>
              <p className="text-sm text-muted-foreground">{assetTypeLabels[asset.type]}</p>
            </div>
          </div>
          <div className={cn('flex items-center gap-1', healthStyles[asset.health])}>
            <HealthIcon className="h-4 w-4" />
            <span className="text-xs capitalize">{asset.health}</span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground line-clamp-2">{asset.description}</p>
        <div className="flex flex-wrap gap-1.5">
          {asset.tags.slice(0, 4).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
          ))}
        </div>
        {asset.techDebtScore !== undefined && (
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <span className="text-xs text-muted-foreground">Tech Debt Score</span>
            <div className="flex items-center gap-2">
              <div className="h-1.5 w-24 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full',
                    asset.techDebtScore < 25 ? 'bg-accent' : asset.techDebtScore < 50 ? 'bg-warning' : 'bg-destructive'
                  )}
                  style={{ width: `${Math.min(asset.techDebtScore, 100)}%` }}
                />
              </div>
              <span className="text-xs font-medium">{asset.techDebtScore}</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await authAdapter.getUser()
  if (!user) return null

  const [product, plans] = await Promise.all([
    getProduct(slug, user.id),
    getCodePlans(user.id),
  ])

  if (!product) notFound()

  const productPlans = plans.filter((p) => p.productId === product.id)

  const assetsByType = product.assets.reduce((acc, asset) => {
    if (!acc[asset.type]) acc[asset.type] = []
    acc[asset.type].push(asset)
    return acc
  }, {} as Record<AssetType, Asset[]>)

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/products" className="hover:text-foreground transition-colors">Products</Link>
          <span>/</span>
          <span className="text-foreground">{product.name}</span>
        </div>

        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{product.name}</h1>
            <p className="text-muted-foreground">{product.description}</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link href={`/products/${slug}/edit`}>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </Link>
            </Button>
            <Button asChild>
              <Link href={`/products/${slug}/assets/new`}>
                <Plus className="mr-2 h-4 w-4" />
                Add Asset
              </Link>
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mt-4">
          {product.tags.map((tag) => (
            <Badge key={tag} variant="secondary">{tag}</Badge>
          ))}
        </div>
      </div>

      <Tabs defaultValue="assets" className="space-y-6">
        <TabsList className="bg-muted">
          <TabsTrigger value="assets">Assets ({product.assets.length})</TabsTrigger>
          <TabsTrigger value="plans">Code Plans ({productPlans.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          {(Object.keys(assetTypeIcons) as AssetType[]).map((type) => {
            const typeAssets = assetsByType[type] || []
            if (typeAssets.length === 0) return null
            return (
              <div key={type}>
                <div className="flex items-center gap-2 mb-4">
                  <h2 className="text-lg font-semibold">{assetTypeLabels[type]}s</h2>
                  <Badge variant="secondary">{typeAssets.length}</Badge>
                </div>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                  {typeAssets.map((asset) => <AssetCard key={asset.id} asset={asset} />)}
                </div>
              </div>
            )
          })}
          {product.assets.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Box className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No assets yet</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Add your first asset to start tracking your architecture
                </p>
                <Button asChild>
                  <Link href={`/products/${slug}/assets/new`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Asset
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="plans" className="space-y-4">
          {productPlans.map((plan) => (
            <Card key={plan.id} className="bg-card border-border">
              <CardContent className="flex items-center justify-between py-4">
                <div>
                  <Link href={`/plans/${plan.id}`} className="font-medium hover:text-accent transition-colors">
                    {plan.title}
                  </Link>
                  <p className="text-sm text-muted-foreground">{plan.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  <Badge
                    variant="secondary"
                    className={cn(
                      plan.status === 'active' && 'bg-chart-1/20 text-chart-1',
                      plan.status === 'completed' && 'bg-accent/20 text-accent',
                      plan.status === 'draft' && 'bg-muted text-muted-foreground'
                    )}
                  >
                    {plan.status}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {plan.completedTaskCount}/{plan.taskCount} tasks
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
          {productPlans.length === 0 && (
            <Card className="border-dashed">
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Plus className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-1">No code plans yet</h3>
                <p className="text-sm text-muted-foreground mb-4">Create a code plan to coordinate changes</p>
                <Button asChild>
                  <Link href={`/plans/new?product=${product.id}`}>
                    <Plus className="mr-2 h-4 w-4" />
                    Create Plan
                  </Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
