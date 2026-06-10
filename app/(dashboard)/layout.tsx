import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizations, products } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { AppShell } from '@/components/app-shell'
import { config } from '@/lib/config'
import { getProductScope } from '@/lib/product-scope'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authUser = await authAdapter.getUser()

  let shellUser: { name: string; email: string; billingTier: 'free' | 'pro' | 'team' | 'enterprise' } = { name: '', email: '', billingTier: 'free' }
  let orgName: string | null = null
  let productList: { id: string; name: string; slug: string }[] = []

  if (authUser) {
    const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })

    if (profile) {
      shellUser = {
        name: profile.name || authUser.email.split('@')[0] || '',
        email: profile.email,
        billingTier: profile.billingTier,
      }

      if (profile.organizationId) {
        const org = await db.query.organizations.findFirst({
          where: eq(organizations.id, profile.organizationId),
        })
        orgName = org?.name ?? null
      }

      const productFilter = profile.organizationId
        ? or(eq(products.creatorId, authUser.id), eq(products.organizationId, profile.organizationId))
        : eq(products.creatorId, authUser.id)

      const rows = await db
        .select({ id: products.id, name: products.name, slug: products.slug })
        .from(products)
        .where(productFilter)

      productList = rows
    }
  }

  const scopeId = await getProductScope()
  const selectedProductId = productList.some((p) => p.id === scopeId) ? scopeId : null

  return (
    <AppShell
      user={shellUser}
      orgName={orgName}
      products={productList}
      selectedProductId={selectedProductId}
      billingEnabled={config.billing.enabled}
    >
      {children}
    </AppShell>
  )
}
