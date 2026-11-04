import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

describe('AI configuration', () => {
  beforeEach(() => {
    vi.resetModules()
    for (const name of ['AI_PROVIDER', 'AI_MODEL', 'AI_ENABLED', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY']) {
      vi.stubEnv(name, undefined)
    }
  })

  afterEach(() => vi.unstubAllEnvs())

  it('defaults to Anthropic with drafting disabled when no key is configured', async () => {
    const { config } = await import('@/lib/config')
    expect(config.ai).toEqual({ provider: 'anthropic', enabled: false, model: 'claude-opus-5' })
  })

  it('preserves the existing Anthropic setup', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    const { config } = await import('@/lib/config')
    expect(config.ai).toEqual({ provider: 'anthropic', enabled: true, model: 'claude-opus-5' })
  })

  it('does not select OpenAI implicitly when its key is present', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    const { config } = await import('@/lib/config')
    expect(config.ai.provider).toBe('anthropic')
    expect(config.ai.enabled).toBe(false)
  })

  it('enables OpenAI using only its own key and the configured model', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    vi.stubEnv('OPENAI_API_KEY', 'test-key')
    vi.stubEnv('AI_MODEL', ' chosen-openai-model ')
    const { config } = await import('@/lib/config')
    expect(config.ai).toEqual({ provider: 'openai', enabled: true, model: 'chosen-openai-model' })
  })

  it('never supplies the Claude default to OpenAI', async () => {
    vi.stubEnv('AI_PROVIDER', 'openai')
    const { config } = await import('@/lib/config')
    expect(config.ai.model).toBe('')
  })

  describe.each(['anthropic', 'openai'] as const)('%s', (provider) => {
    beforeEach(() => vi.stubEnv('AI_PROVIDER', provider))
    const keyName = provider === 'openai' ? 'OPENAI_API_KEY' : 'ANTHROPIC_API_KEY'
    const otherKey = provider === 'openai' ? 'ANTHROPIC_API_KEY' : 'OPENAI_API_KEY'

    it('stays disabled when only the other provider has a key', async () => {
      vi.stubEnv(otherKey, 'other-key')
      const { config } = await import('@/lib/config')
      expect(config.ai.enabled).toBe(false)
    })

    it.each(['', '   '])('treats an empty key (%j) as unconfigured', async (key) => {
      vi.stubEnv(keyName, key)
      const { config } = await import('@/lib/config')
      expect(config.ai.enabled).toBe(false)
    })

    it('respects AI_ENABLED=false even with a key', async () => {
      vi.stubEnv(keyName, 'test-key')
      vi.stubEnv('AI_ENABLED', 'false')
      const { config } = await import('@/lib/config')
      expect(config.ai.enabled).toBe(false)
    })

    it('respects an explicit model override', async () => {
      vi.stubEnv('AI_MODEL', 'custom-model')
      const { config } = await import('@/lib/config')
      expect(config.ai.model).toBe('custom-model')
    })
  })

  it('reports invalid provider configuration without including its value', async () => {
    vi.stubEnv('AI_PROVIDER', 'unsupported-provider')
    await expect(import('@/lib/config')).rejects.toThrow('AI_PROVIDER must be "anthropic" or "openai".')
  })
})
