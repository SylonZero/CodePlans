// Signed-in pages supplied by an enterprise module (e.g. billing). 404 in the
// community edition. See the `page` hook in lib/ee/types.ts.
import { notFound } from 'next/navigation'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { currentEnterpriseUser, firstSearchParams } from '@/lib/ee/user'
import { EnterprisePageView } from '@/components/ee-page'

export const dynamic = 'force-dynamic'

interface Props {
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function EnterpriseDashboardPage({ params, searchParams }: Props) {
  const { path } = await params
  const user = await currentEnterpriseUser()
  const page = await getEnterpriseHooks().page({ area: 'dashboard', path, searchParams: firstSearchParams(await searchParams), user })
  if (!page) notFound()
  return <EnterprisePageView page={page} layout="dashboard" />
}
