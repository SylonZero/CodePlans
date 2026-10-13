'use server'

import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { config } from '@/lib/config'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-rules'

export async function signIn(formData: FormData) {
  const result = await authAdapter.signIn(
    formData.get('email') as string,
    formData.get('password') as string,
  )
  if (result?.error) return result
  redirect('/')
}

export async function signUp(formData: FormData) {
  if (config.registration !== 'open') {
    return { error: 'Registration is not open on this instance.' }
  }
  const password = String(formData.get('password') ?? '')
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  const result = await authAdapter.signUp(
    formData.get('email') as string,
    password,
    formData.get('name') as string,
  )
  if (result?.error) return result

  // Every user belongs to the single workspace.
  const user = await authAdapter.getUser()
  if (user) {
    const { joinTeamWorkspace } = await import('@/lib/db/bootstrap')
    await joinTeamWorkspace(user.id)
  }
  redirect('/')
}

export async function signOut() {
  await authAdapter.signOut()
}

export async function acceptInvite(token: string, formData: FormData) {
  const bcrypt = (await import('bcryptjs')).default
  const { db } = await import('@/lib/db')
  const { emailVerificationTokens, users } = await import('@/lib/db/schema')
  const { eq, sql } = await import('drizzle-orm')

  const { findInvite } = await import('@/lib/auth/invites')
  const row = await findInvite(token)
  if (!row) return { error: 'This invite link is invalid or has expired.' }

  const password = formData.get('password') as string
  if (!password || password.length < MIN_PASSWORD_LENGTH) return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }

  const passwordHash = await bcrypt.hash(password, 10)
  // Replaces the temporary password, so any session made with it ends.
  await db.update(users).set({ passwordHash, sessionVersion: sql`${users.sessionVersion} + 1` }).where(eq(users.id, row.userId))
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.id))

  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  const result = await authAdapter.signIn(user!.email, password)
  if (result?.error) redirect('/login')
  redirect('/')
}

/** Forgot password: always reports success, so the page never reveals who has an account. */
export async function requestPasswordResetAction(formData: FormData) {
  const email = String(formData.get('email') ?? '')
  const { after } = await import('next/server')
  const { requestPasswordReset } = await import('@/lib/auth/password-reset')
  // Look up and email after responding, so the response time says nothing either.
  after(() => requestPasswordReset(email).catch((err) => console.error('[password-reset]', err)))
  return { sent: true as const }
}

export async function resetPasswordAction(token: string, formData: FormData) {
  const password = String(formData.get('password') ?? '')
  if (password !== formData.get('confirm')) return { error: 'Passwords do not match.' }
  const { resetPassword } = await import('@/lib/auth/password-reset')
  const result = await resetPassword(token, password)
  if ('error' in result) return result
  const signedIn = await authAdapter.signIn(result.email, password)
  if (signedIn?.error) redirect('/login')
  redirect('/')
}
