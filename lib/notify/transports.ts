// Outbound calls for email (Resend) and Slack (incoming webhook). Plain fetch,
// so self-hosted setups can point RESEND_API_URL at a compatible relay.

export class DeliveryError extends Error {
  /** Retrying won't help (bad key, unverified sender, revoked webhook). */
  permanent: boolean
  constructor(message: string, permanent = false) {
    super(message)
    this.permanent = permanent
  }
}

export type EmailMessage = { from: string; to: string; subject: string; html: string; text: string; replyTo?: string }
export type SlackMessage = { text: string; blocks?: unknown[] }

const TIMEOUT_MS = 10_000

function isPermanent(status: number) {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}

async function post(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, method: 'POST', redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (err) {
    throw new DeliveryError(err instanceof Error ? err.message : String(err))
  }
}

async function errorText(res: Response) {
  const body = (await res.text().catch(() => '')).slice(0, 300)
  return `HTTP ${res.status}${body ? `: ${body}` : ''}`
}

export async function sendResendEmail(apiKey: string, msg: EmailMessage) {
  const base = (process.env.RESEND_API_URL ?? 'https://api.resend.com').replace(/\/$/, '')
  const res = await post(`${base}/emails`, {
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: msg.from, to: [msg.to], subject: msg.subject, html: msg.html, text: msg.text, ...(msg.replyTo ? { reply_to: msg.replyTo } : {}) }),
  })
  if (!res.ok) throw new DeliveryError(await errorText(res), isPermanent(res.status))
}

export async function postSlackWebhook(url: string, msg: SlackMessage) {
  const res = await post(url, { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(msg) })
  if (!res.ok) throw new DeliveryError(await errorText(res), isPermanent(res.status))
}

/**
 * Webhook URLs are admin-entered and fetched by the server, so only Slack's
 * webhook host is allowed by default. Self-hosted setups can add hosts (a
 * Mattermost server, a local relay) with NOTIFY_WEBHOOK_ALLOWED_HOSTS.
 */
export function validateWebhookUrl(raw: string): string | null {
  let url: URL
  try { url = new URL(raw.trim()) } catch { return 'Enter a full webhook URL' }
  const extra = (process.env.NOTIFY_WEBHOOK_ALLOWED_HOSTS ?? '').split(',').map((h) => h.trim().toLowerCase()).filter(Boolean)
  if (extra.includes(url.host.toLowerCase()) || extra.includes(url.hostname.toLowerCase())) {
    return url.protocol === 'https:' || url.protocol === 'http:' ? null : 'Webhook URLs must use http or https'
  }
  if (url.protocol !== 'https:' || url.hostname !== 'hooks.slack.com') return 'Use a Slack incoming webhook URL (https://hooks.slack.com/…)'
  return null
}

const EMAIL_RE = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/

/** Accepts "name@domain" or "Name <name@domain>". */
export function validateFromAddress(raw: string): string | null {
  const v = raw.trim()
  const addr = v.match(/<([^>]+)>$/)?.[1] ?? v
  return EMAIL_RE.test(addr) ? null : 'Enter a sender like "CodePlans <notify@your-domain.com>"'
}

export function validateEmail(raw: string): string | null {
  return EMAIL_RE.test(raw.trim()) ? null : 'Enter a valid email address'
}
