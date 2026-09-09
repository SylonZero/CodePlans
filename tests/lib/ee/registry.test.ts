import { describe, it, expect, afterEach } from 'vitest'
import { getEnterpriseHooks, registerEnterpriseHooks, resetEnterpriseHooks } from '@/lib/ee/registry'

afterEach(() => {
  resetEnterpriseHooks()
})

describe('enterprise hook registry', () => {
  it('defaults every hook to a no-op', () => {
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('lets registered overrides replace individual hooks', () => {
    const FakeIcon = () => null
    registerEnterpriseHooks({
      navItems: () => [{ id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: FakeIcon }],
    })

    expect(getEnterpriseHooks().navItems()).toEqual([
      { id: 'audit-log', name: 'Audit Log', href: '/audit-log', icon: FakeIcon },
    ])
  })

  it('falls back to the no-op default for hooks a partial override omits', () => {
    registerEnterpriseHooks({})
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })

  it('resetEnterpriseHooks restores the no-op defaults', () => {
    registerEnterpriseHooks({ navItems: () => [{ id: 'x', name: 'X', href: '/x', icon: () => null }] })
    resetEnterpriseHooks()
    expect(getEnterpriseHooks().navItems()).toEqual([])
  })
})
