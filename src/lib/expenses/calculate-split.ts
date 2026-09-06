import { allocate } from '@/lib/money/money'
import type { Expense, ExpenseParticipant, Money, SplitMethod } from '@/types'

/**
 * The split engine.
 *
 * One rule governs everything downstream:
 *
 *     net = amount paid − amount owed
 *
 * and across all people involved in a single expense the nets must sum to
 * exactly zero. Every function here preserves that invariant, including in the
 * presence of rounding remainders.
 */

export interface Share {
  userId: string
  /** What this person is charged, in minor units. */
  amount: Money
}

export interface SplitInput {
  total: Money
  method: SplitMethod
  participants: readonly ExpenseParticipant[]
}

/**
 * Turn the raw participant inputs into concrete per-person charges.
 *
 * The returned shares always sum to exactly `total` — for `exact` splits that
 * is only true once the input is valid, so callers should validate first
 * (`validateExpenseDraft`). When exact values do not add up we still normalize
 * the remainder rather than returning an unbalanced result, so a live preview
 * can never render a set of numbers that fails the zero-sum rule.
 */
export function calculateShares({ total, method, participants }: SplitInput): Share[] {
  if (participants.length === 0) return []

  const weights = participants.map((participant) => {
    switch (method) {
      case 'equal':
        return 1
      case 'percentage':
      case 'weighted':
        return Math.max(0, participant.value ?? 0)
      case 'exact':
        return Math.max(0, participant.value ?? 0)
    }
  })

  if (method === 'exact') {
    const stated = weights.reduce((sum, weight) => sum + weight, 0)
    // When the stated amounts already balance, use them verbatim so the user
    // sees back exactly the numbers they typed.
    if (stated === total) {
      return participants.map((participant, index) => ({
        userId: participant.userId,
        amount: weights[index],
      }))
    }
    // Otherwise scale proportionally so the preview still balances. The form
    // surfaces the discrepancy separately and blocks submission.
    return zip(participants, allocate(total, weights))
  }

  return zip(participants, allocate(total, weights))
}

function zip(participants: readonly ExpenseParticipant[], amounts: readonly Money[]): Share[] {
  return participants.map((participant, index) => ({
    userId: participant.userId,
    amount: amounts[index] ?? 0,
  }))
}

/** What each payer put down, keyed by user. */
export function paymentsByUser(expense: Pick<Expense, 'payments'>): Map<string, Money> {
  const map = new Map<string, Money>()
  for (const payment of expense.payments) {
    map.set(payment.userId, (map.get(payment.userId) ?? 0) + payment.amount)
  }
  return map
}

export interface UserImpact {
  userId: string
  paid: Money
  owed: Money
  /** paid − owed. Positive = this person is owed money by the others. */
  net: Money
}

/**
 * The signed effect of one expense on every person it touches.
 *
 * Covers all three accounting rules without special-casing them:
 *   - participant who did not pay  → paid 0, net = −share
 *   - participant who did pay      → net = paid − share
 *   - payer who is not a participant → owed 0, net = +paid
 *
 * The payer simply never has to appear in `participants`.
 */
export function calculateExpenseImpact(
  expense: Pick<Expense, 'amount' | 'splitMethod' | 'participants' | 'payments'>,
): UserImpact[] {
  const shares = calculateShares({
    total: expense.amount,
    method: expense.splitMethod,
    participants: expense.participants,
  })

  const owed = new Map<string, Money>()
  for (const share of shares) {
    owed.set(share.userId, (owed.get(share.userId) ?? 0) + share.amount)
  }

  const paid = paymentsByUser(expense)

  const userIds = new Set<string>([...paid.keys(), ...owed.keys()])
  return [...userIds].map((userId) => {
    const paidAmount = paid.get(userId) ?? 0
    const owedAmount = owed.get(userId) ?? 0
    return { userId, paid: paidAmount, owed: owedAmount, net: paidAmount - owedAmount }
  })
}

/**
 * Distribute each participant's charge across the payers, proportionally to
 * what each payer put down. This is what makes "you owe Ali 1,200" possible
 * with more than one payer, and it is integer-exact: the per-payer slices of a
 * single participant's share always add back up to that share.
 *
 * Returns edges of the form "debtor owes creditor", with self-edges dropped.
 */
export function calculatePairwiseDebts(
  expense: Pick<Expense, 'amount' | 'splitMethod' | 'participants' | 'payments'>,
): Array<{ fromUserId: string; toUserId: string; amount: Money }> {
  const shares = calculateShares({
    total: expense.amount,
    method: expense.splitMethod,
    participants: expense.participants,
  })

  const payers = [...paymentsByUser(expense).entries()].filter(([, amount]) => amount !== 0)
  if (payers.length === 0) return []

  const payerWeights = payers.map(([, amount]) => amount)
  const edges: Array<{ fromUserId: string; toUserId: string; amount: Money }> = []

  for (const share of shares) {
    if (share.amount === 0) continue
    const slices = allocate(share.amount, payerWeights)
    slices.forEach((slice, index) => {
      const payerId = payers[index][0]
      if (slice === 0 || payerId === share.userId) return
      edges.push({ fromUserId: share.userId, toUserId: payerId, amount: slice })
    })
  }

  return edges
}

/**
 * Build participant rows for a given method from a set of selected users,
 * preserving any values the user already entered. Used by the expense form
 * when the participant set or the split method changes.
 */
export function buildParticipants(
  userIds: readonly string[],
  method: SplitMethod,
  total: Money,
  previous: readonly ExpenseParticipant[] = [],
): ExpenseParticipant[] {
  const previousByUser = new Map(previous.map((participant) => [participant.userId, participant]))

  if (method === 'equal') {
    return userIds.map((userId) => ({ userId }))
  }

  if (method === 'weighted') {
    return userIds.map((userId) => ({
      userId,
      value: previousByUser.get(userId)?.value ?? 1,
    }))
  }

  if (method === 'percentage') {
    // Seed with an even percentage split in basis points so the form opens in
    // a valid state rather than at zero.
    const even = allocate(10_000, userIds.map(() => 1))
    return userIds.map((userId, index) => ({
      userId,
      value: previousByUser.get(userId)?.value ?? even[index],
    }))
  }

  const even = allocate(total, userIds.map(() => 1))
  return userIds.map((userId, index) => ({
    userId,
    value: previousByUser.get(userId)?.value ?? even[index],
  }))
}

export const SPLIT_METHOD_LABELS: Record<SplitMethod, string> = {
  equal: 'Equally',
  exact: 'Exact amounts',
  percentage: 'Percentages',
  weighted: 'By shares',
}

export const SPLIT_METHOD_DESCRIPTIONS: Record<SplitMethod, string> = {
  equal: 'Everyone selected pays the same amount.',
  exact: 'Type exactly what each person owes.',
  percentage: 'Assign each person a percentage of the total.',
  weighted: 'Give people shares — 2 shares pays double 1 share.',
}
