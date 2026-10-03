import { notFound, redirect } from 'next/navigation'
import { config } from '@/lib/config'
import { needsSetup } from '@/lib/db/first-run'
import { SetupForm } from './setup-form'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  if (config.auth.provider !== 'local') notFound()
  if (!(await needsSetup())) redirect('/login')
  return <SetupForm />
}
