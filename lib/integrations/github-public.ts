// Read-only import of a public GitHub repository's issues (spec: External
// Intake & Triage §3.5). Needs no collaborator rights and never writes
// upstream: issues become external work items through importExternalWorkItems.
// Anonymous requests get 60/hour from GitHub; GITHUB_PUBLIC_TOKEN (any personal
// token, no scopes needed) raises that to 5,000.
import type { ImportItem } from '@/lib/db/intake'
import { IntakeError } from '@/lib/db/intake'

const API = 'https://api.github.com'
const EXCERPT = 4000
export const MAX_PUBLIC_ISSUES = 1000

type Issue = {
  number: number
  html_url: string
  title: string
  body: string | null
  state: string
  created_at: string
  user: { login: string } | null
  labels: (string | { name?: string })[]
  pull_request?: unknown
}

export function normalizeRepo(repo: string): string {
  const m = repo.trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/, '').replace(/\/+$/, '').match(/^([\w.-]+)\/([\w.-]+)$/)
  if (!m) throw new IntakeError(`Expected a repository as owner/name, got "${repo}"`)
  return `${m[1]}/${m[2]}`.toLowerCase()
}

export function issueToImport(repo: string, issue: Issue): ImportItem {
  const body = issue.body ?? ''
  const excerpt = body.length > EXCERPT ? `${body.slice(0, EXCERPT)}…\n\n[Full report on GitHub](${issue.html_url})` : body
  return {
    key: `${repo}#${issue.number}`,
    url: issue.html_url,
    title: issue.title,
    description: excerpt,
    state: issue.state,
    author: issue.user ? `@${issue.user.login}` : null,
    createdAt: issue.created_at,
    labels: issue.labels.map((l) => (typeof l === 'string' ? l : l.name ?? '')).filter(Boolean),
  }
}

export type PublicFetchOptions = { state?: 'open' | 'closed' | 'all'; since?: string; limit?: number }

/** Issues (not pull requests) from a public repo, newest first, up to `limit`. */
export async function fetchPublicIssues(repoInput: string, opts: PublicFetchOptions = {}, env = process.env) {
  const repo = normalizeRepo(repoInput)
  const limit = Math.min(Math.max(1, opts.limit ?? 300), MAX_PUBLIC_ISSUES)
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'CodePlans',
  }
  if (env.GITHUB_PUBLIC_TOKEN) headers.Authorization = `Bearer ${env.GITHUB_PUBLIC_TOKEN}`

  const items: ImportItem[] = []
  let rateRemaining: number | null = null
  for (let page = 1; items.length < limit && page <= 20; page++) {
    const params = new URLSearchParams({ state: opts.state ?? 'open', per_page: '100', page: String(page), sort: 'created', direction: 'desc' })
    if (opts.since) params.set('since', opts.since)
    const res = await fetch(`${API}/repos/${repo}/issues?${params}`, { headers })
    const remaining = res.headers.get('x-ratelimit-remaining')
    if (remaining !== null) rateRemaining = Number(remaining)
    if (res.status === 404) throw new IntakeError(`GitHub repository ${repo} was not found or is private`)
    if (res.status === 403 || res.status === 429) {
      const reset = Number(res.headers.get('x-ratelimit-reset'))
      const when = reset ? ` until ${new Date(reset * 1000).toISOString()}` : ''
      throw new IntakeError(`GitHub rate limit reached${when}. Set GITHUB_PUBLIC_TOKEN on the server to raise it.`)
    }
    if (!res.ok) throw new IntakeError(`GitHub API ${res.status}: ${(await res.text()).slice(0, 200)}`)
    const batch = (await res.json()) as Issue[]
    for (const issue of batch) {
      if (issue.pull_request) continue // the issues API also returns pull requests
      items.push(issueToImport(repo, issue))
      if (items.length >= limit) break
    }
    if (batch.length < 100) break
  }
  return { repo, items, rateRemaining }
}
