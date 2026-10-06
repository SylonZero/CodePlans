import { redirect } from 'next/navigation'
import { needsSetup } from '@/lib/db/first-run'
import { SetupForm } from './setup-form'

export const dynamic = 'force-dynamic'

export default async function SetupPage() {
  if (!(await needsSetup())) redirect('/login')
  return <SetupForm />
}
