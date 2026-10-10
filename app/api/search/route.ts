// Search for the signed-in user, used by the search palette. See lib/db/search.ts.
import { authAdapter } from '@/lib/auth'
import { search, SEARCH_TYPES, type SearchType } from '@/lib/db/search'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const user = await authAdapter.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const params = new URL(request.url).searchParams
  const types = (params.get('types') ?? '').split(',').filter((t): t is SearchType => (SEARCH_TYPES as readonly string[]).includes(t))
  const result = await search(user.id, params.get('q') ?? '', {
    types,
    productId: params.get('product') || undefined,
    limit: Number(params.get('limit')) || undefined,
  })
  return Response.json(result)
}
