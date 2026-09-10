import { describe, expect, it } from 'vitest'

import type { Expense, ExpenseParticipant, SplitMethod } from '@/types'

import {
  calculateExpenseImpact,
  calculatePairwiseDebts,
  calculateShares,
} from './calculate-split'

const UZAIR = 'u_uzair'
const ALI = 'u_ali'
const SHAHEER = 'u_shaheer'
const NAVEED = 'u_naveed'

type ExpenseCore = Pick<Expense, 'amount' | 'splitMethod' | 'participants' | 'payments'>

function expense(
  amount: number,
  splitMethod: SplitMethod,
  payments: Array<[string, number]>,
  participants: Array<string | ExpenseParticipant>,
): ExpenseCore {
  return {
    amount,
    splitMethod,
    payments: payments.map(([userId, value]) => ({ userId, amount: value })),
    participants: participants.map((participant) =>
      typeof participant === 'string' ? { userId: participant } : participant,
    ),
  }
}

/** The invariant that must hold for every expense, no matter the shape. */
function expectZeroSum(core: ExpenseCore) {
  const total = calculateExpenseImpact(core).reduce((sum, impact) => sum + impact.net, 0)
  expect(total).toBe(0)
}

function netFor(core: ExpenseCore, userId: string): number {
  return calculateExpenseImpact(core).find((impact) => impact.userId === userId)?.net ?? 0
}

describe('equal split', () => {
  it('charges everyone the same share', () => {
    const shares = calculateShares({
      total: 100_000,
      method: 'equal',
      participants: [{ userId: UZAIR }, { userId: ALI }, { userId: SHAHEER }, { userId: NAVEED }],
    })
    expect(shares.map((share) => share.amount)).toEqual([25_000, 25_000, 25_000, 25_000])
  })

  it('distributes an uneven remainder rather than creating fractions', () => {
    const shares = calculateShares({
      total: 10_000,
      method: 'equal',
      participants: [{ userId: UZAIR }, { userId: ALI }, { userId: SHAHEER }],
    })
    expect(shares.map((share) => share.amount)).toEqual([3334, 3333, 3333])
    expect(shares.reduce((sum, share) => sum + share.amount, 0)).toBe(10_000)
  })
})

describe('rule 1 — participant who did not pay', () => {
  it('is charged only their share', () => {
    const core = expense(300_000, 'equal', [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER])
    expect(netFor(core, ALI)).toBe(-100_000)
    expect(netFor(core, SHAHEER)).toBe(-100_000)
    expectZeroSum(core)
  })
})

describe('rule 2 — payer who is also a participant', () => {
  it('nets paid minus their own share', () => {
    // The worked example from the spec: Rs 3,000 dinner, three people, Uzair paid.
    const core = expense(300_000, 'equal', [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER])
    expect(netFor(core, UZAIR)).toBe(200_000)
    expectZeroSum(core)
  })
})

describe('rule 3 — payer who is not a participant', () => {
  it('is owed the entire amount', () => {
    const core = expense(300_000, 'equal', [[UZAIR, 300_000]], [ALI, SHAHEER, NAVEED])
    expect(netFor(core, UZAIR)).toBe(300_000)
    expect(netFor(core, ALI)).toBe(-100_000)
    expect(netFor(core, SHAHEER)).toBe(-100_000)
    expect(netFor(core, NAVEED)).toBe(-100_000)
    expectZeroSum(core)
  })
})

describe('multiple payers', () => {
  it('nets each payer against their own share', () => {
    // Rs 5,000 paid 3,000 by Uzair and 2,000 by Ali, split four ways.
    const core = expense(
      500_000,
      'equal',
      [
        [UZAIR, 300_000],
        [ALI, 200_000],
      ],
      [UZAIR, ALI, SHAHEER, NAVEED],
    )
    expect(netFor(core, UZAIR)).toBe(175_000)
    expect(netFor(core, ALI)).toBe(75_000)
    expect(netFor(core, SHAHEER)).toBe(-125_000)
    expect(netFor(core, NAVEED)).toBe(-125_000)
    expectZeroSum(core)
  })

  it('attributes each debtor proportionally across the payers', () => {
    const core = expense(
      500_000,
      'equal',
      [
        [UZAIR, 300_000],
        [ALI, 200_000],
      ],
      [UZAIR, ALI, SHAHEER, NAVEED],
    )
    const debts = calculatePairwiseDebts(core)

    const shaheerOwes = debts.filter((edge) => edge.fromUserId === SHAHEER)
    // Shaheer's 1,250 share splits 60/40 between the two payers.
    expect(shaheerOwes.find((edge) => edge.toUserId === UZAIR)?.amount).toBe(75_000)
    expect(shaheerOwes.find((edge) => edge.toUserId === ALI)?.amount).toBe(50_000)
    expect(shaheerOwes.reduce((sum, edge) => sum + edge.amount, 0)).toBe(125_000)
  })

  it('never creates an edge from someone to themselves', () => {
    const core = expense(
      500_000,
      'equal',
      [
        [UZAIR, 300_000],
        [ALI, 200_000],
      ],
      [UZAIR, ALI, SHAHEER, NAVEED],
    )
    for (const edge of calculatePairwiseDebts(core)) {
      expect(edge.fromUserId).not.toBe(edge.toUserId)
    }
  })
})

describe('exact split', () => {
  it('uses the stated amounts verbatim when they balance', () => {
    const shares = calculateShares({
      total: 100_000,
      method: 'exact',
      participants: [
        { userId: UZAIR, value: 50_000 },
        { userId: ALI, value: 30_000 },
        { userId: SHAHEER, value: 20_000 },
      ],
    })
    expect(shares.map((share) => share.amount)).toEqual([50_000, 30_000, 20_000])
  })

  it('still balances the preview when the stated amounts do not add up', () => {
    const core = expense(
      100_000,
      'exact',
      [[UZAIR, 100_000]],
      [
        { userId: UZAIR, value: 50_000 },
        { userId: ALI, value: 20_000 },
      ],
    )
    expectZeroSum(core)
  })
})

describe('edge cases', () => {
  it('returns no shares when there are no participants', () => {
    expect(calculateShares({ total: 100_000, method: 'equal', participants: [] })).toEqual([])
  })

  it('leaves a payer with no participants owed the full amount', () => {
    const core = expense(100_000, 'equal', [[UZAIR, 100_000]], [])
    expect(netFor(core, UZAIR)).toBe(100_000)
    // Nothing was charged to anyone, so this does not balance — the form
    // blocks it, but the engine must not crash or invent a counterparty.
    expect(calculatePairwiseDebts(core)).toEqual([])
  })

  it('handles a zero amount without dividing by zero', () => {
    const core = expense(0, 'equal', [[UZAIR, 0]], [UZAIR, ALI])
    expectZeroSum(core)
  })
})

describe('zero-sum invariant', () => {
  const methods: SplitMethod[] = ['equal', 'exact']

  it('holds across every method, awkward total, and participant count', () => {
    for (const method of methods) {
      for (const total of [1, 7, 99, 100_001, 333_333]) {
        for (let count = 1; count <= 6; count += 1) {
          const people = [UZAIR, ALI, SHAHEER, NAVEED, 'u_hadi', 'u_abdullah'].slice(0, count)
          const participants: ExpenseParticipant[] = people.map((userId, index) => ({
            userId,
            value: method === 'exact' ? Math.floor(total / count) : index + 1,
          }))
          expectZeroSum(expense(total, method, [[UZAIR, total]], participants))
        }
      }
    }
  })

  it('holds with multiple payers and a non-participating payer', () => {
    expectZeroSum(
      expense(
        333_333,
        'exact',
        [
          [UZAIR, 111_111],
          [ALI, 222_222],
        ],
        [
          { userId: SHAHEER, value: 3 },
          { userId: NAVEED, value: 1 },
        ],
      ),
    )
  })
})
