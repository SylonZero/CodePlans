/* eslint-disable @typescript-eslint/no-require-imports */
// Guards against the easiest way to lose data on a cloud deploy: SQLite on a
// platform that throws the container's filesystem away on every deploy, with
// no volume mounted. The app would look fine, show /setup again and quietly
// start from an empty database each time.
import path from 'node:path'
import { platformName, sqliteFilePath } from '@/lib/runtime-env'

type Env = Record<string, string | undefined>

/** Mount points from /proc/self/mountinfo (field 5, octal escapes decoded), or null where unavailable. */
export function parseMountPoints(mountinfo: string): string[] {
  return mountinfo.split('\n').filter(Boolean).map((line) => {
    const mountPoint = line.split(' ')[4] ?? ''
    return mountPoint.replace(/\\([0-7]{3})/g, (_, o: string) => String.fromCharCode(parseInt(o, 8)))
  }).filter((p) => p.startsWith('/'))
}

/** The mount point a path lives on: the longest mount point that contains it. */
export function mountPointOf(target: string, mountPoints: string[]): string {
  let best = '/'
  for (const m of mountPoints) {
    const inside = m === '/' || target === m || target.startsWith(m.endsWith('/') ? m : `${m}/`)
    if (inside && m.length > best.length) best = m
  }
  return best
}

function readMountPoints(): string[] | null {
  try {
    const { readFileSync } = require('node:fs') as typeof import('node:fs')
    return parseMountPoints(readFileSync('/proc/self/mountinfo', 'utf8'))
  } catch {
    return null // not Linux, or /proc unavailable: can't tell
  }
}

export type StorageCheck =
  | { ok: true; reason?: string }
  | { ok: false; platform: string; dir: string; message: string }

/**
 * Whether the SQLite database will survive a redeploy. Only enforced on
 * platforms that replace the container filesystem on each deploy (Railway,
 * Fly.io, Render); elsewhere it always passes. Postgres, :memory: and remote
 * libsql URLs always pass, as does ALLOW_EPHEMERAL_DB=true.
 */
export function checkPersistentStorage(env: Env = process.env, mountPoints: string[] | null = readMountPoints()): StorageCheck {
  if (env.DB_PROVIDER !== 'sqlite') return { ok: true }
  const file = sqliteFilePath(env.DATABASE_URL)
  if (!file) return { ok: true }
  const platform = platformName(env)
  if (!platform) return { ok: true }
  if (env.ALLOW_EPHEMERAL_DB === 'true') return { ok: true, reason: 'ALLOW_EPHEMERAL_DB=true' }

  const dir = path.dirname(path.resolve(/* turbopackIgnore: true */ file))
  const railwayVolume = env.RAILWAY_VOLUME_MOUNT_PATH
  if (railwayVolume && mountPointOf(dir, [path.resolve(railwayVolume)]) !== '/') return { ok: true }
  if (!mountPoints) return { ok: true, reason: 'mounts unknown' }
  if (mountPointOf(dir, mountPoints) !== '/') return { ok: true }

  const how = platform === 'railway'
    ? `In Railway, right-click the service → Attach volume, with mount path ${dir}.`
    : platform === 'fly'
      ? `On Fly.io, keep the [[mounts]] section in fly.toml (destination = "${dir}") and create the volume: fly volumes create codeplans_data --size 1.`
      : `On Render, add a persistent disk mounted at ${dir}.`
  return {
    ok: false, platform, dir,
    message: `The SQLite database is at ${file}, but ${dir} is not on a persistent volume. `
      + `${platform === 'fly' ? 'Fly.io' : platform[0].toUpperCase() + platform.slice(1)} replaces the container's files on every deploy, so all data would be lost. `
      + `${how} Or use Postgres by setting DATABASE_URL. To run without a volume on purpose (a throwaway trial), set ALLOW_EPHEMERAL_DB=true.`,
  }
}
