import type {
  Connector,
  ConnectorAuth,
  ExternalItem,
  ExternalPrStatus,
  ExternalScope,
  IntegrationConfig,
} from './types'

const API_BASE = 'https://api.github.com'

function ghHeaders(auth: ConnectorAuth) {
  return {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${auth.token}`,
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

function mapIssue(issue: GitHubIssue): ExternalItem {
  return {
    externalId: String(issue.number),
    externalKey: `#${issue.number}`,
    externalUrl: issue.html_url,
    title: issue.title,
    description: issue.body ?? '',
    state: issue.state,
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')).filter(Boolean),
    assigneeName: issue.assignee?.login,
    updatedAt: issue.updated_at,
  }
}

type GitHubIssue = {
  number: number
  html_url: string
  title: string
  body: string | null
  state: 'open' | 'closed'
  labels: ({ name?: string } | string)[]
  assignee: { login: string } | null
  updated_at: string
  pull_request?: unknown
}

/**
 * GitHub Issues connector (pull-only). Scope: one repository per connection
 * (config.repo = "owner/name"). Auth: a personal access token or GitHub App
 * token resolved from the env var named by the integration's authRef.
 */
export const githubConnector: Connector = {
  provider: 'github',

  defaultStatusMap: {
    open: 'open',
    closed: 'resolved',
  },

  async listItems(auth: ConnectorAuth, config: IntegrationConfig, since?: Date): Promise<ExternalItem[]> {
    if (!config.repo) throw new Error('GitHub connection is missing config.repo (owner/name)')

    const items: ExternalItem[] = []
    let page = 1
    // Bounded pagination: 10 pages × 100 = 1000 items per sync run.
    while (page <= 10) {
      const params = new URLSearchParams({
        state: 'all',
        per_page: '100',
        page: String(page),
        sort: 'updated',
        direction: 'asc',
      })
      if (since) params.set('since', since.toISOString())

      const res = await fetch(`${API_BASE}/repos/${config.repo}/issues?${params}`, {
        headers: ghHeaders(auth),
      })
      if (!res.ok) {
        throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }

      const batch = (await res.json()) as GitHubIssue[]
      for (const issue of batch) {
        if (issue.pull_request) continue // the issues API also returns PRs
        items.push(mapIssue(issue))
      }

      if (batch.length < 100) break
      page += 1
    }

    return items
  },

  async listScopes(auth, config): Promise<ExternalScope[]> {
    if (!config.repo) throw new Error('GitHub connection is missing config.repo (owner/name)')
    const res = await fetch(
      `${API_BASE}/repos/${config.repo}/milestones?state=all&per_page=100`,
      { headers: ghHeaders(auth) },
    )
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const milestones = (await res.json()) as {
      number: number
      title: string
      state: string
      html_url?: string
    }[]
    return milestones.map((m) => ({
      id: String(m.number),
      title: m.title,
      state: m.state,
      url: m.html_url,
    }))
  },

  async postComment(auth, config, externalId, body) {
    if (!config.repo) throw new Error('GitHub connection is missing config.repo (owner/name)')
    const res = await fetch(`${API_BASE}/repos/${config.repo}/issues/${externalId}/comments`, {
      method: 'POST',
      headers: { ...ghHeaders(auth), 'Content-Type': 'application/json' },
      body: JSON.stringify({ body }),
    })
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  },

  matchPrUrl(config, url) {
    if (!config.repo) return null
    const prefix = `https://github.com/${config.repo}/pull/`
    if (!url.startsWith(prefix)) return null
    const prNumber = url.slice(prefix.length).split(/[/?#]/)[0]
    return /^\d+$/.test(prNumber) ? prNumber : null
  },

  async listScopeItems(auth, config, scopeId): Promise<ExternalItem[]> {
    if (!config.repo) throw new Error('GitHub connection is missing config.repo (owner/name)')
    const res = await fetch(
      `${API_BASE}/repos/${config.repo}/issues?milestone=${scopeId}&state=all&per_page=100`,
      { headers: ghHeaders(auth) },
    )
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const batch = (await res.json()) as GitHubIssue[]
    return batch.filter((i) => !i.pull_request).map(mapIssue)
  },

  async fetchPullRequest(auth, config, prNumber): Promise<ExternalPrStatus | null> {
    if (!config.repo) throw new Error('GitHub connection is missing config.repo (owner/name)')
    const res = await fetch(`${API_BASE}/repos/${config.repo}/pulls/${prNumber}`, {
      headers: ghHeaders(auth),
    })
    if (res.status === 404) return null
    if (!res.ok) {
      throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    }
    const pr = (await res.json()) as { state: 'open' | 'closed'; draft?: boolean; merged_at: string | null }
    if (pr.merged_at) return 'merged'
    if (pr.state === 'closed') return 'closed'
    if (pr.draft) return 'draft'
    return 'open'
  },
}
