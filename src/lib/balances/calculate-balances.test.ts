import { describe, expect, it } from 'vitest'

import { optimizeSettlements } from '@/lib/settlements/optimize-settlements'
import type { Balance, Expense, Settlement, SplitMethod } from '@/types'

import {
  balanceFor,
  buildLedger,
  calculateBalances,
  calculatePairwiseBalances,
  netBetween,
  pairwiseTransactions,
  splitOwedAndOwing,
} from './calculate-balances'

const UZAIR = 'u_uzair'
const ALI = 'u_ali'
const SHAHEER = 'u_shaheer'
const NAVEED = 'u_naveed'
const GROUP = 'g_trip'

let sequence = 0

function makeExpense(
  amount: number,
  payments: Array<[string, number]>,
  participants: string[],
  overrides: Partial<Expense> = {},
): Expense {
  sequence += 1
  return {
    id: `e_${sequence}`,
    groupId: GROUP,
    description: `Expense ${sequence}`,
    amount,
    currency: 'PKR',
    category: 'food',
    date: '2026-08-01',
    splitMethod: 'equal' as SplitMethod,
    payments: payments.map(([userId, value]) => ({ userId, amount: value })),
    participants: participants.map((userId) => ({ userId })),
    createdBy: payments[0]?.[0] ?? UZAIR,
    createdAt: '2026-08-01T10:00:00.000Z',
    updatedAt: '2026-08-01T10:00:00.000Z',
    ...overrides,
  }
}

function makeSettlement(
  fromUserId: string,
  toUserId: string,
  amount: number,
  overrides: Partial<Settlement> = {},
): Settlement {
  sequence += 1
  return {
    id: `s_${sequence}`,
    groupId: GROUP,
    fromUserId,
    toUserId,
    amount,
    currency: 'PKR',
    date: '2026-08-05',
    createdBy: fromUserId,
    createdAt: '2026-08-05T10:00:00.000Z',
    ...overrides,
  }
}

describe('calculateBalances', () => {
  it('nets paid against owed', () => {
    const expenses = [makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER])]
    const balances = calculateBalances(expenses, [])

    expect(balanceFor(balances, UZAIR).net).toBe(200_000)
    expect(balanceFor(balances, ALI).net).toBe(-100_000)
    expect(balanceFor(balances, SHAHEER).net).toBe(-100_000)
  })

  it('keeps paid and owed separately so the number is explainable', () => {
    const balances = calculateBalances(
      [makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER])],
      [],
    )
    const uzair = balanceFor(balances, UZAIR)
    expect(uzair.paid).toBe(300_000)
    expect(uzair.owed).toBe(100_000)
    expect(uzair.net).toBe(uzair.paid - uzair.owed + uzair.settled)
  })

  it('always sums to zero across the group', () => {
    const expenses = [
      makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER]),
      makeExpense(10_000, [[ALI, 10_000]], [ALI, SHAHEER, NAVEED]),
      makeExpense(
        500_000,
        [
          [UZAIR, 300_000],
          [ALI, 200_000],
        ],
        [UZAIR, ALI, SHAHEER, NAVEED],
      ),
      // Payer is not a participant.
      makeExpense(90_000, [[NAVEED, 90_000]], [UZAIR, ALI]),
    ]
    const settlements = [makeSettlement(SHAHEER, UZAIR, 120_000)]

    const total = calculateBalances(expenses, settlements).reduce(
      (sum, balance) => sum + balance.net,
      0,
    )
    expect(total).toBe(0)
  })

  it('includes members with no activity so the roster is complete', () => {
    const balances = calculateBalances([], [], [UZAIR, ALI])
    expect(balances).toHaveLength(2)
    expect(balances.every((balance) => balance.net === 0)).toBe(true)
  })

  it('ignores soft-deleted expenses and settlements', () => {
    const expenses = [
      makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER], {
        deletedAt: '2026-08-02T00:00:00.000Z',
      }),
    ]
    const settlements = [makeSettlement(ALI, UZAIR, 50_000, { deletedAt: '2026-08-06T00:00:00.000Z' })]
    expect(calculateBalances(expenses, settlements, [UZAIR, ALI])).toEqual([
      { userId: UZAIR, paid: 0, owed: 0, settled: 0, net: 0 },
      { userId: ALI, paid: 0, owed: 0, settled: 0, net: 0 },
    ])
  })
})

describe('settlements', () => {
  it('moves both balances toward zero', () => {
    const expenses = [makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER])]
    const settlements = [makeSettlement(ALI, UZAIR, 100_000)]
    const balances = calculateBalances(expenses, settlements)

    expect(balanceFor(balances, ALI).net).toBe(0)
    expect(balanceFor(balances, UZAIR).net).toBe(100_000)
  })

  it('fully clears a group when every suggestion is recorded', () => {
    const expenses = [
      makeExpense(
        500_000,
        [
          [UZAIR, 300_000],
          [ALI, 200_000],
        ],
        [UZAIR, ALI, SHAHEER, NAVEED],
      ),
      makeExpense(70_000, [[SHAHEER, 70_000]], [UZAIR, ALI, SHAHEER, NAVEED]),
    ]

    const suggestions = optimizeSettlements(calculateBalances(expenses, []))
    const recorded = suggestions.map((suggestion) =>
      makeSettlement(suggestion.fromUserId, suggestion.toUserId, suggestion.amount),
    )

    for (const balance of calculateBalances(expenses, recorded)) {
      expect(balance.net).toBe(0)
    }
  })
})

describe('ledger', () => {
  it('produces entries that sum to zero', () => {
    const expenses = [
      makeExpense(300_000, [[UZAIR, 300_000]], [UZAIR, ALI, SHAHEER]),
      makeExpense(10_001, [[ALI, 10_001]], [ALI, SHAHEER, NAVEED]),
    ]
    const entries = buildLedger(expenses, [makeSettlement(SHAHEER, UZAIR, 40_000)])
    expect(entries.reduce((sum, entry) => sum + entry.amount, 0)).toBe(0)
  })
})

describe('pairwise balances', () => {
  it('nets the two directions of a pair against each other', () => {
    const expenses = [
      // Uzair pays 1,000 split with Ali → Ali owes Uzair 500.
      makeExpense(100_000, [[UZAIR, 100_000]], [UZAIR, ALI]),
      // Ali pays 600 split with Uzair → Uzair owes Ali 300.
      makeExpense(60_000, [[ALI, 60_000]], [UZAIR, ALI]),
    ]
    const pairwise = calculatePairwiseBalances(expenses, [])

    expect(pairwise).toHaveLength(1)
    expect(pairwise[0]).toEqual({ fromUserId: ALI, toUserId: UZAIR, amount: 20_000 })
    expect(netBetween(pairwise, UZAIR, ALI)).toBe(20_000)
    expect(netBetween(pairwise, ALI, UZAIR)).toBe(-20_000)
  })

  it('drops a pair once a settlement clears it', () => {
    const expenses = [makeExpense(100_000, [[UZAIR, 100_000]], [UZAIR, ALI])]
    const settlements = [makeSettlement(ALI, UZAIR, 50_000)]
    expect(calculatePairwiseBalances(expenses, settlements)).toEqual([])
  })

  it('splits you-owe and you-are-owed for the summary cards', () => {
    const expenses = [
      makeExpense(100_000, [[UZAIR, 100_000]], [UZAIR, ALI]),
      makeExpense(80_000, [[SHAHEER, 80_000]], [UZAIR, SHAHEER]),
    ]
    const summary = splitOwedAndOwing(calculatePairwiseBalances(expenses, []), UZAIR)

    expect(summary.youAreOwed).toBe(50_000)
    expect(summary.youOwe).toBe(40_000)
    expect(summary.net).toBe(10_000)
  })
})

describe('pairwise transaction breakdown', () => {
  it('lists the lines that produced a balance, newest first', () => {
    const expenses = [
      makeExpense(100_000, [[UZAIR, 100_000]], [UZAIR, ALI], {
        description: 'Dinner',
        date: '2026-08-01',
      }),
      makeExpense(60_000, [[ALI, 60_000]], [UZAIR, ALI], {
        description: 'Uber',
        date: '2026-08-03',
      }),
    ]
    const rows = pairwiseTransactions(expenses, [makeSettlement(ALI, UZAIR, 5_000)], UZAIR, ALI)

    expect(rows.map((row) => row.description)).toEqual(['They paid you', 'Uber', 'Dinner'])
    // The signed lines must reconstruct the net balance exactly.
    expect(rows.reduce((sum, row) => sum + row.amount, 0)).toBe(
      netBetween(calculatePairwiseBalances(expenses, [makeSettlement(ALI, UZAIR, 5_000)]), UZAIR, ALI),
    )
  })
})

describe('settlement optimization', () => {
  const balances: Balance[] = [
    { userId: UZAIR, paid: 0, owed: 0, settled: 0, net: 300_000 },
    { userId: ALI, paid: 0, owed: 0, settled: 0, net: 100_000 },
    { userId: SHAHEER, paid: 0, owed: 0, settled: 0, net: -200_000 },
    { userId: NAVEED, paid: 0, owed: 0, settled: 0, net: -200_000 },
  ]

  it('clears every balance', () => {
    const suggestions = optimizeSettlements(balances)
    const remaining = new Map(balances.map((balance) => [balance.userId, balance.net]))
    for (const suggestion of suggestions) {
      remaining.set(suggestion.fromUserId, remaining.get(suggestion.fromUserId)! + suggestion.amount)
      remaining.set(suggestion.toUserId, remaining.get(suggestion.toUserId)! - suggestion.amount)
    }
    for (const value of remaining.values()) expect(value).toBe(0)
  })

  it('needs at most n-1 transfers', () => {
    const active = balances.filter((balance) => balance.net !== 0).length
    expect(optimizeSettlements(balances).length).toBeLessThanOrEqual(active - 1)
  })

  it('only ever moves money from a debtor to a creditor', () => {
    const net = new Map(balances.map((balance) => [balance.userId, balance.net]))
    for (const suggestion of optimizeSettlements(balances)) {
      expect(net.get(suggestion.fromUserId)!).toBeLessThan(0)
      expect(net.get(suggestion.toUserId)!).toBeGreaterThan(0)
      expect(suggestion.amount).toBeGreaterThan(0)
    }
  })

  it('suggests nothing when everyone is square', () => {
    expect(
      optimizeSettlements([{ userId: UZAIR, paid: 0, owed: 0, settled: 0, net: 0 }]),
    ).toEqual([])
  })

  it('is deterministic', () => {
    expect(optimizeSettlements(balances)).toEqual(optimizeSettlements(balances))
  })
})
