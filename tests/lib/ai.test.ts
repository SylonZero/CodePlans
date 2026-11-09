import { afterEach, beforeEach, describe, it, expect, vi } from 'vitest'
import { buildReleaseNotesPrompt, buildDesignNotePrompt } from '@/lib/ai'
import type { ReleaseDetail } from '@/lib/db/queries'

const sdk = vi.hoisted(() => ({
  anthropicClient: vi.fn(),
  anthropicCreate: vi.fn(),
  openaiClient: vi.fn(),
  openaiCreate: vi.fn(),
}))

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    constructor() { sdk.anthropicClient() }
    messages = { create: sdk.anthropicCreate }
  },
}))

vi.mock('openai', () => ({
  default: class {
    constructor() { sdk.openaiClient() }
    responses = { create: sdk.openaiCreate }
  },
}))

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
  createdById: null,
  createdByKind: null,
  updatedById: null,
  updatedByKind: null,
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

function anthropicResponse(text: string) {
  return { stop_reason: 'end_turn', content: [{ type: 'text', text }] }
}

function openaiResponse(text: string) {
  return {
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
    output_text: text,
  }
}

describe('AI drafting', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.stubEnv('AI_PROVIDER', 'anthropic')
    vi.stubEnv('AI_MODEL', 'test-model')
    vi.stubEnv('AI_ENABLED', undefined)
    // Both credentials exist to check that only the selected provider is used.
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('OPENAI_API_KEY', 'test-openai-key')
    sdk.anthropicCreate.mockResolvedValue(anthropicResponse('  Draft notes  '))
    sdk.openaiCreate.mockResolvedValue(openaiResponse('  Draft notes  '))
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('keeps Anthropic as the default and forwards the existing prompt and token limit', async () => {
    vi.stubEnv('AI_PROVIDER', undefined)
    vi.stubEnv('AI_MODEL', undefined)
    const ai = await import('@/lib/ai')
    expect(await ai.draftReleaseNotes(release)).toBe('Draft notes')
    expect(sdk.anthropicCreate).toHaveBeenCalledWith({
      model: 'claude-opus-5',
      max_tokens: 16000,
      system: expect.stringContaining('Keep it under 300 words.'),
      messages: [{ role: 'user', content: ai.buildReleaseNotesPrompt(release) }],
    })
    expect(sdk.openaiClient).not.toHaveBeenCalled()
  })

  it('uses OpenAI Responses with the same prompt, an explicit model, and no response storage', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    const ai = await import('@/lib/ai')
    expect(await ai.draftReleaseNotes(release)).toBe('Draft notes')
    expect(sdk.openaiCreate).toHaveBeenCalledWith({
      model: 'test-model',
      max_output_tokens: 16000,
      instructions: expect.stringContaining('Keep it under 300 words.'),
      input: ai.buildReleaseNotesPrompt(release),
      store: false,
    })
    expect(sdk.anthropicClient).not.toHaveBeenCalled()
  })

  it('combines Anthropic text blocks while ignoring non-text output', async () => {
    sdk.anthropicCreate.mockResolvedValue({
      stop_reason: 'end_turn',
      content: [
        { type: 'thinking', thinking: 'Internal reasoning' },
        { type: 'text', text: 'First ' },
        { type: 'text', text: 'second' },
      ],
    })
    const ai = await import('@/lib/ai')
    expect(await ai.draftReleaseNotes(release)).toBe('First second')
  })

  it.each([undefined, '', '   '])('disables OpenAI drafting without a model (%j) before creating a client', async (model) => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('AI_MODEL', model)
    const ai = await import('@/lib/ai')
    expect(ai.aiEnabled()).toBe(false)
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('AI drafting is not enabled')
    expect(sdk.anthropicClient).not.toHaveBeenCalled()
    expect(sdk.openaiClient).not.toHaveBeenCalled()
  })

  it('does not call either provider when the configured provider is unrecognised', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.stubEnv('AI_PROVIDER', 'unsupported-provider')
    const ai = await import('@/lib/ai')
    expect(ai.aiEnabled()).toBe(false)
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('AI drafting is not enabled')
    expect(sdk.anthropicClient).not.toHaveBeenCalled()
    expect(sdk.openaiClient).not.toHaveBeenCalled()
  })

  describe.each(['anthropic', 'openai'] as const)('%s', (provider) => {
    beforeEach(() => vi.stubEnv('AI_PROVIDER', provider))

    const create = provider === 'openai' ? sdk.openaiCreate : sdk.anthropicCreate
    const response = provider === 'openai' ? openaiResponse : anthropicResponse

    it('does not construct a client when AI is disabled', async () => {
      vi.stubEnv('AI_ENABLED', 'false')
      const ai = await import('@/lib/ai')
      expect(ai.aiEnabled()).toBe(false)
      await expect(ai.draftReleaseNotes(release)).rejects.toThrow('AI drafting is not enabled')
      expect(sdk.anthropicClient).not.toHaveBeenCalled()
      expect(sdk.openaiClient).not.toHaveBeenCalled()
    })

    it('does not fall back to another provider when its key is missing', async () => {
      vi.stubEnv(provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY', undefined)
      const ai = await import('@/lib/ai')
      expect(ai.aiEnabled()).toBe(false)
      await expect(ai.draftReleaseNotes(release)).rejects.toThrow('AI drafting is not enabled')
      expect(sdk.anthropicClient).not.toHaveBeenCalled()
      expect(sdk.openaiClient).not.toHaveBeenCalled()
    })

    it('rejects an empty draft', async () => {
      create.mockResolvedValue(response(' \n '))
      const ai = await import('@/lib/ai')
      await expect(ai.draftReleaseNotes(release)).rejects.toThrow('The model returned an empty draft.')
    })

    it.each(['Authentication failed', 'Rate limit exceeded', 'Connection failed'])(
      'surfaces request errors: %s',
      async (message) => {
        create.mockRejectedValue(new Error(message))
        const ai = await import('@/lib/ai')
        await expect(ai.draftReleaseNotes(release)).rejects.toThrow(message)
      },
    )

    it('parses a design note and sends the existing design instructions', async () => {
      create.mockResolvedValue(response('## Queue-backed retries\n\nRetries now run behind the queue.'))
      const ai = await import('@/lib/ai')
      const input = {
        assetName: 'API Service', planTitle: 'Retry overhaul', taskTitles: ['Add queue'],
      }
      expect(await ai.draftDesignNote(input)).toEqual({
        title: 'Queue-backed retries', body: 'Retries now run behind the queue.',
      })
      const request = create.mock.calls[0][0]
      expect(provider === 'openai' ? request.instructions : request.system).toContain('Under 150 words total.')
      expect(provider === 'openai' ? request.input : request.messages[0].content)
        .toBe(ai.buildDesignNotePrompt(input))
    })

    it('preserves the design note fallback when only one line is returned', async () => {
      create.mockResolvedValue(response('Queue-backed retries'))
      const ai = await import('@/lib/ai')
      expect(await ai.draftDesignNote({ assetName: 'API', planTitle: 'Retries', taskTitles: [] }))
        .toEqual({ title: 'Queue-backed retries', body: 'Queue-backed retries' })
    })
  })

  it('rejects an Anthropic refusal', async () => {
    sdk.anthropicCreate.mockResolvedValue({ ...anthropicResponse('Refused'), stop_reason: 'refusal' })
    const ai = await import('@/lib/ai')
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('The model declined to draft this content.')
  })

  it('rejects truncated Anthropic output', async () => {
    sdk.anthropicCreate.mockResolvedValue({ ...anthropicResponse('Partial'), stop_reason: 'max_tokens' })
    const ai = await import('@/lib/ai')
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('output token limit')
  })

  it('finds OpenAI refusals after other output items and content blocks', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    sdk.openaiCreate.mockResolvedValue({
      ...openaiResponse('Partial'),
      output: [
        { type: 'reasoning', summary: [] },
        { type: 'message', content: [
          { type: 'output_text', text: 'Partial' },
          { type: 'refusal', refusal: 'Cannot draft this' },
        ] },
      ],
    })
    const ai = await import('@/lib/ai')
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('The model declined to draft this content.')
  })

  it('rejects truncated OpenAI output even when partial text is present', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    sdk.openaiCreate.mockResolvedValue({
      ...openaiResponse('Partial'), status: 'incomplete', incomplete_details: { reason: 'max_output_tokens' },
    })
    const ai = await import('@/lib/ai')
    await expect(ai.draftReleaseNotes(release)).rejects.toThrow('output token limit')
  })

  it.each(['failed', 'incomplete', 'cancelled', 'queued', 'in_progress'])(
    'rejects OpenAI output with status %s',
    async (status) => {
      vi.stubEnv('AI_PROVIDER', 'openai')
      sdk.openaiCreate.mockResolvedValue({ ...openaiResponse('Partial'), status })
      const ai = await import('@/lib/ai')
      await expect(ai.draftReleaseNotes(release)).rejects.toThrow('The model did not complete the draft.')
    },
  )
})
