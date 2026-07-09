import type { Connector, ConnectorAuth, ExternalItem, ExternalScope, IntegrationConfig } from './types'

/**
 * Asana connector. config.repo = project gid. Auth token = a Personal Access
 * Token (bearer). Asana has no native item types — tag names map via the
 * connection's typeLabelMap (tags surface as labels).
 */

const API = 'https://app.asana.com/api/1.0'

function headers(auth: ConnectorAuth) {
  return { Authorization: `Bearer ${auth.token}`, Accept: 'application/json', 'Content-Type': 'application/json' }
}

type AsanaTask = {
  gid: string
  name: string
  notes?: string
  completed: boolean
  modified_at: string
  permalink_url?: string
  tags?: { name: string }[]
  assignee?: { name?: string; email?: string } | null
  memberships?: { section?: { name?: string } }[]
}

export function mapAsanaTask(t: AsanaTask): ExternalItem {
  // Section name gives in-progress signal on boards ("In Progress", "Doing").
  const section = t.memberships?.[0]?.section?.name?.toLowerCase() ?? ''
  const state = t.completed ? 'completed' : /progress|doing|review/.test(section) ? 'in_progress' : 'open'
  return {
    externalId: t.gid,
    externalUrl: t.permalink_url ?? `https://app.asana.com/0/0/${t.gid}`,
    title: t.name,
    description: t.notes ?? '',
    state,
    labels: (t.tags ?? []).map((x) => x.name),
    assigneeEmail: t.assignee?.email,
    assigneeName: t.assignee?.name ?? undefined,
    updatedAt: t.modified_at,
  }
}

const FIELDS = 'name,notes,completed,modified_at,permalink_url,tags.name,assignee.name,assignee.email,memberships.section.name'

async function listProjectTasks(auth: ConnectorAuth, projectGid: string, since?: Date): Promise<ExternalItem[]> {
  const items: ExternalItem[] = []
  let offset: string | undefined
  do {
    const url = new URL(`${API}/projects/${projectGid}/tasks`)
    url.searchParams.set('opt_fields', FIELDS)
    url.searchParams.set('limit', '100')
    if (since) url.searchParams.set('modified_since', since.toISOString())
    if (offset) url.searchParams.set('offset', offset)
    const res = await fetch(url, { headers: headers(auth) })
    if (!res.ok) throw new Error(`Asana API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const data = (await res.json()) as { data: AsanaTask[]; next_page?: { offset?: string } | null }
    for (const t of data.data) items.push(mapAsanaTask(t))
    offset = data.next_page?.offset
  } while (offset)
  return items
}

export const asanaConnector: Connector = {
  provider: 'asana',
  defaultStatusMap: {
    open: 'open',
    in_progress: 'in_progress',
    completed: 'resolved',
  },

  async listItems(auth, config, since) {
    return listProjectTasks(auth, config.repo!, since)
  },

  // Epic-like scope: sections in the project.
  async listScopes(auth, config): Promise<ExternalScope[]> {
    const res = await fetch(`${API}/projects/${config.repo}/sections?limit=100`, { headers: headers(auth) })
    if (!res.ok) throw new Error(`Asana API ${res.status}`)
    const data = (await res.json()) as { data: { gid: string; name: string }[] }
    return data.data.map((s) => ({ id: s.gid, title: s.name, state: 'open' }))
  },

  async listScopeItems(auth, config, scopeId) {
    const url = new URL(`${API}/sections/${scopeId}/tasks`)
    url.searchParams.set('opt_fields', FIELDS)
    url.searchParams.set('limit', '100')
    const res = await fetch(url, { headers: headers(auth) })
    if (!res.ok) throw new Error(`Asana API ${res.status}`)
    const data = (await res.json()) as { data: AsanaTask[] }
    return data.data.map(mapAsanaTask)
  },

  async postComment(auth, _config, externalId, body) {
    const res = await fetch(`${API}/tasks/${externalId}/stories`, {
      method: 'POST',
      headers: headers(auth),
      body: JSON.stringify({ data: { text: body } }),
    })
    if (!res.ok) throw new Error(`Asana comment failed: ${res.status}`)
  },
}
