// Server start-up, run once from instrumentation.ts: log the resolved
// deployment settings, apply pending migrations, create the owner from env
// when asked, and point a fresh instance at /setup.
import { config } from '@/lib/config'
import { platformName } from '@/lib/runtime-env'
import { checkPersistentStorage } from '@/lib/storage-check'

/** Settings from earlier versions that no longer do anything. */
const RETIRED_SETTINGS = ['HOST_MODE', 'BILLING_ENABLED', 'NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_SECRET_KEY']

export function migrateOnBoot(env = process.env): boolean {
  if (env.MIGRATE_ON_BOOT) return env.MIGRATE_ON_BOOT !== 'false'
  return env.NODE_ENV === 'production'
}

function describeDatabase(): string {
  if (config.db.provider === 'postgres') {
    try {
      const u = new URL(config.db.url)
      return `postgres ${u.hostname}${u.port ? `:${u.port}` : ''}${u.pathname} (ssl ${config.db.ssl ? 'on' : 'off'})`
    } catch {
      return 'postgres (unparseable DATABASE_URL)'
    }
  }
  return `sqlite ${config.db.url}`
}

export async function bootServer() {
  const platform = platformName(process.env)
  console.log(`[boot] CodePlans · registration ${config.registration}${platform ? ` · ${platform}` : ''}`)
  console.log(`[boot] database: ${describeDatabase()}`)
  if (process.env.AUTH_URL) console.log(`[boot] public URL: ${process.env.AUTH_URL}`)

  const fatal = (msg: string) => {
    console.error(`[boot] ${msg}`)
    if (process.env.NODE_ENV === 'production') process.exit(1)
  }
  // SQLite on Railway/Fly/Render without a volume would be wiped on every deploy.
  const storage = checkPersistentStorage()
  if (!storage.ok) return fatal(storage.message)
  if (storage.reason === 'ALLOW_EPHEMERAL_DB=true') console.warn('[boot] ALLOW_EPHEMERAL_DB=true: the SQLite database is not on a volume and is lost on every deploy.')

  if (!config.db.url) return fatal('DATABASE_URL is not set. Set it to a postgres:// URL, or leave DB_PROVIDER unset to use SQLite.')
  const retired = RETIRED_SETTINGS.filter((k) => process.env[k])
  if (retired.length) console.warn(`[boot] ${retired.join(', ')} ${retired.length > 1 ? 'are' : 'is'} no longer used and can be removed. `
    + 'CodePlans runs as a single workspace with its own accounts; billing and Supabase sign-in are not part of the community edition.')
  if (process.env.AUTH_PROVIDER && process.env.AUTH_PROVIDER !== 'local') {
    console.warn(`[boot] AUTH_PROVIDER=${process.env.AUTH_PROVIDER} is not supported; using local accounts. `
      + 'People without a password here can be re-invited from the Team page.')
  }
  if (!process.env.AUTH_SECRET) {
    return fatal('AUTH_SECRET is not set. Generate one with `openssl rand -base64 32` and set it as a secret.')
  }

  // Migrations and first-run checks run per database: once in the community
  // edition, once per workspace when an enterprise module supplies several.
  const { getEnterpriseHooks } = await import('@/lib/ee/registry')
  try {
    await getEnterpriseHooks().inEachWorkspace('maintenance', prepareDatabase)
  } catch (err) {
    return fatal(`migration failed; not starting: ${err instanceof Error ? err.message : err}`)
  }
}

/** Applies migrations (when enabled) and runs first-run setup on the current database. */
export async function prepareDatabase() {
  if (migrateOnBoot()) {
    const { migrateDatabase } = await import('@/lib/db/migrate')
    const r = await migrateDatabase()
    console.log(`[boot] migrations: ${r.applied ? `applied ${r.applied}, ` : ''}${r.total} total, schema up to date`)
  }

  try {
    const { ensureOwnerFromEnv, needsSetup, setupCode } = await import('@/lib/db/first-run')
    await ensureOwnerFromEnv()
    if (await needsSetup()) {
      const base = process.env.AUTH_URL?.replace(/\/$/, '') ?? `http://localhost:${process.env.PORT ?? 3000}`
      console.log(`[setup] No accounts yet. Open ${base}/setup and enter the setup code: ${setupCode()}`)
    }
  } catch (err) {
    // An unmigrated database (MIGRATE_ON_BOOT=false) lands here; don't crash.
    console.error('[setup] first-run check failed:', err instanceof Error ? err.message : err)
  }

  const { ensureTeamWorkspace } = await import('@/lib/db/bootstrap')
  await ensureTeamWorkspace()
}
