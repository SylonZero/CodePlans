import { Resend } from 'resend'

function getBaseUrl(): string {
  if (process.env.AUTH_URL) return process.env.AUTH_URL.replace(/\/$/, '')
  const port = process.env.PORT ?? '3000'
  return `http://localhost:${port}`
}

function getResendClient(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null
  return new Resend(process.env.RESEND_API_KEY)
}

export async function sendEmailVerificationEmail(
  to: string,
  name: string,
  token: string,
  newEmail: string,
): Promise<void> {
  const verifyUrl = `${getBaseUrl()}/verify-email?token=${token}`
  const fromEmail = process.env.RESEND_FROM_EMAIL ?? 'CodePlans <noreply@codeplans.ai>'

  const resend = getResendClient()
  if (!resend) {
    console.log('\n[email] RESEND_API_KEY not set — skipping send')
    console.log(`[email] Verification URL: ${verifyUrl}\n`)
    return
  }

  await resend.emails.send({
    from: fromEmail,
    to: newEmail,
    subject: 'Verify your new email address — CodePlans',
    html: `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:48px 16px;">
    <tr>
      <td align="center">
        <table width="520" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222222;border-radius:8px;overflow:hidden;">
          <tr>
            <td style="padding:32px 40px 24px;border-bottom:1px solid #222222;">
              <p style="margin:0;font-size:18px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">CodePlans</p>
            </td>
          </tr>
          <tr>
            <td style="padding:32px 40px;">
              <h1 style="margin:0 0 8px;font-size:22px;font-weight:600;color:#ffffff;letter-spacing:-0.4px;">Verify your new email address</h1>
              <p style="margin:0 0 24px;font-size:15px;color:#888888;line-height:1.5;">
                Hi ${name}, you requested to change your email address on CodePlans to <strong style="color:#cccccc;">${newEmail}</strong>.
                Click the button below to confirm this change.
              </p>
              <a href="${verifyUrl}" style="display:inline-block;padding:12px 24px;background-color:#ffffff;color:#000000;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;letter-spacing:-0.2px;">
                Verify Email Address
              </a>
              <p style="margin:24px 0 0;font-size:13px;color:#555555;line-height:1.5;">
                This link expires in 24 hours. If you did not request this change, you can ignore this email — your current email address will remain unchanged.
              </p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 40px;border-top:1px solid #222222;">
              <p style="margin:0;font-size:12px;color:#444444;">
                If the button above doesn't work, copy and paste this URL into your browser:<br>
                <a href="${verifyUrl}" style="color:#666666;word-break:break-all;">${verifyUrl}</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
  })
}
