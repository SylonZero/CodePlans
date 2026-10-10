// Public pages supplied by an enterprise module (e.g. workspace sign-up). 404
// in the community edition. See the `page` hook in lib/ee/types.ts.
import { notFound } from 'next/navigation'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { firstSearchParams } from '@/lib/ee/user'
import { EnterprisePageView } from '@/components/ee-page'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function EnterprisePublicPage({ params, searchParams }: Props) {
  const { path } = await params
  const page = await getEnterpriseHooks().page({ area: 'public', path, searchParams: firstSearchParams(await searchParams), user: null })
  if (!page) notFound()
  return <EnterprisePageView page={page} layout="public" />
}
