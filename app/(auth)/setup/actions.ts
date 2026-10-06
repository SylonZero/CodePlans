'use server'

import { authAdapter } from '@/lib/auth'
import { checkSetupCode, createOwnerAccount, needsSetup } from '@/lib/db/first-run'

/** Claims a fresh instance: creates the owner and their workspace, then signs in. */
export async function completeSetup(formData: FormData): Promise<{ error: string } | undefined> {
  if (!(await needsSetup())) {
    return { error: 'This instance is already set up. Sign in instead.' }
  }
  const field = (k: string) => String(formData.get(k) ?? '').trim()
  const code = field('code')
  const name = field('name')
  const email = field('email').toLowerCase()
  const workspace = field('workspace')
  const password = String(formData.get('password') ?? '')

  if (!checkSetupCode(code)) return { error: 'That setup code is not right. Copy it from the server log line starting with [setup].' }
  if (!name || !email.includes('@')) return { error: 'Enter your name and email.' }
  if (password.length < 8) return { error: 'Use a password of at least 8 characters.' }

  await createOwnerAccount({ email, password, name, orgName: workspace || undefined })
  console.log(`[setup] Instance claimed by ${email}`)
  const result = await authAdapter.signIn(email, password) // redirects on success
  return result?.error ? { error: 'Account created. Sign in to continue.' } : undefined
}
