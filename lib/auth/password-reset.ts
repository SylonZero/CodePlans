// Forgot password: an emailed, one-time link to choose a new password.
//
// The token is 32 random bytes; only its SHA-256 is stored, so a copy of the
// database can't be used to reset anyone's password. A link works for an
// hour and only once, and asking again replaces any earlier link. The request
// answers the same whether or not the address has an account. Resetting signs
// out every existing session of the account.
import { createHash, randomBytes } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { and, eq, gt, lt, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { passwordResetTokens, users } from '@/lib/db/schema'
import { getBaseUrl } from '@/lib/email'
import { sendResendEmail } from '@/lib/notify/transports'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import { MIN_PASSWORD_LENGTH } from './password-rules'

export { MIN_PASSWORD_LENGTH }

export const RESET_LINK_TTL_MS = 60 * 60 * 1000
/** Links that may be requested for one address per hour. */
const REQUESTS_PER_HOUR = 3

const DEFAULT_FROM = 'CodePlans <noreply@codeplans.ai>'

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

// Recent requests per workspace and address, kept in memory: a restart only
// forgets the throttle, never a link.
const REQUESTS_KEY = Symbol.for('codeplans.passwordReset.requests')
type GlobalWithRequests = typeof globalThis & { [REQUESTS_KEY]?: Map<string, number[]> }
function recentRequests(): Map<string, number[]> {
  const g = globalThis as GlobalWithRequests
  return (g[REQUESTS_KEY] ??= new Map())
}

/** Test-only: forget the request throttle. */
export function resetPasswordResetThrottle() {
  recentRequests().clear()
}

function allowRequest(key: string, now: number): boolean {
  const map = recentRequests()
  const recent = (map.get(key) ?? []).filter((t) => now - t < 60 * 60 * 1000)
  if (recent.length >= REQUESTS_PER_HOUR) {
    map.set(key, recent)
    return false
  }
  map.set(key, [...recent, now])
  return true
}

/** Whether this server can send email at all. */
export function canEmailResetLinks(): boolean {
  return !!process.env.RESEND_API_KEY
}

/**
 * Emails a reset link when the address has an account with a password. The
 * result never says whether it did. Without email configured, the link is
 * written to the server log for the operator instead.
 */
export async function requestPasswordReset(rawEmail: string, now = new Date()): Promise<void> {
  const email = rawEmail.trim().toLowerCase()
  if (!email || email.length > 320) return
  if (!allowRequest(`${getBaseUrl()}|${email}`, now.getTime())) return

  const user = await db.query.users.findFirst({ where: sql`lower(${users.email}) = ${email}` })
  if (!user?.passwordHash) return

  const token = randomBytes(32).toString('hex')
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, user.id))
  await db.insert(passwordResetTokens).values({
    userId: user.id,
    tokenHash: hashToken(token),
    expiresAt: new Date(now.getTime() + RESET_LINK_TTL_MS),
  })

  const url = `${getBaseUrl()}/reset-password?token=${token}`
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    console.log(`[password-reset] email is not configured; reset link for ${user.email} (valid 1 hour): ${url}`)
    return
  }
  try {
    await sendResendEmail(apiKey, {
      from: process.env.RESEND_FROM_EMAIL ?? DEFAULT_FROM,
      to: user.email,
      ...renderResetEmail(user.name, url),
    })
  } catch (err) {
    console.error('[password-reset] could not send the reset email:', err instanceof Error ? err.message : err)
  }
}

/** The account a reset link is for, or null when it's unknown, used or expired. */
export async function findResetLink(token: string, now = new Date()): Promise<{ userId: string; email: string } | null> {
  if (!/^[0-9a-f]{64}$/.test(token)) return null
  const row = await db.query.passwordResetTokens.findFirst({
    where: and(eq(passwordResetTokens.tokenHash, hashToken(token)), gt(passwordResetTokens.expiresAt, now)),
  })
  if (!row) return null
  const user = await db.query.users.findFirst({ where: eq(users.id, row.userId) })
  return user ? { userId: user.id, email: user.email } : null
}

/** Sets a new password from a reset link and uses the link up. Returns the account's email to sign in with. */
export async function resetPassword(token: string, password: string, now = new Date()): Promise<{ email: string } | { error: string }> {
  if (password.length < MIN_PASSWORD_LENGTH) return { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }
  const link = await findResetLink(token, now)
  if (!link) return { error: 'This reset link is invalid or has expired. Ask for a new one.' }
  // Claim the link before changing anything, so two submissions can't both use it.
  const claimed = await db.delete(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, hashToken(token)), gt(passwordResetTokens.expiresAt, now)))
    .returning({ id: passwordResetTokens.id })
  if (claimed.length === 0) return { error: 'This reset link is invalid or has expired. Ask for a new one.' }

  // A new password ends every existing session: whoever was signed in may be why it was reset.
  await db.update(users).set({ passwordHash: await bcrypt.hash(password, 10), sessionVersion: sql`${users.sessionVersion} + 1` })
    .where(eq(users.id, link.userId))
  await db.delete(passwordResetTokens).where(eq(passwordResetTokens.userId, link.userId))
  await db.delete(passwordResetTokens).where(lt(passwordResetTokens.expiresAt, now))
  return { email: link.email }
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)

function renderResetEmail(name: string, url: string): { subject: string; html: string; text: string } {
  const site = new URL(url).host
  // In a hosted service the address says which workspace this is for.
  const where = getEnterpriseHooks().publicUrl() ? `your CodePlans account at ${site}` : 'your CodePlans account'
  const subject = 'Reset your CodePlans password'
  const text = [
    `Hi ${name},`,
    '',
    `Someone asked to reset the password for ${where}. To choose a new password, open this link within an hour:`,
    '',
    url,
    '',
    "If it wasn't you, ignore this email: your password stays the same.",
  ].join('\n')
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222222;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:32px 40px 24px;border-bottom:1px solid #222222;">
          <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">CodePlans</p>
        </td></tr>
        <tr><td style="padding:32px 40px;">
          <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.4px;">Reset your password</h1>
          <p style="margin:0 0 24px;font-size:15px;color:#888888;line-height:1.5;">
            Hi ${esc(name)}, someone asked to reset the password for ${esc(where)}. Choose a new one with the button below.
          </p>
          <a href="${esc(url)}" style="display:inline-block;padding:12px 24px;background-color:#ffffff;color:#000000;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;letter-spacing:-0.2px;">Choose a new password</a>
          <p style="margin:24px 0 0;font-size:13px;color:#555555;line-height:1.5;">
            The link works once, for one hour. If it wasn't you, ignore this email: your password stays the same.
          </p>
        </td></tr>
        <tr><td style="padding:20px 40px;border-top:1px solid #222222;">
          <p style="margin:0;font-size:12px;color:#444444;">
            If the button doesn't work, copy this address into your browser:<br>
            <a href="${esc(url)}" style="color:#666666;word-break:break-all;">${esc(url)}</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject, html, text }
}
