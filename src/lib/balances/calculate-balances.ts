import { calculateExpenseImpact, calculatePairwiseDebts } from '@/lib/expenses/calculate-split'
import type {
  Balance,
  Expense,
  LedgerEntry,
  Money,
  PairwiseBalance,
  PairwiseTransaction,
  Settlement,
} from '@/types'

/**
 * Balance calculation.
 *
 * Everything is derived from a ledger of signed entries — the same shape the
 * Phase 2 `ledger_entries` table will hold — so the frontend and the future
 * database compute balances the same way.
 *
 * Sign convention throughout: positive means "is owed money".
 */

function isLive<T extends { deletedAt?: string | null }>(record: T): boolean {
  return !record.deletedAt
}

/** Signed entries for one expense. Sums to zero. */
export function expenseLedgerEntries(expense: Expense): LedgerEntry[] {
  return calculateExpenseImpact(expense)
    .filter((impact) => impact.net !== 0)
    .map((impact) => ({
      userId: impact.userId,
      groupId: expense.groupId,
      sourceType: 'expense' as const,
      sourceId: expense.id,
      amount: impact.net,
    }))
}

/**
 * Signed entries for one settlement. Sums to zero.
 *
 * A settlement moves money from a debtor to a creditor, so it pushes both
 * balances toward zero: the payer's net rises, the receiver's falls.
 */
export function settlementLedgerEntries(settlement: Settlement): LedgerEntry[] {
  return [
    {
      userId: settlement.fromUserId,
      groupId: settlement.groupId,
      sourceType: 'settlement' as const,
      sourceId: settlement.id,
      amount: settlement.amount,
    },
    {
      userId: settlement.toUserId,
      groupId: settlement.groupId,
      sourceType: 'settlement' as const,
      sourceId: settlement.id,
      amount: -settlement.amount,
    },
  ]
}

export function buildLedger(expenses: Expense[], settlements: Settlement[]): LedgerEntry[] {
  return [
    ...expenses.filter(isLive).flatMap(expenseLedgerEntries),
    ...settlements.filter(isLive).flatMap(settlementLedgerEntries),
  ]
}

/**
 * Net position per person, decomposed into paid / owed / settled so the UI can
 * explain *why* a balance is what it is instead of showing a bare number.
 */
export function calculateBalances(
  expenses: Expense[],
  settlements: Settlement[],
  /** Members who should appear even with no activity, so the list is complete. */
  memberIds: readonly string[] = [],
): Balance[] {
  const balances = new Map<string, Balance>()

  const ensure = (userId: string): Balance => {
    let balance = balances.get(userId)
    if (!balance) {
      balance = { userId, paid: 0, owed: 0, settled: 0, net: 0 }
      balances.set(userId, balance)
    }
    return balance
  }

  for (const userId of memberIds) ensure(userId)

  for (const expense of expenses.filter(isLive)) {
    for (const impact of calculateExpenseImpact(expense)) {
      const balance = ensure(impact.userId)
      balance.paid += impact.paid
      balance.owed += impact.owed
    }
  }

  for (const settlement of settlements.filter(isLive)) {
    ensure(settlement.fromUserId).settled += settlement.amount
    ensure(settlement.toUserId).settled -= settlement.amount
  }

  for (const balance of balances.values()) {
    balance.net = balance.paid - balance.owed + balance.settled
  }

  return [...balances.values()]
}

export function balanceFor(balances: Balance[], userId: string): Balance {
  return (
    balances.find((balance) => balance.userId === userId) ?? {
      userId,
      paid: 0,
      owed: 0,
      settled: 0,
      net: 0,
    }
  )
}

/**
 * Net obligations between every pair of people.
 *
 * Built by attributing each participant's share to the people who actually
 * paid for it, then netting the two directions of each pair against each
 * other. This is what powers "Ali owes you Rs 1,500" and the settle buttons.
 */
export function calculatePairwiseBalances(
  expenses: Expense[],
  settlements: Settlement[],
): PairwiseBalance[] {
  /** Key is `${a}|${b}` with a < b; value is what a owes b (may be negative). */
  const net = new Map<string, Money>()

  const add = (from: string, to: string, amount: Money) => {
    if (from === to || amount === 0) return
    const forward = from < to
    const key = forward ? `${from}|${to}` : `${to}|${from}`
    const signed = forward ? amount : -amount
    net.set(key, (net.get(key) ?? 0) + signed)
  }

  for (const expense of expenses.filter(isLive)) {
    for (const edge of calculatePairwiseDebts(expense)) {
      add(edge.fromUserId, edge.toUserId, edge.amount)
    }
  }

  // Paying someone reduces what you owe them.
  for (const settlement of settlements.filter(isLive)) {
    add(settlement.fromUserId, settlement.toUserId, -settlement.amount)
  }

  const result: PairwiseBalance[] = []
  for (const [key, amount] of net) {
    if (amount === 0) continue
    const [a, b] = key.split('|')
    result.push(
      amount > 0
        ? { fromUserId: a, toUserId: b, amount }
        : { fromUserId: b, toUserId: a, amount: -amount },
    )
  }

  return result.sort((x, y) => y.amount - x.amount)
}

/** The single net number between two people, signed from `viewerId`'s view. */
export function netBetween(
  pairwise: PairwiseBalance[],
  viewerId: string,
  otherId: string,
): Money {
  let total = 0
  for (const edge of pairwise) {
    if (edge.fromUserId === otherId && edge.toUserId === viewerId) total += edge.amount
    if (edge.fromUserId === viewerId && edge.toUserId === otherId) total -= edge.amount
  }
  return total
}

/**
 * Line-by-line breakdown of how a two-person balance came to be, newest first.
 * Amounts are signed from `viewerId`'s perspective: positive means the line
 * moved money in their favour.
 */
export function pairwiseTransactions(
  expenses: Expense[],
  settlements: Settlement[],
  viewerId: string,
  otherId: string,
): PairwiseTransaction[] {
  const rows: PairwiseTransaction[] = []

  for (const expense of expenses.filter(isLive)) {
    let amount: Money = 0
    for (const edge of calculatePairwiseDebts(expense)) {
      if (edge.fromUserId === otherId && edge.toUserId === viewerId) amount += edge.amount
      if (edge.fromUserId === viewerId && edge.toUserId === otherId) amount -= edge.amount
    }
    if (amount === 0) continue
    rows.push({
      sourceType: 'expense',
      sourceId: expense.id,
      description: expense.description,
      date: expense.date,
      category: expense.category,
      amount,
    })
  }

  for (const settlement of settlements.filter(isLive)) {
    const involvesBoth =
      (settlement.fromUserId === viewerId && settlement.toUserId === otherId) ||
      (settlement.fromUserId === otherId && settlement.toUserId === viewerId)
    if (!involvesBoth) continue

    const amount = settlement.fromUserId === viewerId ? settlement.amount : -settlement.amount
    rows.push({
      sourceType: 'settlement',
      sourceId: settlement.id,
      description: settlement.fromUserId === viewerId ? 'You paid' : 'They paid you',
      date: settlement.date,
      amount,
    })
  }

  return rows.sort((a, b) => b.date.localeCompare(a.date))
}

/** Split a net balance into the two headline figures the UI shows. */
export function splitOwedAndOwing(pairwise: PairwiseBalance[], viewerId: string) {
  let youOwe: Money = 0
  let youAreOwed: Money = 0

  for (const edge of pairwise) {
    if (edge.fromUserId === viewerId) youOwe += edge.amount
    if (edge.toUserId === viewerId) youAreOwed += edge.amount
  }

  return { youOwe, youAreOwed, net: youAreOwed - youOwe }
}
