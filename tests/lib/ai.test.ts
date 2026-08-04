import { describe, it, expect } from 'vitest'
import { buildReleaseNotesPrompt, buildDesignNotePrompt } from '@/lib/ai'
import type { ReleaseDetail } from '@/lib/db/queries'

const release: ReleaseDetail = {
  id: 'rel-1',
  productId: 'prod-1',
  name: 'API v2.0.0',
  description: 'The big one',
  status: 'in_progress',
  tags: [],
  creatorId: 'user-1',
  createdAt: '2026-08-01T00:00:00.000Z',
  updatedAt: '2026-08-01T00:00:00.000Z',
  productName: 'Shared Product',
  productSlug: 'shared-product',
  planCount: 1,
  assets: [
    { assetId: 'a1', assetName: 'API Service', assetType: 'service', version: 'v2.0.0', notes: 'breaking' },
    { assetId: 'a2', assetName: 'Database', assetType: 'datastore' },
  ],
  workItemCounts: { feature: 1, bug: 1 },
  plans: [
    { planId: 'p1', title: 'Bulk export', status: 'completed', type: 'feature', taskCount: 4, completedTaskCount: 4 },
  ],
  workItems: [
    { id: 'w1', title: 'Bulk export endpoint', type: 'feature', status: 'resolved', severity: 'medium' },
    { id: 'w2', title: 'Timeouts on export', type: 'bug', status: 'resolved', severity: 'high' },
  ],
  assetPrChips: new Map(),
}

describe('buildReleaseNotesPrompt', () => {
  it('includes release identity, versions, plans, and work items', () => {
    const prompt = buildReleaseNotesPrompt(release)
    expect(prompt).toContain('API v2.0.0')
    expect(prompt).toContain('Shared Product')
    expect(prompt).toContain('API Service (service) → v2.0.0 — breaking')
    expect(prompt).toContain('- Database (datastore)')
    expect(prompt).toContain('[completed] Bulk export (4/4 tasks)')
    expect(prompt).toContain('[bug/high] Timeouts on export (resolved)')
  })

  it('states absences instead of omitting sections silently', () => {
    const empty = { ...release, assets: [], plans: [], workItems: [], description: '' }
    const prompt = buildReleaseNotesPrompt(empty)
    expect(prompt).toContain('No asset version stamps recorded.')
    expect(prompt).toContain('No plans attached.')
    expect(prompt).toContain('No linked work items.')
  })
})

describe('buildDesignNotePrompt', () => {
  it('carries asset, plan, and completed-task context', () => {
    const prompt = buildDesignNotePrompt({
      assetName: 'API Service',
      assetDescription: 'Main API',
      planTitle: 'Retry overhaul',
      planDescription: 'Move retries behind the outbox',
      taskTitles: ['Add outbox table', 'Route retries'],
    })
    expect(prompt).toContain('asset "API Service"')
    expect(prompt).toContain('code plan "Retry overhaul"')
    expect(prompt).toContain('- Add outbox table')
    expect(prompt).toContain('Move retries behind the outbox')
  })
})
