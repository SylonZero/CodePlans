// Community functions handed to an enterprise module's `register` (see
// EnterpriseHost in ./types). Imports are lazy so loading the enterprise
// module never opens a database by itself.
import type { EnterpriseHost } from './types'

export const enterpriseHost: EnterpriseHost = {
  async migrateDatabase() {
    const { migrateDatabase } = await import('@/lib/db/migrate')
    const { applied, total } = await migrateDatabase()
    return { applied, total }
  },
  async createOwnerAccount(input) {
    const { createOwnerAccount } = await import('@/lib/db/first-run')
    return createOwnerAccount(input)
  },
  async countMembers() {
    const { db } = await import('@/lib/db')
    const { organizationMembers } = await import('@/lib/db/schema')
    const { count, isNotNull } = await import('drizzle-orm')
    // Joined members only: pending invites aren't members yet.
    const [row] = await db.select({ n: count() }).from(organizationMembers).where(isNotNull(organizationMembers.joinedAt))
    return Number(row?.n ?? 0)
  },
}
