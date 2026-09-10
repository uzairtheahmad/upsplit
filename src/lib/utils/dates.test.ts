import { describe, expect, it } from 'vitest'

import { isWithinRange, monthKeysForRange, resolveDateRange } from './dates'

describe('monthKeysForRange', () => {
  it('covers every month a range touches, oldest first', () => {
    expect(monthKeysForRange({ from: '2026-01-15', to: '2026-04-02' })).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
    ])
  })

  it('includes partial months at both ends', () => {
    // The 31st is still January, and the 1st is still February.
    expect(monthKeysForRange({ from: '2026-01-31', to: '2026-02-01' })).toEqual([
      '2026-01',
      '2026-02',
    ])
  })

  it('returns a single month when both ends are in it', () => {
    expect(monthKeysForRange({ from: '2026-03-04', to: '2026-03-09' })).toEqual(['2026-03'])
  })

  it('crosses a year boundary', () => {
    expect(monthKeysForRange({ from: '2025-11-20', to: '2026-02-03' })).toEqual([
      '2025-11',
      '2025-12',
      '2026-01',
      '2026-02',
    ])
  })

  it('returns nothing for an inverted range', () => {
    // The analytics page renders an empty state rather than silently swapping
    // the dates, so this has to be empty rather than a reversed list.
    expect(monthKeysForRange({ from: '2026-06-01', to: '2026-01-01' })).toEqual([])
  })

  it('caps a very long range at 24 columns, keeping the most recent', () => {
    const keys = monthKeysForRange({ from: '2000-01-01', to: '2026-09-11' })
    expect(keys).toHaveLength(24)
    expect(keys[keys.length - 1]).toBe('2026-09')
    expect(keys[0]).toBe('2024-10')
  })

  it('falls back to the recent months when the range is open', () => {
    expect(monthKeysForRange(null, 6)).toHaveLength(6)
    expect(monthKeysForRange(null, 3)).toHaveLength(3)
  })
})

describe('resolveDateRange', () => {
  const now = new Date('2026-09-11T12:00:00Z')

  it('resolves a whole calendar month', () => {
    expect(resolveDateRange('this_month', now)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    })
  })

  it('resolves the previous calendar month, not the last 30 days', () => {
    expect(resolveDateRange('last_month', now)).toEqual({
      from: '2026-08-01',
      to: '2026-08-31',
    })
  })

  it('leaves open-ended ranges unbounded', () => {
    // null means "no filter", which is what all_time and an unset custom range
    // both mean to filterExpensesByRange.
    expect(resolveDateRange('all_time', now)).toBeNull()
    expect(resolveDateRange('custom', now)).toBeNull()
  })
})

describe('isWithinRange', () => {
  const range = { from: '2026-03-01', to: '2026-03-31' }

  it('includes both endpoints', () => {
    expect(isWithinRange('2026-03-01', range)).toBe(true)
    expect(isWithinRange('2026-03-31', range)).toBe(true)
  })

  it('excludes the days either side', () => {
    expect(isWithinRange('2026-02-28', range)).toBe(false)
    expect(isWithinRange('2026-04-01', range)).toBe(false)
  })

  it('accepts everything when there is no range', () => {
    expect(isWithinRange('1999-01-01', null)).toBe(true)
  })
})
