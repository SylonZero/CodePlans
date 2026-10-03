import { resolveDbSsl } from './runtime-env'

export type AuthProvider = 'supabase' | 'local'
export type DbProvider = 'postgres' | 'sqlite'
// saas: multi-tenant hosted, open registration, billing available.
// team: single private team, registration closed, billing hidden.
export type HostMode = 'saas' | 'team'
// open:   anyone can sign up.
// invite: signup requires a valid invite token (token infrastructure coming soon).
// closed: signup disabled entirely; users created by admin via seed / CLI.
export type RegistrationMode = 'open' | 'invite' | 'closed'

// Unset values are resolved by lib/runtime-env.ts (imported above) before
// this module reads them: self-hosted defaults unless Supabase is configured.
const hostMode = (process.env.HOST_MODE ?? 'team') as HostMode

export const config = {
  hostMode,
  auth: {
    provider: (process.env.AUTH_PROVIDER ?? 'local') as AuthProvider,
  },
  db: {
    provider: (process.env.DB_PROVIDER ?? 'sqlite') as DbProvider,
    url: process.env.DATABASE_URL!,
    // DB_SSL=true/false wins, then sslmode in the URL; otherwise TLS is off
    // for private-network hosts (Railway/Fly internal DNS, Docker services)
    // and on for hosted providers (Supabase, Neon, ...). See lib/runtime-env.ts.
    ssl: resolveDbSsl(process.env.DATABASE_URL, process.env.DB_SSL),
  },
  billing: {
    // Billing is always off in team mode. In saas mode, BILLING_ENABLED controls it.
    enabled: hostMode !== 'team' && process.env.BILLING_ENABLED !== 'false',
  },
  ai: {
    // AI drafting (release notes, design notes) — on only when a key is
    // configured and not explicitly disabled. Never required for core flows.
    enabled: !!process.env.ANTHROPIC_API_KEY && process.env.AI_ENABLED !== 'false',
    model: process.env.AI_MODEL ?? 'claude-opus-5',
  },
  registration: (process.env.REGISTRATION ?? 'closed') as RegistrationMode,
} as const
