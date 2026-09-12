import { describe, it, expect, afterEach, vi } from 'vitest'
import { getEnterpriseHooks, registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

afterEach(() => {
  resetEnterpriseHooks()
})

describe('enterprise hook registry', () => {
  it('defaults every hook to a no-op', () => {
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('lets registered overrides replace individual hooks', () => {
    registerEnterpriseHooks({
      navItems: () => [{ id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: 'ShieldCheck' }],
    })

    expect(getEnterpriseHooks().navItems()).toEqual([
      { id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: 'ShieldCheck' },
    ])
  })

  it('falls back to the no-op default for hooks a partial override omits', () => {
    registerEnterpriseHooks({})
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('resetEnterpriseHooks restores the no-op defaults', () => {
    registerEnterpriseHooks({ navItems: () => [{ id: 'x', name: 'X', href: '/x', icon: 'Boxes' }] })
    resetEnterpriseHooks()
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('is shared across independent module instances (survives bundle duplication)', async () => {
    // Regression test for the registry-isolation bug: Next.js compiles
    // instrumentation.ts and the SSR/app bundles into separate chunks, each
    // evaluating this module's top-level code independently. Simulate that
    // by resetting the module registry and re-importing fresh — a plain
    // module-scope variable would NOT see the earlier registration; the
    // globalThis-backed registry does, since globalThis is one object
    // shared by the whole process regardless of how many separate copies
    // of this module get evaluated.
    vi.resetModules()
    const instanceA = await import('@/lib/ee/registry')
    instanceA.registerEnterpriseHooks({
      navItems: () => [{ id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: 'ShieldCheck' }],
    })

    vi.resetModules()
    const instanceB = await import('@/lib/ee/registry')

    expect(instanceB.getEnterpriseHooks().navItems()).toEqual([
      { id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: 'ShieldCheck' },
    ])

    instanceB.resetEnterpriseHooks()
  })
})
