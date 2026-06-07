import { describe, it, expect } from 'vitest'
import { cn, formatDate, formatDateShort, formatRelativeTime, formatMonthYear } from '@/lib/utils'

describe('cn', () => {
  it('merges class names', () => {
    expect(cn('foo', 'bar')).toBe('foo bar')
  })

  it('handles conditional classes', () => {
    expect(cn('foo', false && 'bar', 'baz')).toBe('foo baz')
  })

  it('deduplicates conflicting tailwind classes', () => {
    expect(cn('px-2', 'px-4')).toBe('px-4')
  })

  it('handles undefined and null', () => {
    expect(cn('foo', undefined, null, 'bar')).toBe('foo bar')
  })
})

describe('formatDate', () => {
  it('formats a Date object as M/D/YYYY', () => {
    // Use a fixed date to avoid timezone sensitivity: build via UTC then read local parts
    const d = new Date(2024, 0, 5)  // Jan 5 2024 local time
    expect(formatDate(d)).toBe('1/5/2024')
  })

  it('formats a date string', () => {
    const d = new Date(2024, 11, 31)  // Dec 31 2024
    expect(formatDate(d.toISOString())).toBe('12/31/2024')
  })

  it('formats single-digit month and day without padding', () => {
    const d = new Date(2025, 2, 3)  // Mar 3 2025
    expect(formatDate(d)).toBe('3/3/2025')
  })
})

describe('formatDateShort', () => {
  it('formats as "Mon D"', () => {
    const d = new Date(2024, 0, 15)  // Jan 15
    expect(formatDateShort(d)).toBe('Jan 15')
  })

  it('covers all months', () => {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    months.forEach((month, i) => {
      const d = new Date(2024, i, 1)
      expect(formatDateShort(d)).toBe(`${month} 1`)
    })
  })
})

describe('formatRelativeTime', () => {
  it('returns "Just now" for less than 1 minute ago', () => {
    const d = new Date(Date.now() - 30 * 1000)  // 30 seconds ago
    expect(formatRelativeTime(d)).toBe('Just now')
  })

  it('returns minutes for < 1 hour ago', () => {
    const d = new Date(Date.now() - 5 * 60 * 1000)  // 5 minutes ago
    expect(formatRelativeTime(d)).toBe('5m ago')
  })

  it('returns hours for < 24 hours ago', () => {
    const d = new Date(Date.now() - 3 * 3600 * 1000)  // 3 hours ago
    expect(formatRelativeTime(d)).toBe('3h ago')
  })

  it('returns days for < 7 days ago', () => {
    const d = new Date(Date.now() - 3 * 86400 * 1000)  // 3 days ago
    expect(formatRelativeTime(d)).toBe('3d ago')
  })

  it('falls back to formatDateShort for 7+ days ago', () => {
    const d = new Date(2024, 0, 1)  // Jan 1 2024 (well in the past)
    expect(formatRelativeTime(d)).toBe('Jan 1')
  })

  it('accepts a date string', () => {
    const d = new Date(Date.now() - 2 * 60 * 1000)  // 2 minutes ago
    expect(formatRelativeTime(d.toISOString())).toBe('2m ago')
  })
})

describe('formatMonthYear', () => {
  it('formats as "Month YYYY"', () => {
    const d = new Date(2024, 5, 15)  // June 2024
    expect(formatMonthYear(d)).toBe('June 2024')
  })

  it('covers all months', () => {
    const months = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ]
    months.forEach((month, i) => {
      const d = new Date(2025, i, 1)
      expect(formatMonthYear(d)).toBe(`${month} 2025`)
    })
  })
})
