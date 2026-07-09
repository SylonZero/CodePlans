import type { Connector, ConnectorAuth, ExternalItem, ExternalScope, IntegrationConfig } from './types'

/**
 * Jira Cloud connector (REST v3). config.baseUrl = https://your-site.atlassian.net,
 * config.repo = project key (e.g. "ENG"). Auth token format: "email:api_token"
 * (basic auth pair in one secret).
 */

function headers(auth: ConnectorAuth) {
  return {
    Authorization: `Basic ${Buffer.from(auth.token).toString('base64')}`,
    Accept: 'application/json',
    'Content-Type': 'application/json',
  }
}

function site(config: IntegrationConfig): string {
  return (config.baseUrl ?? '').replace(/\/$/, '')
}

type JiraIssue = {
  id: string
  key: string
  fields: {
    summary: string
    description?: { content?: unknown[] } | string | null
    updated: string
    labels?: string[]
    status?: { name?: string; statusCategory?: { key?: string } }
    issuetype?: { name?: string }
    assignee?: { emailAddress?: string; displayName?: string } | null
  }
}

/** Flatten Atlassian Document Format to plain text (best effort). */
function adfToText(node: unknown): string {
  if (!node) return ''
  if (typeof node === 'string') return node
  const n = node as { type?: string; text?: string; content?: unknown[] }
  if (n.text) return n.text
  const inner = (n.content ?? []).map(adfToText).join(n.type === 'paragraph' ? '' : '\n')
  return n.type === 'paragraph' ? inner + '\n' : inner
}

export function mapJiraIssue(issue: JiraIssue, siteUrl: string): ExternalItem {
  const f = issue.fields
  // Prefer the language-neutral status category; fall back to the raw name.
  const category = f.status?.statusCategory?.key // new | indeterminate | done
  const state = category === 'new' ? 'open' : category === 'indeterminate' ? 'in_progress' : category === 'done' ? 'done' : (f.status?.name ?? 'open')
  const labels = [...(f.labels ?? [])]
  if (f.issuetype?.name) labels.push(f.issuetype.name.toLowerCase())
  return {
    externalId: issue.id,
    externalKey: issue.key,
    externalUrl: `${siteUrl}/browse/${issue.key}`,
    title: f.summary,
    description: typeof f.description === 'string' ? f.description : adfToText(f.description).trim(),
    state,
    labels,
    assigneeEmail: f.assignee?.emailAddress,
    assigneeName: f.assignee?.displayName,
    updatedAt: f.updated,
  }
}

async function searchIssues(auth: ConnectorAuth, config: IntegrationConfig, jql: string): Promise<ExternalItem[]> {
  const base = site(config)
  const items: ExternalItem[] = []
  let nextPageToken: string | undefined
  do {
    const url = new URL(`${base}/rest/api/3/search/jql`)
    url.searchParams.set('jql', jql)
    url.searchParams.set('maxResults', '100')
    url.searchParams.set('fields', 'summary,description,updated,labels,status,issuetype,assignee')
    if (nextPageToken) url.searchParams.set('nextPageToken', nextPageToken)
    const res = await fetch(url, { headers: headers(auth) })
    if (!res.ok) throw new Error(`Jira API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { issues?: JiraIssue[]; nextPageToken?: string; isLast?: boolean }
    for (const issue of data.issues ?? []) items.push(mapJiraIssue(issue, base))
    nextPageToken = data.isLast ? undefined : data.nextPageToken
  } while (nextPageToken)
  return items
}

export const jiraConnector: Connector = {
  provider: 'jira',
  defaultStatusMap: {
    open: 'open',
    in_progress: 'in_progress',
    done: 'resolved',
  },

  async listItems(auth, config, since) {
    let jql = `project = "${config.repo}" ORDER BY updated DESC`
    if (since) jql = `project = "${config.repo}" AND updated >= "${since.toISOString().slice(0, 16).replace('T', ' ')}" ORDER BY updated DESC`
    return searchIssues(auth, config, jql)
  },

  // Epic-like scope: Jira epics in the project.
  async listScopes(auth, config): Promise<ExternalScope[]> {
    const base = site(config)
    const items = await searchIssues(auth, config, `project = "${config.repo}" AND issuetype = Epic ORDER BY updated DESC`)
    return items.map((e) => ({ id: e.externalKey ?? e.externalId, title: e.title, state: e.state, url: `${base}/browse/${e.externalKey}` }))
  },

  async listScopeItems(auth, config, scopeId) {
    return searchIssues(auth, config, `parent = "${scopeId}" ORDER BY updated DESC`)
  },

  async postComment(auth, config, externalId, body) {
    const res = await fetch(`${site(config)}/rest/api/3/issue/${externalId}/comment`, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({
        body: { type: 'doc', version: 1, content: [{ type: 'paragraph', content: [{ type: 'text', text: body }] }] },
      }),
    })
    if (!res.ok) throw new Error(`Jira comment failed: ${res.status}`)
  },
}
