import { paymentsByUser } from '@/lib/expenses/calculate-split'
import { monthKey, monthKeyLabel, type DateRange, isWithinRange } from '@/lib/utils/dates'
import type { Expense, ExpenseCategory, Money } from '@/types'

/**
 * Analytics.
 *
 * Rule that shapes this whole module: **settlements are not spending.** Moving
 * money between two members to clear a debt does not create new consumption,
 * so nothing here ever takes settlements as input — only expenses.
 */

export function filterExpensesByRange(expenses: Expense[], range: DateRange | null): Expense[] {
  return expenses.filter((expense) => !expense.deletedAt && isWithinRange(expense.date, range))
}

export function totalSpending(expenses: Expense[]): Money {
  return expenses.reduce((sum, expense) => sum + expense.amount, 0)
}

export interface CategoryTotal {
  category: ExpenseCategory
  amount: Money
  count: number
  /** Share of the total, 0–100, rounded for display. */
  percentage: number
}

export function spendingByCategory(expenses: Expense[]): CategoryTotal[] {
  const totals = new Map<ExpenseCategory, { amount: Money; count: number }>()

  for (const expense of expenses) {
    const current = totals.get(expense.category) ?? { amount: 0, count: 0 }
    totals.set(expense.category, {
      amount: current.amount + expense.amount,
      count: current.count + 1,
    })
  }

  const total = totalSpending(expenses)
  return [...totals.entries()]
    .map(([category, value]) => ({
      category,
      amount: value.amount,
      count: value.count,
      percentage: total === 0 ? 0 : Math.round((value.amount / total) * 1000) / 10,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export interface MonthlyTotal {
  key: string
  label: string
  amount: Money
  count: number
}

/** Totals per calendar month, oldest first, with empty months filled in. */
export function spendingByMonth(expenses: Expense[], months: string[]): MonthlyTotal[] {
  const totals = new Map<string, { amount: Money; count: number }>()

  for (const expense of expenses) {
    const key = monthKey(expense.date)
    const current = totals.get(key) ?? { amount: 0, count: 0 }
    totals.set(key, { amount: current.amount + expense.amount, count: current.count + 1 })
  }

  return months.map((key) => ({
    key,
    label: monthKeyLabel(key),
    amount: totals.get(key)?.amount ?? 0,
    count: totals.get(key)?.count ?? 0,
  }))
}

export interface SpenderTotal {
  userId: string
  amount: Money
  percentage: number
}

/** Ranked by what each person actually *paid*, not what they consumed. */
export function topSpenders(expenses: Expense[]): SpenderTotal[] {
  const totals = new Map<string, Money>()

  for (const expense of expenses) {
    for (const [userId, amount] of paymentsByUser(expense)) {
      totals.set(userId, (totals.get(userId) ?? 0) + amount)
    }
  }

  const total = [...totals.values()].reduce((sum, amount) => sum + amount, 0)
  return [...totals.entries()]
    .map(([userId, amount]) => ({
      userId,
      amount,
      percentage: total === 0 ? 0 : Math.round((amount / total) * 1000) / 10,
    }))
    .sort((a, b) => b.amount - a.amount)
}

export function largestExpenses(expenses: Expense[], limit = 5): Expense[] {
  return [...expenses].sort((a, b) => b.amount - a.amount).slice(0, limit)
}

export function averageExpense(expenses: Expense[]): Money {
  if (expenses.length === 0) return 0
  return Math.round(totalSpending(expenses) / expenses.length)
}

/**
 * Percentage change between two periods, or null when there is no prior
 * figure to compare against (avoids showing a meaningless "+100%").
 */
export function percentageChange(current: Money, previous: Money): number | null {
  if (previous === 0) return null
  return Math.round(((current - previous) / previous) * 1000) / 10
}
