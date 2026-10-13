import Link from 'next/link'
import { findResetLink } from '@/lib/auth/password-reset'
import { ResetPasswordForm } from './reset-password-form'

export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams
  const link = token ? await findResetLink(token) : null

  if (!token || !link) {
    return (
      <div className="max-w-sm space-y-2 text-center">
        <h1 className="text-xl font-semibold">This link has expired</h1>
        <p className="text-sm text-muted-foreground">
          Reset links work once, for one hour. <Link href="/forgot-password" className="underline underline-offset-4">Ask for a new one</Link>.
        </p>
      </div>
    )
  }

  return <ResetPasswordForm token={token} email={link.email} />
}
