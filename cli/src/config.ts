// Connection profiles in ~/.config/codeplans/config.json (or $XDG_CONFIG_HOME),
// written with mode 0600. CODEPLANS_URL / CODEPLANS_API_KEY / CODEPLANS_PROFILE
// override the file, so CI needs no file at all.
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { CliError, EXIT } from './client.js'

/** Environment variables; a plain record so tests can pass a few. */
export type Env = Record<string, string | undefined>

export type Profile = { url: string; key: string }
export type Config = { current?: string; profiles: Record<string, Profile> }

export function configPath(env: Env = process.env): string {
  const base = env.XDG_CONFIG_HOME?.trim() || path.join(homedir(), '.config')
  return path.join(base, 'codeplans', 'config.json')
}

export function readConfig(file = configPath()): Config {
  if (!existsSync(file)) return { profiles: {} }
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8')) as Partial<Config>
    return { current: parsed.current, profiles: parsed.profiles ?? {} }
  } catch {
    throw new CliError(`Can't read ${file}. Fix or delete it, then run codeplans login.`, EXIT.usage)
  }
}

export function writeConfig(config: Config, file = configPath()) {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 })
  writeFileSync(file, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 })
  chmodSync(file, 0o600)
}

export type Connection = Profile & { profile: string | null; source: 'env' | 'profile' }

/** Where to connect: environment variables first, then the chosen (or current) profile. */
export function resolveConnection(opts: { profile?: string }, env: Env = process.env, file = configPath(env)): Connection {
  const profileName = opts.profile ?? env.CODEPLANS_PROFILE ?? undefined
  if (env.CODEPLANS_URL && env.CODEPLANS_API_KEY && !opts.profile) {
    return { url: normalizeUrl(env.CODEPLANS_URL), key: env.CODEPLANS_API_KEY, profile: null, source: 'env' }
  }
  const config = readConfig(file)
  const name = profileName ?? config.current ?? 'default'
  const profile = config.profiles[name]
  if (!profile) {
    throw new CliError(
      Object.keys(config.profiles).length
        ? `No profile named "${name}". Profiles: ${Object.keys(config.profiles).join(', ')}.`
        : 'Not connected. Run: codeplans login --url https://your-codeplans --key cpk_… (or set CODEPLANS_URL and CODEPLANS_API_KEY).',
      EXIT.auth,
    )
  }
  return {
    url: normalizeUrl(env.CODEPLANS_URL ?? profile.url),
    key: env.CODEPLANS_API_KEY ?? profile.key,
    profile: name,
    source: 'profile',
  }
}

/** HTTPS only, except for local development. */
export function normalizeUrl(raw: string): string {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    throw new CliError(`"${raw}" isn't a URL. Use the address you open CodePlans at, e.g. https://acme.codeplans.app`, EXIT.usage)
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && local)) {
    throw new CliError('Use an https:// URL (http:// is allowed only for localhost).', EXIT.usage)
  }
  return url.origin + url.pathname.replace(/\/+$/, '')
}

export function maskKey(key: string): string {
  return key.length <= 10 ? '••••' : `${key.slice(0, 6)}…${key.slice(-4)}`
}
