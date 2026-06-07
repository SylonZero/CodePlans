export type AuthProvider = 'supabase' | 'local'
export type DbProvider = 'postgres' | 'sqlite'
// saas: multi-tenant hosted, open registration, billing available.
// team: single private team, registration closed, billing hidden.
export type HostMode = 'saas' | 'team'
// open:   anyone can sign up.
// invite: signup requires a valid invite token (token infrastructure coming soon).
// closed: signup disabled entirely; users created by admin via seed / CLI.
export type RegistrationMode = 'open' | 'invite' | 'closed'

const hostMode = (process.env.HOST_MODE ?? 'saas') as HostMode

export const config = {
  hostMode,
  auth: {
    provider: (process.env.AUTH_PROVIDER ?? 'supabase') as AuthProvider,
  },
  db: {
    provider: (process.env.DB_PROVIDER ?? 'postgres') as DbProvider,
    url: process.env.DATABASE_URL!,
    // Set DB_SSL=false for local or non-SSL Postgres. Defaults to true for
    // hosted providers (Supabase, Neon, Railway, etc.) that require SSL.
    ssl: process.env.DB_SSL !== 'false',
  },
  billing: {
    // Billing is always off in team mode. In saas mode, BILLING_ENABLED controls it.
    enabled: hostMode !== 'team' && process.env.BILLING_ENABLED !== 'false',
  },
  registration: (process.env.REGISTRATION ?? 'open') as RegistrationMode,
} as const
