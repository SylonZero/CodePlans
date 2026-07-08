import { createHash, randomBytes } from 'crypto'
import { db } from '@/lib/db'
import { apiKeys } from '@/lib/db/schema'
import { eq, and, isNull } from 'drizzle-orm'

export type ApiKeyScope = 'read' | 'write'

function hashKey(key: string): string {
  return createHash('sha256').update(key).digest('hex')
}

/** Mint a key. The plaintext is returned once and never stored. */
export async function createApiKey(userId: string, name: string, scope: ApiKeyScope) {
  const plaintext = `cpk_${randomBytes(24).toString('hex')}`
  const [row] = await db
    .insert(apiKeys)
    .values({
      userId,
      name,
      scope,
      keyHash: hashKey(plaintext),
      keyPrefix: plaintext.slice(0, 12),
    })
    .returning()
  return { plaintext, id: row.id, keyPrefix: row.keyPrefix }
}

export async function listApiKeys(userId: string) {
  const rows = await db.query.apiKeys.findMany({ where: eq(apiKeys.userId, userId) })
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    keyPrefix: r.keyPrefix,
    scope: r.scope,
    revoked: r.revokedAt != null,
    lastUsedAt: r.lastUsedAt?.toISOString() ?? null,
    createdAt: r.createdAt.toISOString(),
  }))
}

export async function revokeApiKey(id: string, userId: string) {
  const [row] = await db
    .update(apiKeys)
    .set({ revokedAt: new Date() })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, userId)))
    .returning({ id: apiKeys.id })
  return row ?? null
}

/** Resolve a bearer key to its acting user, or null. Bumps lastUsedAt. */
export async function verifyApiKey(
  plaintext: string | null | undefined,
): Promise<{ userId: string; scope: ApiKeyScope } | null> {
  if (!plaintext?.startsWith('cpk_')) return null
  const row = await db.query.apiKeys.findFirst({
    where: and(eq(apiKeys.keyHash, hashKey(plaintext)), isNull(apiKeys.revokedAt)),
  })
  if (!row) return null
  // Fire-and-forget freshness marker; never blocks or fails the request.
  db.update(apiKeys)
    .set({ lastUsedAt: new Date() })
    .where(eq(apiKeys.id, row.id))
    .then(undefined, () => {})
  return { userId: row.userId, scope: row.scope as ApiKeyScope }
}
