import { db } from '@/lib/db'
import { integrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getConnector } from '@/lib/integrations/registry'
import type { IntegrationConfig } from '@/lib/integrations/types'

const MAX_SPEC_BYTES = 500_000

// Blob URLs do not delimit the ref from the path. Try the longest possible
// ref first, as git providers do, including percent-encoded slash branches.
function blobCandidates(ref: string, path: string) {
  const parts = `${ref}/${path}`.split('/')
  return Array.from({ length: parts.length - 1 }, (_, i) => parts.length - 1 - i)
    .map((split) => ({ ref: decodeURIComponent(parts.slice(0, split).join('/')), path: decodeURIComponent(parts.slice(split).join('/')) }))
}

/**
 * Best-effort fetch of a linked spec's markdown for read-only rendering.
 * Understands GitHub/GitLab blob URLs. Private repos resolve through a
 * matching org connection's token; public GitHub falls back to raw fetch.
 * Returns null when the URL isn't fetchable markdown — the UI then shows
 * a plain link instead. Never throws.
 */
export async function fetchSpecMarkdown(specUrl: string, organizationId: string | null): Promise<string | null> {
  try {
    if (!/\.(md|markdown)([?#]|$)/i.test(specUrl)) return null

    // GitHub blob: https://github.com/{owner}/{repo}/blob/{ref}/{path}
    const gh = specUrl.match(/^https:\/\/github\.com\/([^/]+\/[^/]+)\/blob\/([^/]+)\/(.+?)([?#]|$)/)
    // GitLab blob: https://{host}/{path...}/-/blob/{ref}/{path}
    const gl = specUrl.match(/^(https:\/\/[^/]+)\/(.+?)\/-\/blob\/([^/]+)\/(.+?)([?#]|$)/)
    if (!gh && !gl) return null

    if (organizationId) {
      const connections = await db.query.integrations.findMany({
        where: eq(integrations.organizationId, organizationId),
      })
      for (const integration of connections) {
        const config = (integration.config ?? {}) as IntegrationConfig
        const repo = gh ? gh[1] : gl![2]
        if (config.repo !== repo) continue
        if (gh && integration.provider !== 'github') continue
        if (gl && (integration.provider !== 'gitlab' || new URL(config.baseUrl ?? 'https://gitlab.com').origin !== gl[1])) continue
        const connector = getConnector(integration.provider)
        const { resolveConnectionToken } = await import('./integrations/secrets')
        const token = resolveConnectionToken(integration)
        if (!connector?.fetchFile || !token) continue
        for (const candidate of blobCandidates(gh ? gh[2] : gl![3], gh ? gh[3] : gl![4])) {
          const content = await connector.fetchFile({ token }, config, candidate.path, candidate.ref)
          if (content !== null) return content.slice(0, MAX_SPEC_BYTES)
        }
      }
    }

    // Public GitLab fallback is restricted to the known hosted origin.
    if (gl?.[1] === 'https://gitlab.com') {
      const connector = getConnector('gitlab')
      for (const candidate of blobCandidates(gl[3], gl[4])) {
        const content = await connector?.fetchFile?.({ token: '' }, { repo: gl[2] }, candidate.path, candidate.ref)
        if (content != null) return content.slice(0, MAX_SPEC_BYTES)
      }
    }

    // Public GitHub fallback
    if (gh) {
      const res = await fetch(`https://raw.githubusercontent.com/${gh[1]}/${gh[2]}/${gh[3]}`)
      if (res.ok) return (await res.text()).slice(0, MAX_SPEC_BYTES)
    }
    return null
  } catch {
    return null
  }
}
