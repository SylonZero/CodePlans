import { authAdapter } from '@/lib/auth'
import { getReleases, getProducts } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { ReleasesClient } from './releases-client'
import { ReleaseCreatePanel } from './release-create-panel'

type Props = {
  searchParams: Promise<{ product?: string }>
}

export default async function ReleasesPage({ searchParams }: Props) {
  const user = await authAdapter.getUser()
  if (!user) return null

  const { product: productParam } = await searchParams
  const scope = await getProductScope()
  const productId = productParam || scope || undefined

  const [releaseRows, products] = await Promise.all([
    getReleases(user.id, { productId }),
    getProducts(user.id),
  ])

  const productList = products.map((p) => ({ id: p.id, name: p.name }))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Releases</h1>
          <p className="text-muted-foreground">Group plans that ship together and stamp asset versions</p>
        </div>
        <ReleaseCreatePanel products={productList} defaultProductId={productId} />
      </div>
      <ReleasesClient releases={releaseRows} />
    </div>
  )
}
