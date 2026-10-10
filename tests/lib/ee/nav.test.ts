import { describe, it, expect } from 'vitest'
import { isExternalNavHref } from '@/lib/ee/nav'

describe('isExternalNavHref', () => {
  it('treats absolute http(s) URLs as external', () => {
    expect(isExternalNavHref('https://billing.example.com/portal')).toBe(true)
    expect(isExternalNavHref('HTTP://example.com')).toBe(true)
  })

  it('keeps in-app paths internal', () => {
    expect(isExternalNavHref('/audit-log')).toBe(false)
    expect(isExternalNavHref('/settings?tab=billing')).toBe(false)
  })

  it('does not treat other schemes or protocol-relative URLs as external links', () => {
    expect(isExternalNavHref('javascript:alert(1)')).toBe(false)
    expect(isExternalNavHref('//example.com')).toBe(false)
  })
})
