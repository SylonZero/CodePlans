import { describe, it, expect, beforeAll, beforeEach, afterEach } from 'vitest'
import { runMigrations, seedFixtures, clearTables, F } from '@/tests/helpers/db'
import { createApiKey, listApiKeys, revokeApiKey, verifyApiKey } from '@/lib/mcp/auth'

beforeAll(async () => { await runMigrations() })
beforeEach(async () => { await seedFixtures() })
afterEach(async () => { await clearTables() })

describe('API keys', () => {
  it('mints a key that verifies to its user and scope', async () => {
    const { plaintext, keyPrefix } = await createApiKey(F.alice, 'test key', 'write')
    expect(plaintext).toMatch(/^cpk_[0-9a-f]{48}$/)
    expect(plaintext.startsWith(keyPrefix)).toBe(true)

    const verified = await verifyApiKey(plaintext)
    expect(verified).toEqual({ userId: F.alice, scope: 'write' })
  })

  it('rejects unknown, malformed, and revoked keys', async () => {
    expect(await verifyApiKey('cpk_' + '0'.repeat(48))).toBeNull()
    expect(await verifyApiKey('not-a-key')).toBeNull()
    expect(await verifyApiKey(undefined)).toBeNull()

    const { plaintext, id } = await createApiKey(F.alice, 'to revoke', 'read')
    expect(await verifyApiKey(plaintext)).not.toBeNull()
    await revokeApiKey(id, F.alice)
    expect(await verifyApiKey(plaintext)).toBeNull()
  })

  it('only the owner can revoke; listing never exposes the hash', async () => {
    const { id } = await createApiKey(F.alice, 'mine', 'read')
    expect(await revokeApiKey(id, F.bob)).toBeNull()

    const keys = await listApiKeys(F.alice)
    expect(keys).toHaveLength(1)
    expect(keys[0]).not.toHaveProperty('keyHash')
    expect(keys[0].keyPrefix).toMatch(/^cpk_/)
    expect(keys[0].revoked).toBe(false)
  })
})

describe('resolveAssigneeEmail', () => {
  it('resolves shared-workspace members and rejects outsiders/unknowns', async () => {
    const { resolveAssigneeEmail } = await import('@/lib/mcp/users')
    expect(await resolveAssigneeEmail(F.alice, 'bob@test.local')).toBe(F.bob)
    // carol exists but shares no org with alice
    await expect(resolveAssigneeEmail(F.alice, 'carol@test.local')).rejects.toThrow('No workspace member')
    await expect(resolveAssigneeEmail(F.alice, 'ghost@test.local')).rejects.toThrow('No workspace member')
  })
})
