import type { Connector, ConnectorAuth, ExternalItem, ExternalScope, IntegrationConfig } from './types'

/**
 * Linear connector (GraphQL). config.repo = team key (e.g. "ENG").
 * Auth token = a Linear API key (sent as-is in the Authorization header).
 */

const API = 'https://api.linear.app/graphql'

async function gql<T>(auth: ConnectorAuth, query: string, variables: Record<string, unknown>): Promise<T> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { Authorization: auth.token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (!res.ok) throw new Error(`Linear API ${res.status}: ${(await res.text()).slice(0, 200)}`)
  const data = (await res.json()) as { data?: T; errors?: { message: string }[] }
  if (data.errors?.length) throw new Error(`Linear API: ${data.errors[0].message}`)
  return data.data as T
}

type LinearIssue = {
  id: string
  identifier: string
  title: string
  description?: string | null
  url: string
  updatedAt: string
  state: { type: string } // triage|backlog|unstarted|started|completed|canceled
  labels: { nodes: { name: string }[] }
  assignee?: { name?: string; email?: string } | null
}

export function mapLinearIssue(i: LinearIssue): ExternalItem {
  return {
    externalId: i.id,
    externalKey: i.identifier,
    externalUrl: i.url,
    title: i.title,
    description: i.description ?? '',
    state: i.state.type,
    labels: i.labels.nodes.map((l) => l.name),
    assigneeEmail: i.assignee?.email,
    assigneeName: i.assignee?.name,
    updatedAt: i.updatedAt,
  }
}

const ISSUE_FIELDS = `
  id identifier title description url updatedAt
  state { type }
  labels { nodes { name } }
  assignee { name email }`

async function listIssues(auth: ConnectorAuth, filter: Record<string, unknown>): Promise<ExternalItem[]> {
  const items: ExternalItem[] = []
  let after: string | null = null
  do {
    const data: {
      issues: { nodes: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } }
    } = await gql(auth, `query($filter: IssueFilter, $after: String) {
      issues(filter: $filter, first: 100, after: $after, includeArchived: false) {
        nodes { ${ISSUE_FIELDS} }
        pageInfo { hasNextPage endCursor }
      }
    }`, { filter, after })
    for (const i of data.issues.nodes) items.push(mapLinearIssue(i))
    after = data.issues.pageInfo.hasNextPage ? data.issues.pageInfo.endCursor : null
  } while (after)
  return items
}

export const linearConnector: Connector = {
  provider: 'linear',
  defaultStatusMap: {
    triage: 'open',
    backlog: 'open',
    unstarted: 'planned',
    started: 'in_progress',
    completed: 'resolved',
    canceled: 'wont_do',
  },

  async listItems(auth, config, since) {
    const filter: Record<string, unknown> = { team: { key: { eq: config.repo } } }
    if (since) filter.updatedAt = { gt: since.toISOString() }
    return listIssues(auth, filter)
  },

  // Epic-like scope: Linear projects the team participates in.
  async listScopes(auth, config): Promise<ExternalScope[]> {
    const data: {
      projects: { nodes: { id: string; name: string; state: string; url: string }[] }
    } = await gql(auth, `query($teamKey: String!) {
      projects(filter: { accessibleTeams: { some: { key: { eq: $teamKey } } } }, first: 100) {
        nodes { id name state url }
      }
    }`, { teamKey: config.repo })
    return data.projects.nodes.map((p) => ({ id: p.id, title: p.name, state: p.state, url: p.url }))
  },

  async listScopeItems(auth, _config, scopeId) {
    return listIssues(auth, { project: { id: { eq: scopeId } } })
  },

  async postComment(auth, _config, externalId, body) {
    await gql(auth, `mutation($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) { success }
    }`, { issueId: externalId, body })
  },
}
