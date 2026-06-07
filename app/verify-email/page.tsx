import { redirect } from 'next/navigation'
import Link from 'next/link'
import { db } from '@/lib/db'
import { users, emailVerificationTokens } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

interface Props {
  searchParams: Promise<{ token?: string }>
}

export default async function VerifyEmailPage({ searchParams }: Props) {
  const { token } = await searchParams

  if (!token) {
    return <ErrorView message="No verification token provided." />
  }

  const record = await db.query.emailVerificationTokens.findFirst({
    where: eq(emailVerificationTokens.token, token),
  })

  if (!record) {
    return <ErrorView message="This verification link is invalid or has already been used." />
  }

  if (record.expiresAt < new Date()) {
    await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, record.id))
    return <ErrorView message="This verification link has expired. Please request a new email change from Settings." />
  }

  // Commit the email change
  await db.update(users).set({ email: record.newEmail }).where(eq(users.id, record.userId))
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.id, record.id))

  redirect('/settings?emailVerified=1')
}

function ErrorView({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md text-center space-y-4">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
          <svg className="h-6 w-6 text-destructive" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </div>
        <h1 className="text-xl font-semibold">Verification failed</h1>
        <p className="text-muted-foreground text-sm">{message}</p>
        <Link
          href="/settings"
          className="inline-block text-sm text-primary underline underline-offset-4"
        >
          Back to Settings
        </Link>
      </div>
    </div>
  )
}
