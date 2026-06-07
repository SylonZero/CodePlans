import { notFound } from 'next/navigation'
import { config } from '@/lib/config'
import { SignupForm } from './signup-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import Link from 'next/link'

export default function SignupPage() {
  if (config.registration === 'closed') {
    notFound()
  }

  if (config.registration === 'invite') {
    return (
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>Invite only</CardTitle>
          <CardDescription>
            This instance is invite-only. Contact your administrator to request access.
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground text-center">
          Already have an account?{' '}
          <Link href="/login" className="underline underline-offset-4 text-foreground">
            Sign in
          </Link>
        </CardContent>
      </Card>
    )
  }

  return <SignupForm />
}
