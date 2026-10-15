import { defineConfig, globalIgnores } from 'eslint/config'
import nextVitals from 'eslint-config-next/core-web-vitals'
import nextTs from 'eslint-config-next/typescript'

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // The query layer runs on SQLite and Postgres drivers with different
      // types, so `db as any` is deliberate there. Flag new uses, don't fail.
      '@typescript-eslint/no-explicit-any': 'warn',
      // React Compiler guidance (the app doesn't use the compiler yet): worth
      // fixing when touching these components, not a reason to fail CI.
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/refs': 'warn',
      'react-hooks/purity': 'warn',
    },
  },
  globalIgnores(['.next/**', 'out/**', 'build/**', 'next-env.d.ts', 'refs/**', 'coverage/**', 'docs/**', 'lib/db/migrations/**', 'plugins/**', 'cli/dist/**']),
])
