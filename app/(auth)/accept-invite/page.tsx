import { db } from '@/lib/db'
import { emailVerificationTokens, users } from '@/lib/db/schema'
import { eq, and, gt } from 'drizzle-orm'
import { AcceptInviteForm } from './accept-invite-form'

export default async function AcceptInvitePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams
  const row = token
    ? await db.query.emailVerificationTokens.findFirst({
        where: and(eq(emailVerificationTokens.token, token), gt(emailVerificationTokens.expiresAt, new Date())),
      })
    : undefined
  const invitee = row ? await db.query.users.findFirst({ where: eq(users.id, row.userId) }) : undefined

  if (!row || !invitee) {
    return (
      <div className="text-center space-y-2">
        <h1 className="text-xl font-semibold">Invitation not found</h1>
        <p className="text-sm text-muted-foreground">
          This invite link is invalid or has expired. Ask your team admin to send a new one.
        </p>
      </div>
    )
  }

  return <AcceptInviteForm token={row.token} email={invitee.email} />
}
