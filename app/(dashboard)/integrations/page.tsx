import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getIntegrations, getProducts } from '@/lib/db/queries'
import { IntegrationsClient } from './integrations-client'

export default async function IntegrationsPage() {
  const user = await authAdapter.getUser()
  if (!user) return null

  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) })
  const [connections, products] = await Promise.all([
    profile?.organizationId ? getIntegrations(profile.organizationId) : Promise.resolve([]),
    getProducts(user.id),
  ])

  return (
    <div className="space-y-8">
      <IntegrationsClient
        connections={connections}
        products={products.map((p) => ({ id: p.id, name: p.name }))}
        hasOrg={!!profile?.organizationId}
      />
    </div>
  )
}
