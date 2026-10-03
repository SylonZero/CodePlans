import { redirect } from 'next/navigation'
import { needsSetup } from '@/lib/db/first-run'
import { LoginForm } from './login-form'

export const dynamic = 'force-dynamic'

export default async function LoginPage() {
  // A fresh instance has no one to sign in as: send the first visitor to setup.
  if (await needsSetup().catch(() => false)) redirect('/setup')
  return <LoginForm />
}
