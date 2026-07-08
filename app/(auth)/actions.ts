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
