import type {
  Connector,
  ConnectorAuth,
  ExternalItem,
  ExternalPrStatus,
  ExternalScope,
  IntegrationConfig,
} from './types'

const DEFAULT_BASE = 'https://gitlab.com'

function webBase(config: IntegrationConfig): string {
  return (config.baseUrl ?? DEFAULT_BASE).replace(/\/+$/, '')
}

function apiBase(config: IntegrationConfig): string {
  return `${webBase(config)}/api/v4`
}

function projectPath(config: IntegrationConfig): string {
  if (!config.repo) throw new Error('GitLab connection is missing config.repo (group/project)')
  return encodeURIComponent(config.repo)
}

function glHeaders(auth: ConnectorAuth) {
  return { 'PRIVATE-TOKEN': auth.token }
}

async function glFetch(auth: ConnectorAuth, url: string): Promise<Response> {
  const res = await fetch(url, { headers: glHeaders(auth) })
  if (!res.ok && res.status !== 404) {
    throw new Error(`GitLab API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  }
  return res
}

type GitLabIssue = {
  iid: number
  web_url: string
  title: string
  description: string | null
  state: 'opened' | 'closed'
  labels: string[]
  assignee: { username: string } | null
  updated_at: string
}

function mapIssue(issue: GitLabIssue): ExternalItem {
  return {
    externalId: String(issue.iid),
    externalKey: `#${issue.iid}`,
    externalUrl: issue.web_url,
    title: issue.title,
    description: issue.description ?? '',
    state: issue.state,
    labels: issue.labels ?? [],
    assigneeName: issue.assignee?.username,
    updatedAt: issue.updated_at,
  }
}

/**
 * GitLab Issues connector (pull-only). Scope: one project per connection
 * (config.repo = "group/project"); self-hosted instances via config.baseUrl.
 * Auth: a personal/project access token with read_api, resolved from the env
 * var named by the integration's authRef.
 */
export const gitlabConnector: Connector = {
  provider: 'gitlab',

  defaultStatusMap: {
    opened: 'open',
    closed: 'resolved',
  },

  async listItems(auth, config, since?: Date): Promise<ExternalItem[]> {
    const items: ExternalItem[] = []
    let page = 1
    // Bounded pagination: 10 pages × 100 = 1000 items per sync run.
    while (page <= 10) {
      const params = new URLSearchParams({
        state: 'all',
        per_page: '100',
        page: String(page),
        order_by: 'updated_at',
        sort: 'asc',
      })
      if (since) params.set('updated_after', since.toISOString())

      const res = await glFetch(auth, `${apiBase(config)}/projects/${projectPath(config)}/issues?${params}`)
      if (res.status === 404) throw new Error(`GitLab project not found: ${config.repo}`)

      const batch = (await res.json()) as GitLabIssue[]
      items.push(...batch.map(mapIssue))

      if (batch.length < 100) break
      page += 1
    }
    return items
  },

  async listScopes(auth, config): Promise<ExternalScope[]> {
    const res = await glFetch(
      auth,
      `${apiBase(config)}/projects/${projectPath(config)}/milestones?state=all&per_page=100`,
    )
    if (res.status === 404) throw new Error(`GitLab project not found: ${config.repo}`)
    const milestones = (await res.json()) as { title: string; state: string; web_url?: string }[]
    // GitLab filters issues by milestone *title*, so the title is the scope id.
    return milestones.map((m) => ({
      id: m.title,
      title: m.title,
      state: m.state === 'active' ? 'open' : m.state,
      url: m.web_url,
    }))
  },

  async listScopeItems(auth, config, scopeId): Promise<ExternalItem[]> {
    const params = new URLSearchParams({ state: 'all', per_page: '100', milestone: scopeId })
    const res = await glFetch(auth, `${apiBase(config)}/projects/${projectPath(config)}/issues?${params}`)
    if (res.status === 404) throw new Error(`GitLab project not found: ${config.repo}`)
    const batch = (await res.json()) as GitLabIssue[]
    return batch.map(mapIssue)
  },

  async fetchPullRequest(auth, config, prNumber): Promise<ExternalPrStatus | null> {
    const res = await glFetch(
      auth,
      `${apiBase(config)}/projects/${projectPath(config)}/merge_requests/${prNumber}`,
    )
    if (res.status === 404) return null
    const mr = (await res.json()) as { state: 'opened' | 'closed' | 'merged' | 'locked'; draft?: boolean }
    if (mr.state === 'merged') return 'merged'
    if (mr.state === 'closed') return 'closed'
    if (mr.draft) return 'draft'
    return 'open'
  },

  matchPrUrl(config, url) {
    if (!config.repo) return null
    const prefix = `${webBase(config)}/${config.repo}/-/merge_requests/`
    if (!url.startsWith(prefix)) return null
    const iid = url.slice(prefix.length).split(/[/?#]/)[0]
    return /^\d+$/.test(iid) ? iid : null
  },
}
