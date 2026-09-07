// Register tsx as a CommonJS loader so that require('./schema.sqlite')
// inside lib/db/index.ts can resolve .ts files at test time.
import 'tsx/cjs'

// libsql closes/reopens its local connection after interactive transactions;
// :memory: loses its database at that boundary. Use an isolated temporary DB
// per test file so rollback and graduation tests exercise real transactions.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
const testDbDir = mkdtempSync(join(tmpdir(), 'codeplans-test-'))
process.env.DATABASE_URL = `file:${join(testDbDir, 'test.db')}`
afterAll(() => rmSync(testDbDir, { recursive: true, force: true }))
