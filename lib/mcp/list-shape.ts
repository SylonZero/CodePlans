// Response shape for MCP list tools (spec: External Intake & Triage §8.5 M1).
// Full objects for every row overflow an agent's context (75 KB for 15
// specs), so lists return a compact projection by default, a page at a time.
import type { WorkItemWithContext } from '@/lib/db/queries'

export const DEFAULT_LIMIT = 50
export const MAX_LIMIT = 200

export type Page<T> = { items: T[]; total: number; nextCursor: string | null }

/** Opaque cursor: the offset of the next page. */
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0
  const n = Number.parseInt(Buffer.from(cursor, 'base64url').toString('utf8'), 10)
  if (!Number.isFinite(n) || n < 0) throw new Error('Invalid cursor')
  return n
}

export function paginate<T>(rows: T[], opts: { limit?: number; cursor?: string } = {}): Page<T> {
  const limit = Math.min(Math.max(1, opts.limit ?? DEFAULT_LIMIT), MAX_LIMIT)
  const offset = decodeCursor(opts.cursor)
  const items = rows.slice(offset, offset + limit)
  const next = offset + limit
  return { items, total: rows.length, nextCursor: next < rows.length ? Buffer.from(String(next)).toString('base64url') : null }
}

/** One line per item: enough to choose what to fetch or act on. */
export function compactWorkItem(w: WorkItemWithContext) {
  return {
    id: w.id,
    title: w.title,
    type: w.type,
    severity: w.severity,
    status: w.status,
    product: w.productName,
    asset: w.assetName ?? null,
    area: w.area ?? null,
    tags: w.tags,
    origin: w.origin,
    ...(w.triageState ? { triageState: w.triageState } : {}),
    ...(w.declineReason ? { declineReason: w.declineReason } : {}),
    ...(w.externalKey ? { externalKey: w.externalKey } : {}),
    ...(w.externalState ? { externalState: w.externalState } : {}),
    ...(w.externalDeleted ? { externalDeleted: true } : {}),
    owner: w.ownerName ?? null,
    updatedAt: w.updatedAt,
  }
}

/** Specs without their body (fetch one with get_spec). */
export function compactSpec<S extends { body?: string; links?: { targetType: string; targetId: string }[] }>(spec: S) {
  const { body, links, ...rest } = spec
  return { ...rest, bodyLength: body?.length ?? 0, linkCount: links?.length ?? 0 }
}
