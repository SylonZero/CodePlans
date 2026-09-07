import { describe, it, expect, vi, beforeEach } from 'vitest'
const mocks = vi.hoisted(() => ({ connections: vi.fn(), fetchFile: vi.fn() }))
vi.mock('@/lib/db', () => ({ db: { query: { integrations: { findMany: mocks.connections } } } }))
vi.mock('@/lib/integrations/registry', () => ({ getConnector: () => ({ fetchFile: mocks.fetchFile }) }))
vi.mock('@/lib/integrations/secrets', () => ({ resolveConnectionToken: () => 'test-token' }))
import { fetchSpecMarkdown } from '@/lib/specs'
beforeEach(() => { vi.clearAllMocks(); mocks.connections.mockResolvedValue([]); mocks.fetchFile.mockResolvedValue(null) })

describe('spec git import fetching', () => {
  it('resolves slash-containing branch names without treating branch segments as folders', async () => {
    mocks.connections.mockResolvedValue([{ provider: 'gitlab', config: { repo: 'team/server', baseUrl: 'https://gitlab.example.com' } }])
    mocks.fetchFile.mockImplementation(async (_auth, _config, path, ref) => ref === 'sai/feat/quotas' && path === 'docs/specs/schema.md' ? '# Correct branch' : null)
    expect(await fetchSpecMarkdown('https://gitlab.example.com/team/server/-/blob/sai/feat/quotas/docs/specs/schema.md', 'org')).toBe('# Correct branch')
    expect(mocks.fetchFile).toHaveBeenCalledWith({ token: 'test-token' }, expect.anything(), 'docs/specs/schema.md', 'sai/feat/quotas')
  })
  it('uses exact host matching for credentials and handles malformed URLs without fetches', async () => {
    mocks.connections.mockResolvedValue([{ provider: 'gitlab', config: { repo: 'team/server', baseUrl: 'https://gitlab.example.com.evil.test' } }])
    expect(await fetchSpecMarkdown('https://gitlab.example.com/team/server/-/blob/main/docs/schema.md', 'org')).toBeNull()
    expect(await fetchSpecMarkdown('https://gitlab.example.com/team/server/docs/schema.md', 'org')).toBeNull()
    expect(mocks.fetchFile).not.toHaveBeenCalled()
  })
  it('imports publicly reachable GitLab content without a connection', async () => {
    mocks.fetchFile.mockImplementation(async (_auth, _config, path, ref) => ref === 'main' && path === 'docs/schema.md' ? '# Public' : null)
    expect(await fetchSpecMarkdown('https://gitlab.com/team/server/-/blob/main/docs/schema.md', null)).toBe('# Public')
  })
})
