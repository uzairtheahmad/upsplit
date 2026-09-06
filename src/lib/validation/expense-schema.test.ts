import { describe, expect, it } from 'vitest'

import { validateExpenseDraft, validateSplit, type ExpenseDraft } from './expense-schema'

const UZAIR = 'u_uzair'
const ALI = 'u_ali'
const SHAHEER = 'u_shaheer'
const MEMBERS = [UZAIR, ALI, SHAHEER, 'u_naveed']

function draft(overrides: Partial<ExpenseDraft> = {}): Partial<ExpenseDraft> {
  return {
    groupId: 'g_trip',
    description: 'Dinner at Monal',
    amount: 300_000,
    currency: 'PKR',
    category: 'food',
    date: '2026-08-01',
    splitMethod: 'equal',
    payments: [{ userId: UZAIR, amount: 300_000 }],
    participants: [{ userId: UZAIR }, { userId: ALI }, { userId: SHAHEER }],
    ...overrides,
  }
}

function messages(result: { issues: Array<{ message: string }> }) {
  return result.issues.map((issue) => issue.message)
}

describe('validateExpenseDraft', () => {
  it('accepts a well-formed expense', () => {
    expect(validateExpenseDraft(draft(), { memberIds: MEMBERS }).ok).toBe(true)
  })

  it('accepts a payer who is not a participant', () => {
    const result = validateExpenseDraft(
      draft({ participants: [{ userId: ALI }, { userId: SHAHEER }] }),
      { memberIds: MEMBERS },
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a zero or negative amount', () => {
    expect(validateExpenseDraft(draft({ amount: 0 }), { memberIds: MEMBERS }).ok).toBe(false)
    expect(validateExpenseDraft(draft({ amount: -100 }), { memberIds: MEMBERS }).ok).toBe(false)
  })

  it('rejects an empty participant list', () => {
    const result = validateExpenseDraft(draft({ participants: [] }), { memberIds: MEMBERS })
    expect(result.ok).toBe(false)
    expect(messages(result).join(' ')).toContain('at least one person')
  })

  it('rejects a missing description', () => {
    expect(validateExpenseDraft(draft({ description: '' }), { memberIds: MEMBERS }).ok).toBe(false)
  })

  it('rejects payments that do not add up to the total', () => {
    const result = validateExpenseDraft(
      draft({ payments: [{ userId: UZAIR, amount: 200_000 }] }),
      { memberIds: MEMBERS },
    )
    expect(result.ok).toBe(false)
    expect(messages(result).join(' ')).toContain('add up to the expense total')
  })

  it('accepts multiple payers that add up', () => {
    const result = validateExpenseDraft(
      draft({
        payments: [
          { userId: UZAIR, amount: 200_000 },
          { userId: ALI, amount: 100_000 },
        ],
      }),
      { memberIds: MEMBERS },
    )
    expect(result.ok).toBe(true)
  })

  it('rejects a payer outside the group', () => {
    const result = validateExpenseDraft(
      draft({ payments: [{ userId: 'u_stranger', amount: 300_000 }] }),
      { memberIds: MEMBERS },
    )
    expect(result.ok).toBe(false)
    expect(messages(result).join(' ')).toContain('not a member')
  })

  it('rejects a duplicated participant', () => {
    const result = validateExpenseDraft(
      draft({ participants: [{ userId: ALI }, { userId: ALI }] }),
      { memberIds: MEMBERS },
    )
    expect(result.ok).toBe(false)
    expect(messages(result).join(' ')).toContain('only be listed once')
  })

  it('rejects an invalid date', () => {
    expect(validateExpenseDraft(draft({ date: 'yesterday' }), { memberIds: MEMBERS }).ok).toBe(false)
  })
})

describe('validateSplit', () => {
  it('always accepts an equal split', () => {
    expect(validateSplit('equal', 100_000, [{ userId: UZAIR }, { userId: ALI }]).ok).toBe(true)
  })

  it('requires exact amounts to add up to the total', () => {
    const short = validateSplit('exact', 100_000, [
      { userId: UZAIR, value: 40_000 },
      { userId: ALI, value: 30_000 },
    ])
    expect(short.ok).toBe(false)
    expect(short.difference).toBe(-30_000)

    const exact = validateSplit('exact', 100_000, [
      { userId: UZAIR, value: 70_000 },
      { userId: ALI, value: 30_000 },
    ])
    expect(exact.ok).toBe(true)
    expect(exact.difference).toBe(0)
  })

  it('requires percentages to add up to exactly 100%', () => {
    const over = validateSplit('percentage', 100_000, [
      { userId: UZAIR, value: 6000 },
      { userId: ALI, value: 5000 },
    ])
    expect(over.ok).toBe(false)
    expect(over.difference).toBe(1000)

    expect(
      validateSplit('percentage', 100_000, [
        { userId: UZAIR, value: 5000 },
        { userId: ALI, value: 3000 },
        { userId: SHAHEER, value: 2000 },
      ]).ok,
    ).toBe(true)
  })

  it('requires at least one positive weight', () => {
    expect(
      validateSplit('weighted', 100_000, [
        { userId: UZAIR, value: 0 },
        { userId: ALI, value: 0 },
      ]).ok,
    ).toBe(false)

    expect(
      validateSplit('weighted', 100_000, [
        { userId: UZAIR, value: 2 },
        { userId: ALI, value: 1 },
      ]).ok,
    ).toBe(true)
  })

  it('rejects negative split values', () => {
    expect(
      validateSplit('exact', 100_000, [
        { userId: UZAIR, value: 110_000 },
        { userId: ALI, value: -10_000 },
      ]).ok,
    ).toBe(false)
  })

  it('rejects an empty participant list', () => {
    expect(validateSplit('equal', 100_000, []).ok).toBe(false)
  })
})
