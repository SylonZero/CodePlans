import { describe, it, expect } from 'vitest'
import { runtimeDefaults, resolveDbSsl, sqliteFilePath, isPostgresUrl } from '@/lib/runtime-env'

describe('runtimeDefaults', () => {
  it('gives an empty environment the self-hosted SQLite defaults', () => {
    expect(runtimeDefaults({})).toEqual({
      REGISTRATION: 'invite', DB_PROVIDER: 'sqlite', DATABASE_URL: 'file:data/codeplans.db',
    })
  })

  it('puts the SQLite file under DATA_DIR', () => {
    expect(runtimeDefaults({ DATA_DIR: '/data/' }).DATABASE_URL).toBe('file:/data/codeplans.db')
  })

  it('picks Postgres from a postgres:// DATABASE_URL', () => {
    const out = runtimeDefaults({ DATABASE_URL: 'postgresql://u:p@db.railway.internal:5432/railway' })
    expect(out.DB_PROVIDER).toBe('postgres')
    expect(out.DATABASE_URL).toBeUndefined()
  })

  it('treats file: and libsql:// URLs as SQLite', () => {
    expect(runtimeDefaults({ DATABASE_URL: 'file:/x.db' }).DB_PROVIDER).toBe('sqlite')
    expect(runtimeDefaults({ DATABASE_URL: 'libsql://db.turso.io' }).DB_PROVIDER).toBe('sqlite')
  })

  it('never overrides explicit settings', () => {
    const env = { DB_PROVIDER: 'postgres', REGISTRATION: 'open', AUTH_URL: 'https://x.dev', DATABASE_URL: 'file:a.db' }
    expect(runtimeDefaults(env)).toEqual({})
  })

  it('ignores retired Supabase and host-mode settings', () => {
    const out = runtimeDefaults({ NEXT_PUBLIC_SUPABASE_URL: 'https://p.supabase.co', HOST_MODE: 'saas' })
    expect(out).toEqual({ REGISTRATION: 'invite', DB_PROVIDER: 'sqlite', DATABASE_URL: 'file:data/codeplans.db' })
  })

  it('derives the public URL from Railway, Fly.io and Render', () => {
    expect(runtimeDefaults({ RAILWAY_PUBLIC_DOMAIN: 'cp.up.railway.app', RAILWAY_ENVIRONMENT: 'production' }))
      .toMatchObject({ AUTH_URL: 'https://cp.up.railway.app', AUTH_TRUST_HOST: 'true' })
    expect(runtimeDefaults({ FLY_APP_NAME: 'cp-team' })).toMatchObject({ AUTH_URL: 'https://cp-team.fly.dev', AUTH_TRUST_HOST: 'true' })
    expect(runtimeDefaults({ RENDER: 'true', RENDER_EXTERNAL_URL: 'https://cp.onrender.com' }).AUTH_URL).toBe('https://cp.onrender.com')
    expect(runtimeDefaults({ FLY_APP_NAME: 'cp', AUTH_URL: 'https://plans.example.com' }).AUTH_URL).toBeUndefined()
    expect(runtimeDefaults({}).AUTH_TRUST_HOST).toBeUndefined()
  })
})

describe('resolveDbSsl', () => {
  it('honours DB_SSL first', () => {
    expect(resolveDbSsl('postgres://x@db.neon.tech/a', 'false')).toBe(false)
    expect(resolveDbSsl('postgres://x@localhost/a', 'true')).toBe(true)
  })
  it('honours sslmode in the URL', () => {
    expect(resolveDbSsl('postgres://x@db.example.com/a?sslmode=disable', undefined)).toBe(false)
    expect(resolveDbSsl('postgres://x@localhost/a?sslmode=require', undefined)).toBe(true)
  })
  it('turns TLS off on private networks and on elsewhere', () => {
    for (const host of ['localhost', '127.0.0.1', 'db', 'postgres.railway.internal', 'cp-db.flycast', 'cp-db.internal']) {
      expect(resolveDbSsl(`postgres://x@${host}:5432/a`, undefined)).toBe(false)
    }
    for (const host of ['ep-cool.us-east-2.aws.neon.tech', 'db.abc.supabase.co', 'roundhouse.proxy.rlwy.net']) {
      expect(resolveDbSsl(`postgres://x@${host}:5432/a`, undefined)).toBe(true)
    }
  })
})

describe('url helpers', () => {
  it('recognises Postgres URLs', () => {
    expect(isPostgresUrl('postgres://a')).toBe(true)
    expect(isPostgresUrl('POSTGRESQL://a')).toBe(true)
    expect(isPostgresUrl('file:a.db')).toBe(false)
    expect(isPostgresUrl(undefined)).toBe(false)
  })
  it('extracts local SQLite file paths only', () => {
    expect(sqliteFilePath('file:/data/codeplans.db')).toBe('/data/codeplans.db')
    expect(sqliteFilePath('data/x.db')).toBe('data/x.db')
    expect(sqliteFilePath(':memory:')).toBeNull()
    expect(sqliteFilePath('libsql://db.turso.io')).toBeNull()
  })
})
