import { getBaseUrl } from '@/lib/email'
import { reasonLabel } from '@/lib/my-work-labels'
import { catalogEntry } from '@/lib/notification-catalog'

// Email and Slack are rendered from the same facts: what happened (title), a
// short excerpt, a link, and — for email — why this person is being told.

export type MessageFacts = {
  eventType: string
  title: string
  summary?: string
  /** App-relative path, e.g. /specs/123. */
  url: string
  productName?: string | null
  /** Set for email: the recipient's reason, e.g. 'code_owner:API Gateway'. */
  reason?: string
  byAgent?: boolean
}

export function absoluteUrl(path: string) {
  return /^https?:\/\//.test(path) ? path : `${getBaseUrl()}${path.startsWith('/') ? '' : '/'}${path}`
}

function esc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}

function whyLine(reason: string | undefined) {
  if (!reason) return ''
  const label = reasonLabel(reason)
  if (reason === 'mentioned') return 'You were mentioned.'
  return `You're getting this as ${/^[aeiou]/i.test(label) ? 'an' : 'a'} ${label}.`
}

export function renderEmail(f: MessageFacts): { subject: string; html: string; text: string } {
  const label = catalogEntry(f.eventType)?.label ?? 'Update'
  const link = absoluteUrl(f.url)
  const settings = absoluteUrl('/settings?tab=notifications')
  const context = [label, f.productName].filter(Boolean).join(' · ')
  const why = whyLine(f.reason)
  const agent = f.byAgent ? 'Done by an AI agent via MCP.' : ''
  const subject = `${f.title}${f.productName ? ` — ${f.productName}` : ''}`
  const text = [f.title, f.summary, '', `Open: ${link}`, '', [why, agent].filter(Boolean).join(' '), `Email settings: ${settings}`]
    .filter((l) => l !== undefined).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#0a0a0a;padding:48px 16px;">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" style="background-color:#111111;border:1px solid #222222;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 40px 16px;border-bottom:1px solid #222222;">
          <p style="margin:0;font-size:16px;font-weight:600;color:#ffffff;letter-spacing:-0.3px;">CodePlans</p>
          <p style="margin:4px 0 0;font-size:12px;color:#777777;">${esc(context)}</p>
        </td></tr>
        <tr><td style="padding:28px 40px;">
          <h1 style="margin:0 0 12px;font-size:19px;font-weight:600;color:#ffffff;line-height:1.35;">${esc(f.title)}</h1>
          ${f.summary ? `<p style="margin:0 0 20px;padding:12px 14px;border-left:3px solid #333333;background-color:#161616;font-size:14px;color:#bbbbbb;line-height:1.5;white-space:pre-wrap;">${esc(f.summary)}</p>` : ''}
          <a href="${esc(link)}" style="display:inline-block;padding:10px 20px;background-color:#ffffff;color:#000000;text-decoration:none;border-radius:6px;font-size:14px;font-weight:600;">Open in CodePlans</a>
          ${agent ? `<p style="margin:20px 0 0;font-size:13px;color:#888888;">🤖 ${esc(agent)}</p>` : ''}
        </td></tr>
        <tr><td style="padding:16px 40px;border-top:1px solid #222222;">
          <p style="margin:0;font-size:12px;color:#555555;line-height:1.5;">${esc(why)} <a href="${esc(settings)}" style="color:#777777;">Email settings</a></p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`
  return { subject, html, text }
}

function slackEsc(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function renderSlack(f: MessageFacts): { text: string; blocks: unknown[] } {
  const label = catalogEntry(f.eventType)?.label ?? 'Update'
  const link = absoluteUrl(f.url)
  const context = [label, f.productName, f.byAgent ? '🤖 by an AI agent' : null].filter(Boolean).map((s) => slackEsc(String(s))).join(' · ')
  const summary = f.summary ? `\n>${slackEsc(f.summary).replace(/\n/g, '\n>')}` : ''
  return {
    // Fallback text shows in notifications and clients without blocks.
    text: `${f.title} — ${link}`,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: `*<${link}|${slackEsc(f.title)}>*${summary}` } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: context }] },
    ],
  }
}
