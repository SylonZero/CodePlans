import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    pool: 'forks',
    setupFiles: ['./tests/setup.ts'],
    env: {
      DB_PROVIDER: 'sqlite',
      DATABASE_URL: ':memory:',
      AUTH_PROVIDER: 'local',
      AUTH_SECRET: 'test-secret-at-least-32-bytes-xxxx',
      BILLING_ENABLED: 'false',
      HOST_MODE: 'team',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
})
