'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { resetPasswordAction } from '../actions'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/password-rules'

export function ResetPasswordForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if ((fd.get('password') as string).length < MIN_PASSWORD_LENGTH) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return }
    if (fd.get('password') !== fd.get('confirm')) { setError('Passwords do not match.'); return }
    setError(null)
    startTransition(async () => {
      const result = await resetPasswordAction(token, fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Choose a new password</h1>
        <p className="text-sm text-muted-foreground">For {email}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Lets password managers save the new password against the right account. */}
        <input type="email" name="username" value={email} autoComplete="username" readOnly hidden />
        <div className="space-y-2">
          <Label htmlFor="rp-password">New password</Label>
          <Input id="rp-password" name="password" type="password" required minLength={MIN_PASSWORD_LENGTH} autoComplete="new-password" autoFocus />
        </div>
        <div className="space-y-2">
          <Label htmlFor="rp-confirm">Confirm password</Label>
          <Input id="rp-confirm" name="confirm" type="password" required autoComplete="new-password" />
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Saving…' : 'Save and sign in'}
        </Button>
      </form>
    </div>
  )
}
