import { resolveDbSsl } from './runtime-env'

export type DbProvider = 'postgres' | 'sqlite'
// open:   anyone who can reach the server can sign up at /signup.
// invite: people join through invites from the Team page; /signup says so.
// closed: no sign-up page at all; accounts come from invites, /setup or ADMIN_EMAIL.
export type RegistrationMode = 'open' | 'invite' | 'closed'

const provider = (process.env.AI_PROVIDER ?? 'anthropic').trim().toLowerCase()
const aiProvider = provider === 'anthropic' || provider === 'openai' ? provider : null
if (!aiProvider) {
  console.warn('[config] AI_PROVIDER must be "anthropic" or "openai"; AI drafting is disabled.')
}
const aiKey = aiProvider === 'openai' ? process.env.OPENAI_API_KEY
  : aiProvider === 'anthropic' ? process.env.ANTHROPIC_API_KEY : undefined
const aiModel = process.env.AI_MODEL?.trim() || (aiProvider === 'anthropic' ? 'claude-opus-5' : '')

// Unset values are resolved by lib/runtime-env.ts (imported above) before
// this module reads them.
export const config = {
  db: {
    provider: (process.env.DB_PROVIDER ?? 'sqlite') as DbProvider,
    url: process.env.DATABASE_URL!,
    // DB_SSL=true/false wins, then sslmode in the URL; otherwise TLS is off
    // for private-network hosts (Railway/Fly internal DNS, Docker services)
    // and on for hosted providers (Neon, RDS, ...). See lib/runtime-env.ts.
    ssl: resolveDbSsl(process.env.DATABASE_URL, process.env.DB_SSL),
  },
  ai: {
    // AI drafting (release notes, design notes) — on only when a key is
    // configured and not explicitly disabled. Never required for core flows.
    provider: aiProvider,
    enabled: !!aiProvider && !!aiKey?.trim() && !!aiModel && process.env.AI_ENABLED !== 'false',
    // OpenAI installations choose their model explicitly; never send the
    // existing Claude default to a different provider.
    model: aiModel,
  },
  registration: (process.env.REGISTRATION ?? 'invite') as RegistrationMode,
} as const
