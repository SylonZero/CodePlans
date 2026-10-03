import { describe, it, expect } from 'vitest'
import { checkPersistentStorage, mountPointOf, parseMountPoints } from '@/lib/storage-check'

const ROOT_ONLY = ['/', '/proc', '/sys', '/dev', '/etc/hosts']
const WITH_DATA = [...ROOT_ONLY, '/data']
const sqlite = (extra: Record<string, string> = {}) => ({ DB_PROVIDER: 'sqlite', DATABASE_URL: 'file:/data/codeplans.db', ...extra })

describe('mount parsing', () => {
  it('reads mount points from mountinfo and decodes escapes', () => {
    const info = [
      '23 28 0:22 / /proc rw,relatime - proc proc rw',
      '410 389 253:1 /vol /data rw,relatime - ext4 /dev/vdb rw',
      '411 389 253:1 /x /mnt/my\\040disk rw - ext4 /dev/vdc rw',
      '389 1 0:50 / / rw - overlay overlay rw',
    ].join('\n')
    expect(parseMountPoints(info)).toEqual(['/proc', '/data', '/mnt/my disk', '/'])
  })

  it('finds the mount a path lives on', () => {
    expect(mountPointOf('/data', WITH_DATA)).toBe('/data')
    expect(mountPointOf('/data/sub', WITH_DATA)).toBe('/data')
    expect(mountPointOf('/database', WITH_DATA)).toBe('/')
    expect(mountPointOf('/app/data', WITH_DATA)).toBe('/')
  })
})

describe('checkPersistentStorage', () => {
  it('refuses SQLite on Railway without a volume, explaining how to fix it', () => {
    const r = checkPersistentStorage(sqlite({ RAILWAY_ENVIRONMENT: 'production' }), ROOT_ONLY)
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.platform).toBe('railway')
      expect(r.message).toMatch(/Attach volume, with mount path \/data/)
      expect(r.message).toMatch(/ALLOW_EPHEMERAL_DB=true/)
    }
  })

  it('refuses on Fly.io and Render too', () => {
    const fly = checkPersistentStorage(sqlite({ FLY_APP_NAME: 'cp' }), ROOT_ONLY)
    expect(!fly.ok && fly.message).toMatch(/fly volumes create/)
    const render = checkPersistentStorage(sqlite({ RENDER: 'true' }), ROOT_ONLY)
    expect(!render.ok && render.message).toMatch(/persistent disk/)
  })

  it('passes when the database directory is a mounted volume', () => {
    expect(checkPersistentStorage(sqlite({ FLY_APP_NAME: 'cp' }), WITH_DATA).ok).toBe(true)
  })

  it('trusts RAILWAY_VOLUME_MOUNT_PATH when it covers the database', () => {
    expect(checkPersistentStorage(sqlite({ RAILWAY_ENVIRONMENT: 'p', RAILWAY_VOLUME_MOUNT_PATH: '/data' }), ROOT_ONLY).ok).toBe(true)
    expect(checkPersistentStorage(sqlite({ RAILWAY_ENVIRONMENT: 'p', RAILWAY_VOLUME_MOUNT_PATH: '/other' }), ROOT_ONLY).ok).toBe(false)
  })

  it('allows running without a volume on purpose', () => {
    expect(checkPersistentStorage(sqlite({ RAILWAY_ENVIRONMENT: 'p', ALLOW_EPHEMERAL_DB: 'true' }), ROOT_ONLY))
      .toEqual({ ok: true, reason: 'ALLOW_EPHEMERAL_DB=true' })
  })

  it('does not apply to Postgres, in-memory or remote SQLite, or outside the platforms', () => {
    expect(checkPersistentStorage({ DB_PROVIDER: 'postgres', DATABASE_URL: 'postgres://x@h/db', RAILWAY_ENVIRONMENT: 'p' }, ROOT_ONLY).ok).toBe(true)
    expect(checkPersistentStorage(sqlite({ DATABASE_URL: ':memory:', FLY_APP_NAME: 'cp' }), ROOT_ONLY).ok).toBe(true)
    expect(checkPersistentStorage(sqlite({ DATABASE_URL: 'libsql://db.turso.io', FLY_APP_NAME: 'cp' }), ROOT_ONLY).ok).toBe(true)
    expect(checkPersistentStorage(sqlite(), ROOT_ONLY).ok).toBe(true)
  })

  it('passes when mounts cannot be read', () => {
    expect(checkPersistentStorage(sqlite({ FLY_APP_NAME: 'cp' }), null)).toEqual({ ok: true, reason: 'mounts unknown' })
  })
})
