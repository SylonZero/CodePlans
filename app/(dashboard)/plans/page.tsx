import Link from 'next/link'
import { authAdapter } from '@/lib/auth'
import { getCodePlans, getProducts } from '@/lib/db/queries'
import { getProductScope } from '@/lib/product-scope'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'
import { PlansClient } from './plans-client'

type Props = {
  searchParams: Promise<{ product?: string }>
}

export default async function PlansPage({ searchParams }: Props) {
  const user = await authAdapter.getUser()
  if (!user) return null

  const { product: productParam } = await searchParams
  const scope = await getProductScope()
  const productId = productParam || scope || undefined

  const [plans, products] = await Promise.all([
    getCodePlans(user.id, { productId }),
    getProducts(user.id),
  ])

  const productList = products.map((p) => ({ id: p.id, name: p.name }))
  const enrichedPlans = plans.map((p) => ({
    ...p,
    productName: productList.find((prod) => prod.id === p.productId)?.name ?? '',
  }))

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Code Plans</h1>
          <p className="text-muted-foreground">Coordinate and track changes across your architecture</p>
        </div>
        <Button asChild>
          <Link href="/plans/new">
            <Plus className="mr-2 h-4 w-4" />
            New Plan
          </Link>
        </Button>
      </div>

      <PlansClient plans={enrichedPlans} products={productList} />
    </div>
  )
}
