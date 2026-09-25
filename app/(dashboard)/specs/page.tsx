import { authAdapter } from '@/lib/auth'
import { listSpecs } from '@/lib/db/specs'
import { getProducts } from '@/lib/db/queries'
import { canWriteProduct } from '@/lib/db/authz'
import { getProductScope } from '@/lib/product-scope'
import { SpecsClient, type SpecListRow } from './specs-client'
import { SpecCreatePanel } from './spec-create-panel'

export default async function SpecsPage() {
  const user = await authAdapter.getUser()
  if (!user) return null
  const scope = await getProductScope()

  const [specRows, products] = await Promise.all([
    listSpecs(user.id, { productId: scope ?? undefined }),
    getProducts(user.id),
  ])
  const productNames = new Map(products.map((p) => [p.id, p.name]))
  const writable = (await Promise.all(products.map(async (p) => ((await canWriteProduct(user.id, p.id)) ? p : null))))
    .filter((p): p is (typeof products)[number] => p !== null)
    .map((p) => ({ id: p.id, name: p.name }))

  const rows: SpecListRow[] = specRows.map((s) => ({
    id: s.id,
    title: s.title,
    productName: productNames.get(s.productId) ?? '',
    specType: s.specType,
    area: s.area,
    status: s.status,
    version: s.version,
    needsReview: s.needsReview,
    authorType: s.authorType,
    updatedAt: s.updatedAt.toISOString(),
    linkCount: s.links.length,
  }))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Specs</h1>
          <p className="text-muted-foreground">Versioned design intent for your assets, plans and work items</p>
        </div>
        {writable.length > 0 && <SpecCreatePanel products={writable} defaultProductId={scope ?? undefined} />}
      </div>
      <SpecsClient specs={rows} showProduct={!scope} />
    </div>
  )
}
