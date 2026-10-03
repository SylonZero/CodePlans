/* eslint-disable @typescript-eslint/no-require-imports */
// Resolves the deployment settings a server needs from whatever the platform
// provides, so a fresh Railway / Fly.io / Docker deploy works with little or
// no configuration. Explicitly set variables always win; this only fills gaps.
//
// Applied once per process (lib/config.ts and lib/db/schema.ts import it
// before reading any env), by writing the resolved values back to process.env
// so every consumer — Auth.js, drizzle, the schema barrel — sees the same
// answer.

type Env = Record<string, string | undefined>

const POSTGRES_URL = /^postgres(ql)?:\/\//i

export function isPostgresUrl(url: string | undefined): boolean {
  return !!url && POSTGRES_URL.test(url)
}

/**
 * Values to fill in for unset variables. Pure: reads `env`, returns only the
 * keys it would add (never overrides one that is set).
 *
 * - Supabase variables present → hosted defaults (saas, supabase auth).
 *   Otherwise → self-hosted defaults (team, local auth, closed registration).
 * - The database follows DATABASE_URL: postgres:// → Postgres, anything else
 *   (file:, libsql://, :memory:) → SQLite, unset → SQLite under DATA_DIR.
 * - The public URL comes from the platform (Railway, Fly.io, Render).
 */
export function runtimeDefaults(env: Env): Record<string, string> {
  const out: Record<string, string> = {}
  const get = (k: string) => env[k] || out[k] || undefined

  const supabase = env.AUTH_PROVIDER ? env.AUTH_PROVIDER === 'supabase' : !!env.NEXT_PUBLIC_SUPABASE_URL
  if (!env.AUTH_PROVIDER) out.AUTH_PROVIDER = supabase ? 'supabase' : 'local'
  if (!env.HOST_MODE) out.HOST_MODE = supabase ? 'saas' : 'team'
  if (!env.REGISTRATION) out.REGISTRATION = get('HOST_MODE') === 'team' ? 'closed' : 'open'

  if (!env.DB_PROVIDER) {
    out.DB_PROVIDER = isPostgresUrl(env.DATABASE_URL) || (!env.DATABASE_URL && supabase) ? 'postgres' : 'sqlite'
  }
  if (!env.DATABASE_URL && get('DB_PROVIDER') === 'sqlite') {
    out.DATABASE_URL = `file:${(env.DATA_DIR || 'data').replace(/\/$/, '')}/codeplans.db`
  }

  if (!env.AUTH_URL) {
    const url = platformUrl(env)
    if (url) out.AUTH_URL = url
  }
  // Behind a platform's proxy the Host header is the public one; let Auth.js
  // trust it so custom domains work before AUTH_URL is updated.
  if (!env.AUTH_TRUST_HOST && platformName(env)) out.AUTH_TRUST_HOST = 'true'
  return out
}

export function platformName(env: Env): 'railway' | 'fly' | 'render' | null {
  if (env.RAILWAY_ENVIRONMENT || env.RAILWAY_PUBLIC_DOMAIN) return 'railway'
  if (env.FLY_APP_NAME) return 'fly'
  if (env.RENDER) return 'render'
  return null
}

function platformUrl(env: Env): string | undefined {
  if (env.RAILWAY_PUBLIC_DOMAIN) return `https://${env.RAILWAY_PUBLIC_DOMAIN}`
  if (env.FLY_APP_NAME) return `https://${env.FLY_APP_NAME}.fly.dev`
  if (env.RENDER_EXTERNAL_URL) return env.RENDER_EXTERNAL_URL
  return undefined
}

/**
 * Whether to use TLS for a Postgres connection. DB_SSL wins; then `sslmode`
 * in the URL; then off for hosts on a private network (localhost, Docker
 * service names, Railway/Fly internal DNS) and on for everything else.
 */
export function resolveDbSsl(url: string | undefined, dbSsl: string | undefined): boolean {
  if (dbSsl === 'false') return false
  if (dbSsl === 'true') return true
  if (!url) return true
  let parsed: URL
  try { parsed = new URL(url) } catch { return true }
  const mode = parsed.searchParams.get('sslmode')
  if (mode) return mode !== 'disable' && mode !== 'allow' && mode !== 'prefer'
  const host = parsed.hostname.toLowerCase()
  return !(host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '[::1]'
    || !host.includes('.') || host.endsWith('.internal') || host.endsWith('.flycast') || host.endsWith('.local'))
}

/** Absolute or relative file path of a local SQLite database URL, or null for :memory: / remote libsql. */
export function sqliteFilePath(url: string | undefined): string | null {
  if (!url || url === ':memory:' || /^(libsql|https?|wss?):/i.test(url)) return null
  const path = url.startsWith('file:') ? url.slice('file:'.length) : url
  return path && path !== ':memory:' ? path : null
}

/**
 * Self-hosted SQLite installs may leave AUTH_SECRET unset: one is generated
 * on first boot and kept next to the database (on the persistent volume), so
 * sessions and encrypted integration tokens survive restarts. Postgres and
 * multi-instance setups must set AUTH_SECRET explicitly.
 */
function ensureAuthSecret(env: Env) {
  if (env.AUTH_SECRET || env.AUTH_PROVIDER !== 'local' || env.DB_PROVIDER !== 'sqlite') return
  if (env.NEXT_PHASE === 'phase-production-build') return
  const dbPath = sqliteFilePath(env.DATABASE_URL)
  if (!dbPath) return
  try {
    const fs = require('node:fs') as typeof import('node:fs')
    const path = require('node:path') as typeof import('node:path')
    const crypto = require('node:crypto') as typeof import('node:crypto')
    // turbopackIgnore: a runtime path; don't let the build tracer pull in the project.
    const file = path.join(path.dirname(path.resolve(/* turbopackIgnore: true */ dbPath)), '.auth-secret')
    fs.mkdirSync(path.dirname(file), { recursive: true })
    try {
      fs.writeFileSync(/* turbopackIgnore: true */ file, crypto.randomBytes(32).toString('base64'), { flag: 'wx', mode: 0o600 })
      console.log(`[config] AUTH_SECRET was not set; generated one at ${file}`)
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err
    }
    env.AUTH_SECRET = fs.readFileSync(/* turbopackIgnore: true */ file, 'utf8').trim()
  } catch (err) {
    console.error('[config] AUTH_SECRET is not set and could not be generated:', err)
  }
}

export function applyRuntimeDefaults(env: Env = process.env) {
  for (const [k, v] of Object.entries(runtimeDefaults(env))) env[k] = v
  ensureAuthSecret(env)
}

applyRuntimeDefaults()
