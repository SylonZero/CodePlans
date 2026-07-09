'use server'

import { redirect } from 'next/navigation'
import { authAdapter } from '@/lib/auth'
import { config } from '@/lib/config'

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
  const result = await authAdapter.signUp(
    formData.get('email') as string,
    formData.get('password') as string,
    formData.get('name') as string,
  )
  if (result?.error) return result

  // Team mode: every user belongs to the single workspace.
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
  const { eq, and, gt } = await import('drizzle-orm')

  const row = await db.query.emailVerificationTokens.findFirst({
    where: and(eq(emailVerificationTokens.token, token), gt(emailVerificationTokens.expiresAt, new Date())),
  })
  if (!row) return { error: 'This invite link is invalid or has expired.' }

  const password = formData.get('password') as string
  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters.' }

  const passwordHash = await bcrypt.hash(password, 10)
  await db.update(users).set({ passwordHash }).where(eq(users.id, row.userId))
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, row.id))

  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  const result = await authAdapter.signIn(user!.email, password)
  if (result?.error) redirect('/login')
  redirect('/')
}
