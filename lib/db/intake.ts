// External intake, phase 1 (spec: External Intake & Triage, and Change
// Declarations §3.11): work items carry where an outside report came from and
// the team's triage decision. Imported items stay `source = native` — there is
// no tracker to sync them back from, so the team owns their title and status.
// The external key is unique per product among items without a connection,
// which makes re-imports idempotent.
import { and, eq, inArray, isNull } from 'drizzle-orm'
import { db } from './index'
import { assets, workItems } from './schema'
import { createdBy, editedBy, type ArtifactActor } from './attribution'
import { logAudit } from './audit'
import type { DeclineReason, TriageState } from './schema.sqlite'
import type { WorkItemSeverity, WorkItemType } from '@/lib/types'
import { inferType } from '@/lib/integrations/type-labels'

export const TRIAGE_STATES: TriageState[] = ['untriaged', 'accepted', 'declined', 'needs_info']
export const DECLINE_REASONS: DeclineReason[] = [
  'already_shipped', 'question', 'question_answered', 'duplicate', 'out_of_scope', 'cannot_reproduce', 'show_and_tell', 'spam',
]

/** A user-facing rule violation (bad input, conflicting key). Callers report the message. */
export class IntakeError extends Error {}

/** Where an outside report lives. Only `key` is required. */
export type ExternalRef = {
  key: string
  url?: string | null
  /** Upstream state as the source reports it, e.g. "open" / "closed". */
  state?: string | null
  author?: string | null
  /** ISO timestamp of the report's creation upstream. */
  createdAt?: string | null
  labels?: string[]
}

type ExternalData = { state?: string | null; author?: string | null; createdAt?: string | null; labels?: string[]; refreshedAt?: string }

function cleanKey(key: string): string {
  const k = key.trim()
  if (!k) throw new IntakeError('externalKey must not be empty')
  if (k.length > 300) throw new IntakeError('externalKey is too long (300 characters max)')
  return k
}

function dataFor(ref: ExternalRef, previous: Record<string, unknown> = {}): ExternalData {
  const prev = previous as ExternalData
  return {
    state: ref.state !== undefined ? ref.state : prev.state ?? null,
    author: ref.author !== undefined ? ref.author : prev.author ?? null,
    createdAt: ref.createdAt !== undefined ? ref.createdAt : prev.createdAt ?? null,
    labels: ref.labels !== undefined ? ref.labels : prev.labels ?? [],
    refreshedAt: new Date().toISOString(),
  }
}

/** The connection-less item in a product holding this external key, if any. */
export async function findByExternalKey(productId: string, key: string) {
  return db.query.workItems.findFirst({
    where: and(eq(workItems.productId, productId), eq(workItems.externalKey, cleanKey(key)), isNull(workItems.connectionId)),
  })
}

async function assertKeyFree(productId: string, key: string, exceptId?: string) {
  const holder = await findByExternalKey(productId, key)
  if (holder && holder.id !== exceptId) {
    throw new IntakeError(`Another work item in this product already has external key ${key} ("${holder.title}", ${holder.id}).`)
  }
}

/**
 * Columns for giving a native item an external reference. Used when creating
 * an item and when attaching a reference later (W7). Setting a reference makes
 * the item external and, if it has no decision yet, untriaged.
 */
export async function externalRefColumns(
  productId: string,
  ref: ExternalRef,
  existing?: { id: string; externalData: unknown; triageState: TriageState | null; connectionId: string | null },
) {
  if (existing?.connectionId) throw new IntakeError('This item is mirrored from a connected tracker; its external reference comes from sync.')
  const key = cleanKey(ref.key)
  await assertKeyFree(productId, key, existing?.id)
  return {
    origin: 'external' as const,
    externalKey: key,
    externalUrl: ref.url ?? null,
    externalData: dataFor(ref, (existing?.externalData ?? {}) as Record<string, unknown>),
    triageState: existing?.triageState ?? ('untriaged' as const),
  }
}

export type TriageInput = { state: TriageState; declineReason?: DeclineReason | null; note?: string | null }

function validateTriage(input: TriageInput) {
  if (!TRIAGE_STATES.includes(input.state)) throw new IntakeError(`Unknown triage state "${input.state}"`)
  if (input.state === 'declined') {
    if (!input.declineReason || !DECLINE_REASONS.includes(input.declineReason)) {
      throw new IntakeError(`Declining needs a reason: ${DECLINE_REASONS.join(', ')}`)
    }
    if (!input.note?.trim()) throw new IntakeError('Declining needs a note saying why')
  }
}

/** Status follows the decision: declining closes the item as won't-do; un-declining reopens it. */
function triageColumns(input: TriageInput, currentStatus: string, actor?: ArtifactActor) {
  const declined = input.state === 'declined'
  return {
    triageState: input.state,
    declineReason: declined ? input.declineReason! : null,
    triageNote: input.note?.trim() || null,
    triagedById: actor?.id ?? null,
    triagedByKind: actor?.kind ?? null,
    triagedAt: new Date(),
    ...(declined ? { status: 'wont_do' as const } : currentStatus === 'wont_do' ? { status: 'open' as const } : {}),
  }
}

/** Record the team's decision on an external work item. */
export async function triageWorkItem(id: string, input: TriageInput, actor?: ArtifactActor) {
  validateTriage(input)
  const existing = await db.query.workItems.findFirst({ where: eq(workItems.id, id) })
  if (!existing) return null
  if (existing.origin !== 'external') throw new IntakeError('Only items from an external report have a triage decision. Set an external reference first.')
  const [item] = await db
    .update(workItems)
    .set({ ...triageColumns(input, existing.status, actor), ...editedBy(actor), updatedAt: new Date() })
    .where(eq(workItems.id, id))
    .returning()
  await logAudit({
    entityType: 'work_item', entityId: id, event: 'triaged', actor,
    payload: { title: item.title, state: input.state, declineReason: item.declineReason, from: existing.triageState },
  })
  return item
}

export type ImportItem = ExternalRef & {
  title: string
  description?: string
  type?: WorkItemType
  severity?: WorkItemSeverity
  assetId?: string | null
  area?: string | null
  tags?: string[]
  triage?: TriageInput
}

export type ImportResult = {
  created: number
  updated: number
  unchanged: number
  items: { id: string; externalKey: string; action: 'created' | 'updated' | 'unchanged' }[]
}

const MAX_IMPORT = 500

/**
 * Bulk upsert outside reports as external work items, keyed by
 * (product, external key).
 *
 * New keys become items (untriaged unless a decision is supplied). Known keys
 * only refresh the upstream facts — state, labels, author, URL — never the
 * title, the team's edits, or an existing triage decision. A decision supplied
 * for an item that is still untriaged is applied.
 */
export async function importExternalWorkItems(productId: string, input: ImportItem[], actor: ArtifactActor): Promise<ImportResult> {
  if (input.length > MAX_IMPORT) throw new IntakeError(`Import at most ${MAX_IMPORT} items per call`)
  const keys = input.map((i) => cleanKey(i.key))
  const dupe = keys.find((k, i) => keys.indexOf(k) !== i)
  if (dupe) throw new IntakeError(`externalKey ${dupe} appears twice in this import`)
  for (const item of input) {
    if (!item.title?.trim()) throw new IntakeError(`Item ${item.key} needs a title`)
    if (item.triage) validateTriage(item.triage)
  }
  const assetIds = [...new Set(input.map((i) => i.assetId).filter((a): a is string => !!a))]
  if (assetIds.length) {
    const found = await db.select({ id: assets.id }).from(assets).where(and(inArray(assets.id, assetIds), eq(assets.productId, productId)))
    const missing = assetIds.filter((a) => !found.some((f) => f.id === a))
    if (missing.length) throw new IntakeError(`Assets not in this product: ${missing.join(', ')}`)
  }

  const existingRows = keys.length
    ? await db.select().from(workItems).where(and(eq(workItems.productId, productId), inArray(workItems.externalKey, keys), isNull(workItems.connectionId)))
    : []
  const byKey = new Map(existingRows.map((r) => [r.externalKey!, r]))

  const result: ImportResult = { created: 0, updated: 0, unchanged: 0, items: [] }
  for (const [i, item] of input.entries()) {
    const key = keys[i]
    const existing = byKey.get(key)
    if (!existing) {
      const labels = item.labels ?? []
      const [row] = await db.insert(workItems).values({
        productId,
        title: item.title.trim(),
        description: item.description ?? '',
        type: item.type ?? inferType(labels),
        severity: item.severity ?? 'medium',
        assetId: item.assetId ?? null,
        area: item.area ?? null,
        tags: item.tags ?? [],
        reporterId: actor.id,
        origin: 'external',
        externalKey: key,
        externalUrl: item.url ?? null,
        externalData: dataFor(item),
        triageState: 'untriaged',
        ...(item.triage ? triageColumns(item.triage, 'open', actor) : {}),
        ...createdBy(actor),
      }).returning()
      await logAudit({ entityType: 'work_item', entityId: row.id, event: 'created', actor, payload: { title: row.title, type: row.type, externalKey: key } })
      result.created += 1
      result.items.push({ id: row.id, externalKey: key, action: 'created' })
      continue
    }

    const before = (existing.externalData ?? {}) as ExternalData
    const next = dataFor(item, before)
    const factsChanged = (item.url !== undefined && (item.url ?? null) !== existing.externalUrl)
      || next.state !== (before.state ?? null) || next.author !== (before.author ?? null)
      || next.createdAt !== (before.createdAt ?? null) || JSON.stringify(next.labels) !== JSON.stringify(before.labels ?? [])
    const decide = item.triage && existing.triageState === 'untriaged' && item.triage.state !== 'untriaged'
    if (!factsChanged && !decide) {
      result.unchanged += 1
      result.items.push({ id: existing.id, externalKey: key, action: 'unchanged' })
      continue
    }
    await db.update(workItems).set({
      ...(factsChanged ? { externalData: next, ...(item.url !== undefined ? { externalUrl: item.url ?? null } : {}) } : {}),
      ...(decide ? triageColumns(item.triage!, existing.status, actor) : {}),
      // A previously internal item that gains a key becomes external.
      origin: 'external',
      ...editedBy(actor),
      updatedAt: new Date(),
    }).where(eq(workItems.id, existing.id))
    if (decide) {
      await logAudit({ entityType: 'work_item', entityId: existing.id, event: 'triaged', actor, payload: { title: existing.title, state: item.triage!.state, from: 'untriaged' } })
    }
    result.updated += 1
    result.items.push({ id: existing.id, externalKey: key, action: 'updated' })
  }
  return result
}
