import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto'

function key(): Buffer {
  const secret = process.env.AUTH_SECRET
  if (!secret) throw new Error('AUTH_SECRET is required to store integration tokens')
  return createHash('sha256').update(secret).digest()
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', key(), iv)
  const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64')).join('.')
}

export function decryptToken(blob: string): string | null {
  try {
    const [iv, tag, data] = blob.split('.').map((b) => Buffer.from(b, 'base64'))
    const decipher = createDecipheriv('aes-256-gcm', key(), iv)
    decipher.setAuthTag(tag)
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8')
  } catch {
    return null // wrong AUTH_SECRET or corrupted blob
  }
}

/** Stored (encrypted) token wins; env-var reference is the fallback. */
export function resolveConnectionToken(integration: {
  tokenEncrypted?: string | null
  authRef?: string | null
}): string | undefined {
  if (integration.tokenEncrypted) {
    const token = decryptToken(integration.tokenEncrypted)
    if (token) return token
  }
  return integration.authRef ? process.env[integration.authRef] : undefined
}
