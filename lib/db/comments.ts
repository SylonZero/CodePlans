import { and, asc, eq, inArray, isNotNull } from 'drizzle-orm'
import { z } from 'zod'
import { db } from './index'
import {
  assets, codePlans, commentMentions, comments, organizationMembers, products, releases, specs, users, workItems,
} from './schema'
import { ForbiddenError, NOT_ACCESSIBLE_MESSAGE, getProductRole, isOrgAdmin } from './authz'
import { logAudit } from './audit'
import type { ArtifactActor } from './attribution'
import type { CommentAnchor, CommentKind, CommentSubjectType, SyncEntityType } from './schema.sqlite'

export const commentSubjectType = z.enum(['spec', 'code_plan', 'work_item', 'release', 'asset'])
export const commentKind = z.enum(['comment', 'suggestion', 'question'])
export const commentAnchorInput = z.object({
  quote: z.string().trim().min(1).max(1000),
  prefix: z.string().max(200).optional(),
  suffix: z.string().max(200).optional(),
})
export const commentInput = z.object({
  subjectType: commentSubjectType,
  subjectId: z.string().min(1),
  body: z.string().trim().min(1).max(10_000),
  parentId: z.string().optional(),
  anchor: commentAnchorInput.optional(),
  kind: commentKind.default('comment'),
  mentions: z.array(z.string()).max(50).default([]),
})

export type CommentSubject = { productId: string; version: number | null; body: string | null; title: string }

/** Where a comment lives: the subject's product, its current version and (for specs) the text anchors match against. */
export async function resolveCommentSubject(subjectType: CommentSubjectType, subjectId: string): Promise<CommentSubject | null> {
  switch (subjectType) {
    case 'spec': {
      const row = await db.query.specs.findFirst({ where: eq(specs.id, subjectId) })
      return row ? { productId: row.productId, version: row.version, body: row.body, title: row.title } : null
    }
    case 'code_plan': {
      const row = await db.query.codePlans.findFirst({ where: eq(codePlans.id, subjectId) })
      return row ? { productId: row.productId, version: row.revision, body: null, title: row.title } : null
    }
    case 'work_item': {
      const row = await db.query.workItems.findFirst({ where: eq(workItems.id, subjectId) })
      return row ? { productId: row.productId, version: null, body: null, title: row.title } : null
    }
    case 'release': {
      const row = await db.query.releases.findFirst({ where: eq(releases.id, subjectId) })
      return row ? { productId: row.productId, version: null, body: null, title: row.name } : null
    }
    case 'asset': {
      const row = await db.query.assets.findFirst({ where: eq(assets.id, subjectId) })
      return row ? { productId: row.productId, version: null, body: null, title: row.name } : null
    }
  }
}

/**
 * Anyone who can see the subject may comment, viewers included: feedback is
 * not a change to the engineering record, and it's how stakeholders without
 * edit rights take part in review.
 */
async function requireVisibleSubject(userId: string, subjectType: CommentSubjectType, subjectId: string) {
  const subject = await resolveCommentSubject(subjectType, subjectId)
  if (!subject || (await getProductRole(userId, subject.productId)) === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  return subject
}

const AUDIT_ENTITY: Record<CommentSubjectType, SyncEntityType> = {
  spec: 'spec', code_plan: 'code_plan', work_item: 'work_item', release: 'release', asset: 'asset',
}

/** People who can see the product: the pool mentions and reviewers are drawn from. */
export async function getProductAudience(productId: string): Promise<{ id: string; name: string; email: string }[]> {
  const product = await db.query.products.findFirst({ where: eq(products.id, productId) })
  if (!product) return []
  if (!product.organizationId) {
    const creator = await db.query.users.findFirst({ where: eq(users.id, product.creatorId) })
    return creator ? [{ id: creator.id, name: creator.name, email: creator.email }] : []
  }
  return db.select({ id: users.id, name: users.name, email: users.email })
    .from(organizationMembers).innerJoin(users, eq(organizationMembers.userId, users.id))
    .where(and(eq(organizationMembers.organizationId, product.organizationId), isNotNull(organizationMembers.joinedAt)))
    .orderBy(users.name)
}

export async function addComment(input: z.input<typeof commentInput>, actor: ArtifactActor) {
  const data = commentInput.parse(input)
  const subject = await requireVisibleSubject(actor.id, data.subjectType, data.subjectId)
  if (data.parentId) {
    const parent = await db.query.comments.findFirst({ where: eq(comments.id, data.parentId) })
    if (!parent || parent.subjectType !== data.subjectType || parent.subjectId !== data.subjectId) throw new Error('Reply target not found on this subject')
    if (parent.parentId) throw new Error('Replies go on the top-level comment of a thread')
  }
  // Only people who can see the product can be mentioned; unknown ids are dropped, not errors.
  const audience = new Set((await getProductAudience(subject.productId)).map((u) => u.id))
  const mentions = [...new Set(data.mentions)].filter((id) => audience.has(id) && id !== actor.id)
  const row = await db.transaction(async (tx) => {
    const [created] = await tx.insert(comments).values({
      productId: subject.productId,
      subjectType: data.subjectType,
      subjectId: data.subjectId,
      subjectVersion: subject.version,
      parentId: data.parentId ?? null,
      anchor: data.parentId ? null : data.anchor ?? null,
      body: data.body,
      kind: data.kind,
      authorId: actor.id,
      authorType: actor.kind ?? 'user',
    }).returning()
    if (mentions.length) await tx.insert(commentMentions).values(mentions.map((userId) => ({ commentId: created.id, userId })))
    return created
  })
  await logAudit({ entityType: AUDIT_ENTITY[data.subjectType], entityId: data.subjectId, event: data.parentId ? 'comment_replied' : 'commented', actor,
    productId: subject.productId, payload: { title: subject.title, commentId: row.id, mentions, version: subject.version } })
  return { ...row, mentions }
}

async function requireComment(id: string) {
  const row = await db.query.comments.findFirst({ where: eq(comments.id, id) })
  if (!row || row.deletedAt) throw new Error('Comment not found')
  return row
}

export async function editComment(id: string, body: string, actor: ArtifactActor) {
  const row = await requireComment(id)
  if (row.authorId !== actor.id) throw new ForbiddenError('Only the author can edit a comment.')
  const text = z.string().trim().min(1).max(10_000).parse(body)
  const [updated] = await db.update(comments).set({ body: text, editedAt: new Date() }).where(eq(comments.id, id)).returning()
  return updated
}

/** Soft delete keeps the thread shape (replies stay attached); the body is cleared. */
export async function deleteComment(id: string, actor: ArtifactActor) {
  const row = await requireComment(id)
  const product = await db.query.products.findFirst({ where: eq(products.id, row.productId) })
  const admin = product?.organizationId ? await isOrgAdmin(product.organizationId, actor.id) : product?.creatorId === actor.id
  if (row.authorId !== actor.id && !admin) throw new ForbiddenError('Only the author or an org owner/admin can delete a comment.')
  await db.update(comments).set({ body: '', deletedAt: new Date() }).where(eq(comments.id, id))
  return { id }
}

/** Resolving closes a thread. The author or anyone with edit access on the product may resolve. */
export async function resolveComment(id: string, resolved: boolean, actor: ArtifactActor) {
  const row = await requireComment(id)
  if (row.parentId) throw new Error('Resolve the top-level comment of a thread')
  const role = await getProductRole(actor.id, row.productId)
  if (role === 'none') throw new ForbiddenError(NOT_ACCESSIBLE_MESSAGE)
  if (row.authorId !== actor.id && role === 'viewer') throw new ForbiddenError('Only the author or someone with edit access can resolve this thread.')
  const [updated] = await db.update(comments)
    .set(resolved ? { resolvedAt: new Date(), resolvedById: actor.id } : { resolvedAt: null, resolvedById: null })
    .where(eq(comments.id, id)).returning()
  return updated
}

export type AnchorStatus = 'anchored' | 'outdated' | null

export type CommentView = {
  id: string
  body: string
  kind: CommentKind
  authorId: string | null
  authorName: string | null
  authorType: 'user' | 'agent'
  subjectVersion: number | null
  anchor: CommentAnchor | null
  anchorStatus: AnchorStatus
  reviewId: string | null
  resolvedAt: string | null
  resolvedByName: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
  mentions: { id: string; name: string }[]
}

export type CommentThread = CommentView & { replies: CommentView[] }

/**
 * An anchor still holds while its quoted text appears in the current body;
 * otherwise the remark is shown as outdated at the version it was written on.
 */
export function anchorStatus(anchor: CommentAnchor | null, currentBody: string | null): AnchorStatus {
  if (!anchor) return null
  if (currentBody === null) return 'anchored'
  return normalize(currentBody).includes(normalize(anchor.quote)) ? 'anchored' : 'outdated'
}

function normalize(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

export async function listComments(subjectType: CommentSubjectType, subjectId: string, viewerId: string): Promise<CommentThread[]> {
  const subject = await requireVisibleSubject(viewerId, subjectType, subjectId)
  const rows = await db.select().from(comments)
    .where(and(eq(comments.subjectType, subjectType), eq(comments.subjectId, subjectId)))
    .orderBy(asc(comments.createdAt))
  if (!rows.length) return []
  const userIds = [...new Set(rows.flatMap((r) => [r.authorId, r.resolvedById]).filter((x): x is string => !!x))]
  const mentionRows = await db.select({ commentId: commentMentions.commentId, id: users.id, name: users.name })
    .from(commentMentions).innerJoin(users, eq(commentMentions.userId, users.id))
    .where(inArray(commentMentions.commentId, rows.map((r) => r.id)))
  const names = new Map((userIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, userIds)) : [])
    .map((u) => [u.id, u.name]))
  // Anchors are matched against rendered prose, so strip markdown syntax from the body first.
  const plainBody = subject.body === null ? null : subject.body.replace(/[*_`#>|~[\]]/g, '')
  const view = (r: typeof rows[number]): CommentView => ({
    id: r.id,
    body: r.deletedAt ? '' : r.body,
    kind: r.kind as CommentKind,
    authorId: r.authorId,
    authorName: r.authorId ? names.get(r.authorId) ?? null : null,
    authorType: (r.authorType as 'user' | 'agent') ?? 'user',
    subjectVersion: r.subjectVersion,
    anchor: r.anchor ?? null,
    anchorStatus: anchorStatus(r.anchor ?? null, plainBody),
    reviewId: r.reviewId,
    resolvedAt: r.resolvedAt?.toISOString() ?? null,
    resolvedByName: r.resolvedById ? names.get(r.resolvedById) ?? null : null,
    createdAt: r.createdAt.toISOString(),
    editedAt: r.editedAt?.toISOString() ?? null,
    deleted: !!r.deletedAt,
    mentions: mentionRows.filter((m) => m.commentId === r.id).map((m) => ({ id: m.id, name: m.name })),
  })
  const threads = rows.filter((r) => !r.parentId).map((r) => ({ ...view(r), replies: [] as CommentView[] }))
  const byId = new Map(threads.map((t) => [t.id, t]))
  for (const r of rows) if (r.parentId) byId.get(r.parentId)?.replies.push(view(r))
  // A deleted thread with no replies has nothing left to show.
  return threads.filter((t) => !t.deleted || t.replies.length > 0)
}

/** Open (unresolved, not deleted) top-level thread counts per subject, for list badges. */
export async function countOpenThreads(subjectType: CommentSubjectType, subjectIds: string[]) {
  if (!subjectIds.length) return new Map<string, number>()
  const rows = await db.select({ subjectId: comments.subjectId, parentId: comments.parentId, resolvedAt: comments.resolvedAt, deletedAt: comments.deletedAt })
    .from(comments).where(and(eq(comments.subjectType, subjectType), inArray(comments.subjectId, subjectIds)))
  const counts = new Map<string, number>()
  for (const r of rows) if (!r.parentId && !r.resolvedAt && !r.deletedAt) counts.set(r.subjectId, (counts.get(r.subjectId) ?? 0) + 1)
  return counts
}
