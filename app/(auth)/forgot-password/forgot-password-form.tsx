'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { requestPasswordResetAction } from '../actions'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'

export function ForgotPasswordForm({ canEmail }: { canEmail: boolean }) {
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await requestPasswordResetAction(formData)
      setSentTo(String(formData.get('email') ?? ''))
    })
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Reset your password</CardTitle>
        <CardDescription>
          {sentTo
            ? 'Check your email.'
            : 'Enter the email you sign in with and we’ll send you a link to choose a new password.'}
        </CardDescription>
      </CardHeader>
      {sentTo ? (
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p role="status">
            If <span className="font-medium text-foreground">{sentTo}</span> has an account here, a reset link is on its way.
            It works once, for one hour.
          </p>
          {!canEmail && <p>This server can’t send email, so the link is in the server log. Ask whoever runs it.</p>}
          <p>
            <Link href="/login" className="underline underline-offset-4">Back to sign in</Link>
          </p>
        </CardContent>
      ) : (
        <form action={handleSubmit}>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input id="email" name="email" type="email" placeholder="you@example.com" autoComplete="email" required autoFocus />
            </div>
            {!canEmail && (
              <p className="text-sm text-muted-foreground">
                This server can’t send email: the link will be written to the server log for whoever runs it.
              </p>
            )}
          </CardContent>
          <CardFooter className="flex flex-col gap-3">
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? 'Sending…' : 'Send reset link'}
            </Button>
            <Link href="/login" className="text-sm text-muted-foreground underline underline-offset-4">Back to sign in</Link>
          </CardFooter>
        </form>
      )}
    </Card>
  )
}
