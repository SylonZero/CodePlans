// Liveness + database check for platform health checks (Fly.io, Railway,
// Docker). Unauthenticated; reports nothing beyond up/down and the version.
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { config } from '@/lib/config'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import pkg from '@/package.json'

export const dynamic = 'force-dynamic'

async function healthy(): Promise<boolean> {
  // An enterprise module may check something else (e.g. a control database
  // when each workspace has its own); see `health` in lib/ee/types.ts.
  const custom = getEnterpriseHooks().health()
  if (custom) return custom.catch(() => false)
  try {
    await db.select({ one: sql<number>`1` }).from(users).limit(1)
    return true
  } catch {
    return false
  }
}

export async function GET() {
  const ok = await healthy()
  return Response.json(
    { status: ok ? 'ok' : 'error', version: pkg.version, database: config.db.provider },
    { status: ok ? 200 : 503 },
  )
}
