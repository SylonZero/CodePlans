import type { Connector, ConnectorAuth, ExternalItem, IntegrationConfig } from './types'

const API_BASE = 'https://api.github.com'

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
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${auth.token}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
      })
      if (!res.ok) {
        throw new Error(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
      }

      const batch = (await res.json()) as GitHubIssue[]
      for (const issue of batch) {
        if (issue.pull_request) continue // the issues API also returns PRs
        items.push({
          externalId: String(issue.number),
          externalKey: `#${issue.number}`,
          externalUrl: issue.html_url,
          title: issue.title,
          description: issue.body ?? '',
          state: issue.state,
          labels: issue.labels
            .map((l) => (typeof l === 'string' ? l : l.name ?? ''))
            .filter(Boolean),
          assigneeName: issue.assignee?.login,
          updatedAt: issue.updated_at,
        })
      }

      if (batch.length < 100) break
      page += 1
    }

    return items
  },
}
