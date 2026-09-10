import type { Balance, SettlementSuggestion } from '@/types'

/**
 * Debt simplification.
 *
 * Given the net position of every member, produce a set of transfers that
 * clears the group. We use the classic greedy approach: repeatedly match the
 * largest debtor against the largest creditor and move the smaller of the two
 * amounts. Each pass zeroes at least one person, so with n people carrying a
 * non-zero balance the result is at most n − 1 transfers.
 *
 * That is not always the theoretical minimum — finding it is NP-hard — but it
 * is fast, deterministic, and in practice matches the optimum for the group
 * sizes this product deals with.
 *
 * Two properties matter more than optimality and both hold here:
 *   - every suggested transfer is possible: the sender genuinely owes at least
 *     that much overall, and the receiver is genuinely owed at least that much
 *   - applying every suggestion leaves all balances at exactly zero
 */
export function optimizeSettlements(balances: readonly Balance[]): SettlementSuggestion[] {
  const debtors = balances
    .filter((balance) => balance.net < 0)
    .map((balance) => ({ userId: balance.userId, amount: -balance.net }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId))

  const creditors = balances
    .filter((balance) => balance.net > 0)
    .map((balance) => ({ userId: balance.userId, amount: balance.net }))
    .sort((a, b) => b.amount - a.amount || a.userId.localeCompare(b.userId))

  const suggestions: SettlementSuggestion[] = []
  let debtorIndex = 0
  let creditorIndex = 0

  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex]
    const creditor = creditors[creditorIndex]
    const amount = Math.min(debtor.amount, creditor.amount)

    if (amount > 0) {
      suggestions.push({ fromUserId: debtor.userId, toUserId: creditor.userId, amount })
      debtor.amount -= amount
      creditor.amount -= amount
    }

    if (debtor.amount === 0) debtorIndex += 1
    if (creditor.amount === 0) creditorIndex += 1
  }

  return suggestions
}
