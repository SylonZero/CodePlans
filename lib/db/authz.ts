import { db } from './index'
import { organizations } from './schema'
import { eq } from 'drizzle-orm'

/**
 * Shared authorization library. Both the web UI (app/(dashboard)/actions.ts)
 * and the MCP tools (app/api/mcp/[transport]/route.ts) must call these
 * functions rather than reimplementing checks — a policy change here takes
 * effect for every caller at once. See spec "Delete Authorization Rules".
 */

/**
 * The organization's durable owner. `organizations.ownerId` is set once at
 * creation and never reassigned anywhere in this codebase — never substitute
 * the mutable `role` column here, since role assignment is exactly what this
 * check protects (a compromised role can't be trusted to validate itself).
 */
export async function isOrgOwner(organizationId: string, userId: string): Promise<boolean> {
  const org = await db.query.organizations.findFirst({ where: eq(organizations.id, organizationId) })
  return org?.ownerId === userId
}
