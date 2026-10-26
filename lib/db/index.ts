/* eslint-disable @typescript-eslint/no-require-imports */
import { config } from '@/lib/config'
import { resolveDbSsl, sqliteFilePath } from '@/lib/runtime-env'
import { getEnterpriseHooks } from '@/lib/ee/registry'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as PgSchema from './schema.pg'
import { BUSY_TIMEOUT_PRAGMA, queueWrites, WriteQueue } from './sqlite-writes'

// TypeScript always sees db as the postgres type for full IDE / type-check support.
// In SQLite mode the runtime object is a libsql Drizzle instance but the column names
// and table names are identical, so all queries work correctly.
type Db = PostgresJsDatabase<typeof PgSchema>

// `writes` is set for a local SQLite file, where writes must run one at a time
// (see lib/db/sqlite-writes.ts).
type Handle = { instance: Db; writes: WriteQueue | null }

function createDb(rawUrl: string): Handle {
  if (config.db.provider === 'sqlite') {
    const { createClient } = require('@libsql/client') as typeof import('@libsql/client')
    const { drizzle } = require('drizzle-orm/libsql') as typeof import('drizzle-orm/libsql')
    const schema = require('./schema.sqlite')
    // libsql requires a file: scheme for local paths; normalise bare paths
    const url =
      rawUrl === ':memory:' || /^(file|libsql|https?|wss?):/i.test(rawUrl)
        ? rawUrl
        : `file:${rawUrl}`
    // libsql doesn't create missing directories (e.g. a freshly mounted volume).
    const file = sqliteFilePath(url)
    if (file) {
      const { mkdirSync } = require('node:fs') as typeof import('node:fs')
      const { dirname } = require('node:path') as typeof import('node:path')
      mkdirSync(dirname(file), { recursive: true })
    }
    // DATABASE_AUTH_TOKEN is only needed for a hosted libsql server (Turso).
    let client = createClient({ url, authToken: process.env.DATABASE_AUTH_TOKEN || undefined })
    // WAL allows concurrent readers alongside a writer; busy_timeout retries
    // instead of immediately throwing SQLITE_BUSY when another process holds
    // the write lock.
    client.execute('PRAGMA journal_mode=WAL')
    client.execute(BUSY_TIMEOUT_PRAGMA)
    // A hosted libsql server (Turso) arbitrates writes itself.
    const writes = url === ':memory:' || /^file:/i.test(url) ? new WriteQueue() : null
    if (writes) client = queueWrites(client, writes)
    return { instance: drizzle(client, { schema }) as unknown as PostgresJsDatabase<typeof PgSchema>, writes }
  } else {
    const postgres = require('postgres') as typeof import('postgres')
    const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
    const schema = require('./schema.pg') as typeof PgSchema
    const client = postgres(rawUrl, { ssl: resolveDbSsl(rawUrl, process.env.DB_SSL) ? 'require' : false, prepare: false })
    return { instance: drizzle(client, { schema }), writes: null }
  }
}

// Drizzle methods that change data. A read-only workspace (see below) rejects
// them before any SQL runs.
const WRITE_METHODS = new Set<PropertyKey>(['insert', 'update', 'delete', 'transaction', 'run', 'execute', 'batch'])

const opened = new Map<string, Handle>()

function openDb(url: string): Handle {
  let handle = opened.get(url)
  if (!handle) {
    handle = createDb(url)
    opened.set(url, handle)
  }
  return handle
}

/**
 * The database for the current request or job. The community edition always
 * uses DATABASE_URL. An enterprise module may supply a database per workspace
 * through the `workspaceDatabase` hook (lib/ee/types.ts); it is opened once and
 * reused.
 */
function currentDb(): Handle & { readOnly: string | null } {
  const workspace = getEnterpriseHooks().workspaceDatabase()
  if (!workspace) return { ...openDb(config.db.url), readOnly: null }
  return { ...openDb(workspace.url), readOnly: workspace.readOnly ?? null }
}

/** Thrown when a read-only workspace tries to change data. */
export class ReadOnlyDatabaseError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'ReadOnlyDatabaseError'
  }
}

// Every import of `db` goes through this proxy, which forwards to the current
// database. Without an enterprise module that is always the one DATABASE_URL
// database, opened on first use, so behavior is the same as a plain instance.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const { instance, writes, readOnly } = currentDb()
    if (readOnly && WRITE_METHODS.has(prop)) {
      return () => { throw new ReadOnlyDatabaseError(readOnly) }
    }
    if (writes && prop === 'transaction') {
      return (...args: Parameters<Db['transaction']>) => writes.transaction(() => instance.transaction(...args))
    }
    const value = Reflect.get(instance, prop, instance)
    return typeof value === 'function' ? value.bind(instance) : value
  },
  has(_target, prop) {
    return Reflect.has(currentDb().instance, prop)
  },
})
