import Link from 'next/link'
import { notFound } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProduct, getCodePlans, getProductDependencyEdges, getTeamMembers } from '@/lib/db/queries'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { DependenciesSection } from './dependencies-section'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import { AssetsSection, AssetCreatePanel } from './assets-section'
import { ProductEditPanel } from './product-edit-panel'
import { MuteButton } from '@/components/mute-button'
import { isMuted } from '@/lib/db/notification-settings'
import { ArchivedProductBanner } from './archived-product-banner'
import { PlanCreatePanel } from '../../plans/plan-create-panel'
import { PeopleSection } from './people-section'
import { WorkflowCard } from './workflow-card'
import { getWorkflowLevel, getOrgWorkflowDefault, availableWorkflowLevels } from '@/lib/db/workflow'
import { getProductPeople, canManageResponsibilities } from '@/lib/db/responsibilities'

export default async function ProductDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const user = await authAdapter.getUser()
  if (!user) return null

  const product = await getProduct(slug, user.id)
  if (!product) notFound()

  // Scoped + includeArchived: this page has already resolved access to `product`
  // directly (including when it's itself archived) — a plain getCodePlans(user.id)
  // would silently drop this product's plans if the product is archived, since
  // that call excludes archived products from the accessible-products set.
  const productPlans = await getCodePlans(user.id, { productId: product.id, includeArchived: true })
  const dependencyEdges = await getProductDependencyEdges(product.id)

  // People who can be assigned come from the product's org, not the viewer's current one.
  const productOrgId = product.organizationId ?? null
  const teamMembers = productOrgId ? await getTeamMembers(productOrgId) : []
  const creator = productOrgId ? null : await db.query.users.findFirst({ where: eq(users.id, product.creatorId) })
  const memberList = productOrgId
    ? teamMembers.map((m) => ({ id: m.userId, name: m.user.name }))
    : creator ? [{ id: creator.id, name: creator.name }] : []
  const [people, canManagePeople, workflow, orgDefault] = await Promise.all([
    getProductPeople(product.id, user.id),
    canManageResponsibilities(user.id, product.id),
    getWorkflowLevel(product.id),
    getOrgWorkflowDefault(productOrgId),
  ])

  return (
    <div className="space-y-6">
      {product.archivedAt && <ArchivedProductBanner id={product.id} slug={slug} />}

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
            {user && <MuteButton subjectType="product" subjectId={product.id} muted={await isMuted(user.id, 'product', product.id)} />}
          {!product.archivedAt && (
            <>
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
            </>
          )}
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
          <TabsTrigger value="dependencies">Dependencies ({dependencyEdges.length})</TabsTrigger>
          <TabsTrigger value="people">People &amp; reviews</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="space-y-6">
          <AssetsSection assets={product.assets} productId={product.id} productSlug={slug} members={memberList} />
        </TabsContent>

        <TabsContent value="dependencies" className="space-y-6">
          <DependenciesSection
            productSlug={slug}
            edges={dependencyEdges}
            assets={product.assets.map((a) => ({ id: a.id, name: a.name }))}
          />
        </TabsContent>

        <TabsContent value="people" className="space-y-6">
          <WorkflowCard productId={product.id} productSlug={slug} level={workflow.level} inherited={workflow.inherited} orgDefault={orgDefault}
            available={availableWorkflowLevels()} canManage={canManagePeople && !product.archivedAt} />
          <PeopleSection
            productId={product.id}
            productSlug={slug}
            members={people.members}
            codeOwners={people.codeOwners}
            candidates={memberList}
            canManage={canManagePeople && !product.archivedAt}
          />
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
