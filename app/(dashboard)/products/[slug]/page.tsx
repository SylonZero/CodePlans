import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProduct, getCodePlans } from '@/lib/db/queries'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssetsSection, AssetCreatePanel } from './assets-section'
import { ProductEditPanel } from './product-edit-panel'
import { PlanCreatePanel } from '../../plans/plan-create-panel'

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
            <ProductEditPanel
              product={{
                id: product.id,
                slug: product.slug,
                name: product.name,
                description: product.description,
                tags: product.tags,
              }}
            />
            <AssetCreatePanel productId={product.id} productSlug={slug} />
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
          <AssetsSection assets={product.assets} productId={product.id} productSlug={slug} />
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
                <PlanCreatePanel
                  products={[{ id: product.id, name: product.name }]}
                  defaultProductId={product.id}
                  trigger={
                    <Button>
                      <Plus className="mr-2 h-4 w-4" />
                      Create Plan
                    </Button>
                  }
                />
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  )
}
