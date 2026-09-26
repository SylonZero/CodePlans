'use server'

import { revalidatePath } from 'next/cache'
import { eq } from 'drizzle-orm'
import { authAdapter } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import {
  saveEmailChannel, saveSlackChannel, setChannelPaused, removeChannel, setNotificationRule, resetNotificationRules, setEmailPreference,
  type RulePatch,
} from '@/lib/db/notification-settings'
import { sendTestEmail, sendTestSlack } from '@/lib/db/notification-delivery'
import type { NotificationChannelKind } from '@/lib/db/schema.sqlite'

type Result<T = object> = ({ ok: true } & T) | { ok: false; error: string }

/** Workspace settings always apply to the caller's current org; admin checks happen in the data layer. */
async function me() {
  const user = await authAdapter.getUser()
  if (!user) throw new Error('Unauthorized')
  const profile = await db.query.users.findFirst({ where: eq(users.id, user.id) })
  if (!profile?.organizationId) throw new Error('You are not in a workspace')
  return { actor: { id: user.id, kind: 'user' as const }, organizationId: profile.organizationId }
}

async function run<T extends object>(fn: () => Promise<T>, path = '/settings/notifications'): Promise<Result<T>> {
  try {
    const value = await fn()
    revalidatePath(path)
    return { ok: true, ...value }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Something went wrong' }
  }
}

export async function saveEmailChannelAction(input: { apiKey?: string; fromAddress: string; replyTo?: string }) {
  return run(async () => { const { actor, organizationId } = await me(); await saveEmailChannel(organizationId, input, actor); return {} })
}

export async function saveSlackChannelAction(input: { webhookUrl?: string; channelLabel?: string }) {
  return run(async () => { const { actor, organizationId } = await me(); await saveSlackChannel(organizationId, input, actor); return {} })
}

export async function setChannelPausedAction(kind: NotificationChannelKind, paused: boolean) {
  return run(async () => { const { actor, organizationId } = await me(); await setChannelPaused(organizationId, kind, paused, actor); return {} })
}

export async function removeChannelAction(kind: NotificationChannelKind) {
  return run(async () => { const { actor, organizationId } = await me(); await removeChannel(organizationId, kind, actor); return {} })
}

export async function sendTestAction(kind: NotificationChannelKind): Promise<Result<{ message: string }>> {
  return run(async () => {
    const { actor, organizationId } = await me()
    const r = kind === 'email_resend' ? await sendTestEmail(organizationId, actor) : await sendTestSlack(organizationId, actor)
    if (!r.ok) throw new Error(r.error)
    return { message: 'to' in r ? `Sent to ${r.to}` : 'Posted to Slack' }
  })
}

export async function setRuleAction(eventType: string, patch: RulePatch) {
  return run(async () => { const { actor, organizationId } = await me(); return { rule: await setNotificationRule(organizationId, eventType, patch, actor) } })
}

export async function resetRulesAction() {
  return run(async () => { const { actor, organizationId } = await me(); await resetNotificationRules(organizationId, actor); return {} })
}

/** Personal: anyone can turn their own email off or on. */
export async function setEmailPreferenceAction(eventType: string, email: boolean) {
  return run(async () => {
    const user = await authAdapter.getUser()
    if (!user) throw new Error('Unauthorized')
    await setEmailPreference(user.id, eventType, email)
    return {}
  }, '/settings')
}
