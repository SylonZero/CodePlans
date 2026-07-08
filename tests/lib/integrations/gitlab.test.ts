import { describe, it, expect, afterEach, vi } from 'vitest'
import { gitlabConnector } from '@/lib/integrations/gitlab'

const auth = { token: 't' }
const config = { repo: 'acme/app' }

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(payload: unknown, status = 200) {
  const mock = vi.fn(async () => new Response(JSON.stringify(payload), { status }))
  vi.stubGlobal('fetch', mock)
  return mock
}

describe('gitlabConnector.listItems', () => {
  it('maps issues (iid, opened state, plain-string labels, assignee username)', async () => {
    const mock = stubFetch([
      {
        iid: 12,
        web_url: 'https://gitlab.com/acme/app/-/issues/12',
        title: 'Crash on save',
        description: 'stack trace',
        state: 'opened',
        labels: ['bug', 'backend'],
        assignee: { username: 'jdoe' },
        updated_at: '2026-07-01T10:00:00Z',
      },
    ])

    const items = await gitlabConnector.listItems(auth, config)
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({
      externalId: '12',
      externalKey: '#12',
      title: 'Crash on save',
      state: 'opened',
      labels: ['bug', 'backend'],
      assigneeName: 'jdoe',
    })

    // Project path is URL-encoded; token sent via PRIVATE-TOKEN header
    const [url, init] = mock.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/v4/projects/acme%2Fapp/issues')
    expect((init.headers as Record<string, string>)['PRIVATE-TOKEN']).toBe('t')
  })

  it('default status map: opened → open, closed → resolved', () => {
    expect(gitlabConnector.defaultStatusMap.opened).toBe('open')
    expect(gitlabConnector.defaultStatusMap.closed).toBe('resolved')
  })

  it('throws with API status on failure', async () => {
    stubFetch('forbidden', 403)
    await expect(gitlabConnector.listItems(auth, config)).rejects.toThrow('GitLab API 403')
  })
})

describe('gitlabConnector.listScopes', () => {
  it('uses the milestone title as scope id and normalizes active → open', async () => {
    stubFetch([
      { title: 'v1.0', state: 'active', web_url: 'https://gitlab.com/acme/app/-/milestones/1' },
      { title: 'v0.9', state: 'closed', web_url: 'https://gitlab.com/acme/app/-/milestones/2' },
    ])
    const scopes = await gitlabConnector.listScopes!(auth, config)
    expect(scopes[0]).toEqual({
      id: 'v1.0',
      title: 'v1.0',
      state: 'open',
      url: 'https://gitlab.com/acme/app/-/milestones/1',
    })
    expect(scopes[1].state).toBe('closed')
  })
})

describe('gitlabConnector.listScopeItems', () => {
  it('filters issues by milestone title', async () => {
    const mock = stubFetch([])
    await gitlabConnector.listScopeItems!(auth, config, 'v1.0 beta')
    const [url] = mock.mock.calls[0] as [string]
    expect(url).toContain('milestone=v1.0+beta')
  })
})

describe('gitlabConnector.fetchPullRequest', () => {
  it.each([
    [{ state: 'merged' }, 'merged'],
    [{ state: 'closed' }, 'closed'],
    [{ state: 'opened', draft: true }, 'draft'],
    [{ state: 'opened' }, 'open'],
  ])('maps MR %j to %s', async (payload, expected) => {
    stubFetch(payload)
    expect(await gitlabConnector.fetchPullRequest!(auth, config, '7')).toBe(expected)
  })

  it('returns null for 404', async () => {
    stubFetch('not found', 404)
    expect(await gitlabConnector.fetchPullRequest!(auth, config, '7')).toBeNull()
  })
})

describe('gitlabConnector.matchPrUrl', () => {
  it('matches gitlab.com MR URLs for the connection repo', () => {
    expect(
      gitlabConnector.matchPrUrl!(config, 'https://gitlab.com/acme/app/-/merge_requests/42'),
    ).toBe('42')
    expect(
      gitlabConnector.matchPrUrl!(config, 'https://gitlab.com/acme/app/-/merge_requests/42/diffs'),
    ).toBe('42')
  })

  it('respects a self-hosted baseUrl', () => {
    const selfHosted = { repo: 'team/svc', baseUrl: 'https://git.example.com' }
    expect(
      gitlabConnector.matchPrUrl!(selfHosted, 'https://git.example.com/team/svc/-/merge_requests/9'),
    ).toBe('9')
    expect(
      gitlabConnector.matchPrUrl!(selfHosted, 'https://gitlab.com/team/svc/-/merge_requests/9'),
    ).toBeNull()
  })

  it('ignores other repos and GitHub-style URLs', () => {
    expect(
      gitlabConnector.matchPrUrl!(config, 'https://gitlab.com/other/repo/-/merge_requests/1'),
    ).toBeNull()
    expect(gitlabConnector.matchPrUrl!(config, 'https://github.com/acme/app/pull/1')).toBeNull()
  })

  it('supports nested group paths', () => {
    const nested = { repo: 'group/subgroup/project' }
    expect(
      gitlabConnector.matchPrUrl!(nested, 'https://gitlab.com/group/subgroup/project/-/merge_requests/3'),
    ).toBe('3')
  })
})
