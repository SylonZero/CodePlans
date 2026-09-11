import { describe, it, expect, beforeEach, afterAll, vi } from 'vitest'

describe('loadEnterpriseModule', () => {
  const originalEnv = process.env.ENTERPRISE_ENABLED

  beforeEach(() => {
    vi.resetModules()
    delete process.env.ENTERPRISE_ENABLED
  })

  afterAll(() => {
    if (originalEnv === undefined) delete process.env.ENTERPRISE_ENABLED
    else process.env.ENTERPRISE_ENABLED = originalEnv
  })

  it('is a no-op when ENTERPRISE_ENABLED is not set', async () => {
    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    const { getEnterpriseHooks } = await import('@/lib/ee/registry')

    await loadEnterpriseModule()

    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('warns but never throws when ENTERPRISE_ENABLED=true and the package is not installed', async () => {
    process.env.ENTERPRISE_ENABLED = 'true'
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const { loadEnterpriseModule } = await import('@/lib/ee/load')
    await expect(loadEnterpriseModule()).resolves.toBeUndefined()

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('@codeplans/enterprise'),
      expect.anything()
    )
    warnSpy.mockRestore()
  })
})
