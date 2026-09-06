import { describe, expect, it } from 'vitest'

import { allocate, allocateEvenly, formatMoney, parseMoney, toMajorString } from './money'

describe('parseMoney', () => {
  it('converts major units to integer minor units without float error', () => {
    expect(parseMoney('19.99')).toBe(1999)
    expect(parseMoney('0.07')).toBe(7)
    expect(parseMoney('1000')).toBe(100_000)
    expect(parseMoney('3,000')).toBe(300_000)
  })

  it('pads and truncates fractional input', () => {
    expect(parseMoney('5.1')).toBe(510)
    expect(parseMoney('5.')).toBe(500)
    expect(parseMoney('.5')).toBe(50)
  })

  it('rounds half-up beyond the currency precision', () => {
    expect(parseMoney('1.005')).toBe(101)
    expect(parseMoney('1.004')).toBe(100)
  })

  it('rejects nonsense', () => {
    expect(parseMoney('')).toBeNull()
    expect(parseMoney('abc')).toBeNull()
    expect(parseMoney('1.2.3')).toBeNull()
  })

  it('round-trips through toMajorString', () => {
    for (const value of ['0.01', '19.99', '1234.50', '100000.00']) {
      expect(toMajorString(parseMoney(value)!)).toBe(value)
    }
  })
})

describe('formatMoney', () => {
  it('drops empty decimals and groups thousands', () => {
    expect(formatMoney(300_000, 'PKR')).toBe('Rs 3,000')
    expect(formatMoney(199_950, 'PKR')).toBe('Rs 1,999.50')
  })

  it('can render signed and absolute values', () => {
    expect(formatMoney(150_000, 'PKR', { signed: true })).toBe('+Rs 1,500')
    expect(formatMoney(0, 'PKR', { signed: true })).toBe('Rs 0')
    expect(formatMoney(-150_000, 'PKR')).toBe('-Rs 1,500')
    expect(formatMoney(-150_000, 'PKR', { absolute: true })).toBe('Rs 1,500')
  })
})

describe('allocate', () => {
  it('splits evenly when it divides cleanly', () => {
    expect(allocateEvenly(100_000, 4)).toEqual([25_000, 25_000, 25_000, 25_000])
  })

  it('distributes a remainder deterministically instead of producing fractions', () => {
    // Rs 100 across 3 people = 10000 paisa / 3
    expect(allocateEvenly(10_000, 3)).toEqual([3334, 3333, 3333])
  })

  it('always sums to exactly the total, for every size and total', () => {
    for (let total = 0; total <= 200; total += 1) {
      for (let count = 1; count <= 9; count += 1) {
        const parts = allocateEvenly(total, count)
        expect(parts).toHaveLength(count)
        expect(parts.reduce((sum, part) => sum + part, 0)).toBe(total)
      }
    }
  })

  it('honours weights and still sums exactly', () => {
    expect(allocate(100_000, [2, 1, 1])).toEqual([50_000, 25_000, 25_000])
    const awkward = allocate(10_000, [1, 1, 1, 1, 1, 1, 1])
    expect(awkward.reduce((sum, part) => sum + part, 0)).toBe(10_000)
  })

  it('is deterministic — same input, same allocation', () => {
    expect(allocate(1001, [1, 1, 1])).toEqual(allocate(1001, [1, 1, 1]))
  })

  it('falls back to an even split when all weights are zero', () => {
    expect(allocate(300, [0, 0, 0])).toEqual([100, 100, 100])
  })

  it('handles negative totals', () => {
    const parts = allocate(-10_000, [1, 1, 1])
    expect(parts.reduce((sum, part) => sum + part, 0)).toBe(-10_000)
  })

  it('returns nothing for no participants', () => {
    expect(allocate(1000, [])).toEqual([])
  })
})
