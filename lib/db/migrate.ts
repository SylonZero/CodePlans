/* eslint-disable @typescript-eslint/no-require-imports */
// Applies pending migrations from lib/db/migrations/{sqlite,postgres} at
// server start (see lib/server-boot.ts), using drizzle's runtime migrator so
// production images don't need drizzle-kit. It records applied migrations in
// the same table drizzle-kit uses, so `pnpm db:migrate` and boot-time
// migration can be mixed freely.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { config } from '@/lib/config'

// Arbitrary constant: serialises concurrent boots against one Postgres.
const PG_LOCK_ID = 727_115_001

export function migrationsFolder(provider = config.db.provider) {
  return process.env.MIGRATIONS_DIR ?? path.join(/* turbopackIgnore: true */ process.cwd(), 'lib/db/migrations', provider)
}

function journalSize(folder: string): number {
  const journal = JSON.parse(readFileSync(/* turbopackIgnore: true */ path.join(folder, 'meta/_journal.json'), 'utf8')) as { entries: unknown[] }
  return journal.entries.length
}

const UNTRACKED = 'The database already has CodePlans tables but no migration history (it was probably created with `drizzle-kit push`). '
  + 'Run `pnpm db:migrate` against it once from a checkout, or set MIGRATE_ON_BOOT=false and manage the schema yourself.'

export type MigrationResult = { provider: 'sqlite' | 'postgres'; applied: number; total: number }

export async function migrateDatabase(): Promise<MigrationResult> {
  const folder = migrationsFolder()
  const total = journalSize(folder)
  return config.db.provider === 'sqlite' ? migrateSqlite(folder, total) : migratePostgres(folder, total)
}

async function migrateSqlite(folder: string, total: number): Promise<MigrationResult> {
  const { db } = await import('./index')
  const { migrate } = require('drizzle-orm/libsql/migrator') as typeof import('drizzle-orm/libsql/migrator')
  const { sql } = require('drizzle-orm') as typeof import('drizzle-orm')
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const d = db as any
  const tables = (await d.all(sql`select name from sqlite_master where type = 'table' and name in ('__drizzle_migrations', 'users')`)) as { name: string }[]
  const has = (n: string) => tables.some((t) => t.name === n)
  if (has('users') && !has('__drizzle_migrations')) throw new Error(UNTRACKED)
  const applied = async () => Number(((await d.all(sql`select count(*) as n from __drizzle_migrations`)) as { n: number }[])[0].n)
  const before = has('__drizzle_migrations') ? await applied() : 0
  await migrate(d, { migrationsFolder: folder })
  return { provider: 'sqlite', applied: (await applied()) - before, total }
}

async function migratePostgres(folder: string, total: number): Promise<MigrationResult> {
  const postgres = require('postgres') as typeof import('postgres')
  const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
  const { migrate } = require('drizzle-orm/postgres-js/migrator') as typeof import('drizzle-orm/postgres-js/migrator')
  // One dedicated connection, so the session-level advisory lock and the
  // migration run on the same backend.
  const client = postgres(config.db.url, { ssl: config.db.ssl ? 'require' : false, prepare: false, max: 1, onnotice: () => {} })
  try {
    await client`select pg_advisory_lock(${PG_LOCK_ID})`
    try {
      const [state] = await client<{ history: string | null; users: string | null }[]>`
        select to_regclass('drizzle.__drizzle_migrations')::text as history, to_regclass('public.users')::text as users`
      if (state.users && !state.history) throw new Error(UNTRACKED)
      const applied = async () => Number((await client<{ n: string }[]>`select count(*) as n from drizzle.__drizzle_migrations`)[0].n)
      const before = state.history ? await applied() : 0
      await migrate(drizzle(client), { migrationsFolder: folder })
      return { provider: 'postgres', applied: (await applied()) - before, total }
    } finally {
      await client`select pg_advisory_unlock(${PG_LOCK_ID})`
    }
  } finally {
    await client.end({ timeout: 5 })
  }
}
