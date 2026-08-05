import { authAdapter } from '@/lib/auth'
import { getAssetInventory } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { AssetsClient } from './assets-client'

type Props = {
  searchParams: Promise<{ product?: string }>
}

export default async function AssetsPage({ searchParams }: Props) {
  const user = await authAdapter.getUser()
  if (!user) return null

  const { product: productParam } = await searchParams
  const scope = await getProductScope()
  const productId = productParam || scope || undefined

  const inventory = await getAssetInventory(user.id, { productId })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Assets</h1>
        <p className="text-muted-foreground">
          Every asset across your architecture — mapped, measured, and one click from its record
        </p>
      </div>
      <AssetsClient inventory={inventory} />
    </div>
  )
}
