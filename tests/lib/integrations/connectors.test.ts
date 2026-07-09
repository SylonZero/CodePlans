import { describe, it, expect } from 'vitest'
import { mapJiraIssue, jiraConnector } from '@/lib/integrations/jira'
import { mapAsanaTask, asanaConnector } from '@/lib/integrations/asana'
import { mapLinearIssue, linearConnector } from '@/lib/integrations/linear'
import { getConnector } from '@/lib/integrations/registry'

describe('connector registry', () => {
  it('resolves all five providers', () => {
    for (const p of ['github', 'gitlab', 'jira', 'asana', 'linear']) {
      expect(getConnector(p)?.provider).toBe(p)
    }
  })
})

describe('jira mapping', () => {
  const issue = {
    id: '10001',
    key: 'ENG-42',
    fields: {
      summary: 'Fix login',
      description: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'It breaks.' }] }] },
      updated: '2026-07-01T00:00:00.000Z',
      labels: ['auth'],
      status: { name: 'In Review', statusCategory: { key: 'indeterminate' } },
      issuetype: { name: 'Bug' },
      assignee: { emailAddress: 'a@b.co', displayName: 'Al' },
    },
  }
  it('maps status category, ADF description, and issue type as label', () => {
    const item = mapJiraIssue(issue as never, 'https://x.atlassian.net')
    expect(item.state).toBe('in_progress')
    expect(item.description).toBe('It breaks.')
    expect(item.labels).toEqual(['auth', 'bug'])
    expect(item.externalUrl).toBe('https://x.atlassian.net/browse/ENG-42')
    expect(jiraConnector.defaultStatusMap[item.state]).toBe('in_progress')
  })
})

describe('asana mapping', () => {
  it('derives state from completed flag and section name', () => {
    const base = { gid: '1', name: 'T', modified_at: '2026-07-01T00:00:00.000Z' }
    expect(mapAsanaTask({ ...base, completed: true } as never).state).toBe('completed')
    expect(mapAsanaTask({ ...base, completed: false, memberships: [{ section: { name: 'In Progress' } }] } as never).state).toBe('in_progress')
    expect(mapAsanaTask({ ...base, completed: false } as never).state).toBe('open')
    expect(asanaConnector.defaultStatusMap.completed).toBe('resolved')
  })
})

describe('linear mapping', () => {
  it('maps workflow state types through the default status map', () => {
    const issue = {
      id: 'abc', identifier: 'ENG-7', title: 'T', url: 'https://linear.app/x/issue/ENG-7',
      updatedAt: '2026-07-01T00:00:00.000Z', state: { type: 'started' }, labels: { nodes: [{ name: 'tech-debt' }] },
    }
    const item = mapLinearIssue(issue as never)
    expect(item.externalKey).toBe('ENG-7')
    expect(linearConnector.defaultStatusMap[item.state]).toBe('in_progress')
    expect(linearConnector.defaultStatusMap.canceled).toBe('wont_do')
  })
})
