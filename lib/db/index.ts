/* eslint-disable @typescript-eslint/no-require-imports */
import { config } from '@/lib/config'
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js'
import type * as PgSchema from './schema.pg'

// TypeScript always sees db as the postgres type for full IDE / type-check support.
// In SQLite mode the runtime object is a libsql Drizzle instance but the column names
// and table names are identical, so all queries work correctly.
function createDb(): PostgresJsDatabase<typeof PgSchema> {
  if (config.db.provider === 'sqlite') {
    const { createClient } = require('@libsql/client') as typeof import('@libsql/client')
    const { drizzle } = require('drizzle-orm/libsql') as typeof import('drizzle-orm/libsql')
    const schema = require('./schema.sqlite')
    // libsql requires a file: scheme for local paths; normalise bare paths
    const rawUrl = config.db.url
    const url =
      rawUrl === ':memory:' || rawUrl.startsWith('file:') || rawUrl.startsWith('http')
        ? rawUrl
        : `file:${rawUrl}`
    const client = createClient({ url })
    return drizzle(client, { schema }) as unknown as PostgresJsDatabase<typeof PgSchema>
  } else {
    const postgres = require('postgres') as typeof import('postgres')
    const { drizzle } = require('drizzle-orm/postgres-js') as typeof import('drizzle-orm/postgres-js')
    const schema = require('./schema.pg') as typeof PgSchema
    const client = postgres(config.db.url, { ssl: config.db.ssl ? 'require' : false, prepare: false })
    return drizzle(client, { schema })
  }
}

export const db = createDb()
