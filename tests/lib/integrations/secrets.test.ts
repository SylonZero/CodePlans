import { describe, it, expect, afterEach } from 'vitest'
import { encryptToken, decryptToken, resolveConnectionToken } from '@/lib/integrations/secrets'

afterEach(() => { delete process.env.SECRETS_TEST_VAR })

describe('integration token encryption', () => {
  it('round-trips and produces unique ciphertexts', () => {
    const a = encryptToken('glpat-secret-123')
    const b = encryptToken('glpat-secret-123')
    expect(a).not.toBe(b) // random IV
    expect(decryptToken(a)).toBe('glpat-secret-123')
    expect(decryptToken(b)).toBe('glpat-secret-123')
  })

  it('returns null for tampered or foreign blobs', () => {
    const blob = encryptToken('tok')
    expect(decryptToken(blob.slice(0, -4) + 'AAAA')).toBeNull()
    expect(decryptToken('not-a-blob')).toBeNull()
  })

  it('resolution: stored token wins; env var is the fallback', () => {
    process.env.SECRETS_TEST_VAR = 'from-env'
    expect(resolveConnectionToken({ tokenEncrypted: encryptToken('from-db'), authRef: 'SECRETS_TEST_VAR' })).toBe('from-db')
    expect(resolveConnectionToken({ tokenEncrypted: null, authRef: 'SECRETS_TEST_VAR' })).toBe('from-env')
    expect(resolveConnectionToken({ tokenEncrypted: null, authRef: 'MISSING_VAR_XYZ' })).toBeUndefined()
    expect(resolveConnectionToken({ tokenEncrypted: 'corrupted', authRef: 'SECRETS_TEST_VAR' })).toBe('from-env')
  })
})
