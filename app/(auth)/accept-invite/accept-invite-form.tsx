'use client'

import { useState, useTransition } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { acceptInvite } from '../actions'

export function AcceptInviteForm({ token, email }: { token: string; email: string }) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const fd = new FormData(e.currentTarget)
    if ((fd.get('password') as string).length < 8) { setError('Password must be at least 8 characters.'); return }
    if (fd.get('password') !== fd.get('confirm')) { setError('Passwords do not match.'); return }
    setError(null)
    startTransition(async () => {
      const result = await acceptInvite(token, fd)
      if (result?.error) setError(result.error)
    })
  }

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="text-xl font-semibold">Set your password</h1>
        <p className="text-sm text-muted-foreground">Activating {email}</p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="ai-password">Password</Label>
          <Input id="ai-password" name="password" type="password" required minLength={8} autoComplete="new-password" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="ai-confirm">Confirm password</Label>
          <Input id="ai-confirm" name="confirm" type="password" required autoComplete="new-password" />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? 'Joining…' : 'Join workspace'}
        </Button>
      </form>
    </div>
  )
}
