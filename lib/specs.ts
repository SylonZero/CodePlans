import { db } from '@/lib/db'
import { integrations } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { getConnector } from '@/lib/integrations/registry'
import type { IntegrationConfig } from '@/lib/integrations/types'

const MAX_SPEC_BYTES = 500_000

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
        if (gl && !(config.baseUrl ?? 'https://gitlab.com').startsWith(gl[1])) continue
        const connector = getConnector(integration.provider)
        const { resolveConnectionToken } = await import('./integrations/secrets')
        const token = resolveConnectionToken(integration)
        if (!connector?.fetchFile || !token) continue
        const content = await connector.fetchFile({ token }, config, gh ? gh[3] : gl![4], gh ? gh[2] : gl![3])
        if (content) return content.slice(0, MAX_SPEC_BYTES)
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
