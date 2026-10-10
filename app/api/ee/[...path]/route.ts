// API routes supplied by an enterprise module (form posts, payment webhooks).
// 404 in the community edition. proxy.ts lets these through without a session,
// so the module checks `user` itself. See the `handleApi` hook in lib/ee/types.ts.
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { currentEnterpriseUser } from '@/lib/ee/user'

export const dynamic = 'force-dynamic'

async function handle(request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params
  const user = await currentEnterpriseUser().catch(() => null)
  const response = await getEnterpriseHooks().handleApi({ request, path, user })
  return response ?? Response.json({ error: 'Not found' }, { status: 404 })
}

export const GET = handle
export const POST = handle
