import { timingSafeEqual } from 'crypto'
import { runNotificationJobs } from '@/lib/db/notification-delivery'

// Sends due email/Slack deliveries, retries failures and prunes old rows.
// Call it every minute or few from Vercel Cron or a system cron with
// `Authorization: Bearer $CRON_SECRET`. Deliveries also go out right after
// the request that caused them, so this only matters for retries.

export const dynamic = 'force-dynamic'

function authorized(req: Request) {
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const given = Buffer.from(req.headers.get('authorization') ?? '')
  const expected = Buffer.from(`Bearer ${secret}`)
  return given.length === expected.length && timingSafeEqual(given, expected)
}

async function handle(req: Request) {
  if (!process.env.CRON_SECRET) return Response.json({ error: 'Set CRON_SECRET to enable this endpoint' }, { status: 503 })
  if (!authorized(req)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  return Response.json(await runNotificationJobs())
}

export const GET = handle
export const POST = handle
