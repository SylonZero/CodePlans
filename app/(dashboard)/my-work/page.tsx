import { authAdapter } from '@/lib/auth'
import { getProductScope } from '@/lib/product-scope'
import { getMyWork } from '@/lib/db/my-work'
import { MyWorkClient } from './my-work-client'

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<{ lens?: string }> }) {
  const user = await authAdapter.getUser()
  if (!user) return null
  const scope = await getProductScope()
  const { lens } = await searchParams
  const work = await getMyWork(user.id, { productId: scope ?? undefined })
  const initialLens = work.lenses.find((l) => l === lens) ?? work.defaultLens

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">My Work</h1>
        <p className="text-muted-foreground">What needs you, what you&apos;re carrying, and what changed in the things you&apos;re responsible for</p>
      </div>
      <MyWorkClient work={work} initialLens={initialLens} />
    </div>
  )
}
