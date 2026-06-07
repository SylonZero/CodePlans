import { defineConfig } from 'drizzle-kit'
import { config } from 'dotenv'

config({ path: '.env.local' })

const provider = process.env.DB_PROVIDER ?? 'postgres'

export default defineConfig({
  schema: provider === 'sqlite' ? './lib/db/schema.sqlite.ts' : './lib/db/schema.pg.ts',
  out: `./lib/db/migrations/${provider}`,
  dialect: provider === 'sqlite' ? 'sqlite' : 'postgresql',
  dbCredentials: { url: process.env.DATABASE_URL! },
})
