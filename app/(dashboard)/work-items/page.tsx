import { authAdapter } from '@/lib/auth'
import { getWorkItems, getCodePlans, getProducts, getAssetOptions, getTeamMembers } from '@/lib/db/queries'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getProductScope } from '@/lib/product-scope'
import { WorkItemsClient } from './work-items-client'

export default async function WorkItemsPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const scope = await getProductScope()

  const [items, plans, products, assetOptions] = await Promise.all([
    getWorkItems(user.id, { productId: scope ?? undefined }),
    getCodePlans(user.id, { productId: scope ?? undefined }),
    getProducts(user.id), // all accessible products — create form needs the full list
    getAssetOptions(user.id),
  ])

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) })
  const teamMembers = profile?.organizationId ? await getTeamMembers(profile.organizationId) : []
  const memberList = teamMembers.map((m) => ({ id: m.userId, name: m.user.name }))

  const planList = plans
    .filter((p) => p.status === 'draft' || p.status === 'active')
    .map((p) => ({ id: p.id, title: p.title }))
  const productList = products.map((p) => ({ id: p.id, name: p.name }))

  return (
    <div className="space-y-8">
      <WorkItemsClient
        items={items}
        plans={planList}
        products={productList}
        assets={assetOptions}
        members={memberList}
        scopedProductId={scope}
      />
    </div>
  )
}
