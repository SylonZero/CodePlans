// Liveness + database check for platform health checks (Fly.io, Railway,
// Docker). Unauthenticated; reports nothing beyond up/down and the version.
import { sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { config } from '@/lib/config'
import pkg from '@/package.json'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await db.select({ one: sql<number>`1` }).from(users).limit(1)
    return Response.json({ status: 'ok', version: pkg.version, database: config.db.provider })
  } catch {
    return Response.json({ status: 'error', version: pkg.version, database: config.db.provider }, { status: 503 })
  }
}
