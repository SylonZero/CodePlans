import Link from 'next/link'
import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { getProducts } from '@/lib/db/queries'
import { PlanForm } from './plan-form'

export default async function NewPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>
}) {
  const { product: preselectedProductId } = await searchParams
  const user = await authAdapter.getUser()
  if (!user) redirect('/login')

  const products = await getProducts(user.id)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <Link href="/plans" className="hover:text-foreground transition-colors">Code Plans</Link>
          <span>/</span>
          <span className="text-foreground">New Plan</span>
        </div>
        <h1 className="text-2xl font-bold tracking-tight">New Code Plan</h1>
        <p className="text-muted-foreground">Coordinate a set of related changes across your architecture.</p>
      </div>
      <PlanForm products={products} preselectedProductId={preselectedProductId} />
    </div>
  )
}
