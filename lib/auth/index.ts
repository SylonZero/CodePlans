/* eslint-disable @typescript-eslint/no-require-imports */
import type { AuthAdapter } from './types'

/**
 * Email and password accounts stored in the app's own database (SQLite or
 * Postgres). Loaded with require so Auth.js resolves next/server the way Node
 * does, also under the test runner.
 */
export const authAdapter: AuthAdapter = (require('./local') as { localAdapter: AuthAdapter }).localAdapter
export type { AuthAdapter, AuthUser } from './types'
