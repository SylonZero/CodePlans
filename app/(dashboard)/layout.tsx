import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users, organizations, products } from '@/lib/db/schema'
import { eq, or } from 'drizzle-orm'
import { AppShell } from '@/components/app-shell'
import { Toaster } from '@/components/ui/sonner'
import { getProductScope } from '@/lib/product-scope'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { canCreateProductIn } from '@/lib/db/authz'
import { countUnread } from '@/lib/db/notifications'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const authUser = await authAdapter.getUser()

  let shellUser: { name: string; email: string; viewOnly?: boolean } = { name: '', email: '' }
  let orgName: string | null = null
  let productList: { id: string; name: string; slug: string }[] = []

  if (authUser) {
    const profile = await db.query.users.findFirst({ where: eq(users.id, authUser.id) })

    if (profile) {
      shellUser = {
        name: profile.name || authUser.email.split('@')[0] || '',
        email: profile.email,
        // Current workspace role; per-product enforcement lives in lib/db/authz.ts.
        viewOnly: profile.organizationId ? !(await canCreateProductIn(authUser.id, profile.organizationId)) : false,
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

  const unreadNotifications = authUser ? await countUnread(authUser.id) : 0
  const scopeId = await getProductScope()
  const selectedProductId = productList.some((p) => p.id === scopeId) ? scopeId : null

  return (
    <AppShell
      user={shellUser}
      orgName={orgName}
      products={productList}
      selectedProductId={selectedProductId}
      extraNavItems={getEnterpriseHooks().navItems()}
      notice={getEnterpriseHooks().workspaceNotice()}
      unreadNotifications={unreadNotifications}
    >
      {children}
      <Toaster position="bottom-right" />
    </AppShell>
  )
}
