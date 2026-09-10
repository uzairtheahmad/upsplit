'use client'

import { ArrowUpDown, Search, SlidersHorizontal, X } from 'lucide-react'
import * as React from 'react'

import { UserAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import { Checkbox, Popover, PopoverContent, PopoverTrigger } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { CATEGORY_LIST } from '@/constants/categories'
import { paymentsByUser } from '@/lib/expenses/calculate-split'
import { parseMoney } from '@/lib/money/money'
import {
  DATE_RANGE_LABELS,
  isWithinRange,
  resolveDateRange,
  type DateRangeKey,
} from '@/lib/utils/dates'
import type { CurrencyCode, Expense, ExpenseCategory, User } from '@/types'

export interface ExpenseFilterState {
  search: string
  range: DateRangeKey
  categories: ExpenseCategory[]
  payerIds: string[]
  minAmount: string
  maxAmount: string
  sort: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
}

export const EMPTY_FILTERS: ExpenseFilterState = {
  search: '',
  range: 'all_time',
  categories: [],
  payerIds: [],
  minAmount: '',
  maxAmount: '',
  sort: 'date_desc',
}

const SORT_LABELS: Record<ExpenseFilterState['sort'], string> = {
  date_desc: 'Newest first',
  date_asc: 'Oldest first',
  amount_desc: 'Largest first',
  amount_asc: 'Smallest first',
}

/**
 * Apply the filter state to a list of expenses.
 *
 * Kept as a pure function next to the control so the two can't drift, and so
 * the same predicate can be reused by any view that needs it.
 */
export function applyExpenseFilters(
  expenses: Expense[],
  filters: ExpenseFilterState,
  users: Map<string, User>,
  currency: CurrencyCode = 'PKR',
): Expense[] {
  const range = resolveDateRange(filters.range)
  const min = filters.minAmount ? parseMoney(filters.minAmount, currency) : null
  const max = filters.maxAmount ? parseMoney(filters.maxAmount, currency) : null
  const needle = filters.search.trim().toLowerCase()

  const filtered = expenses.filter((expense) => {
    if (!isWithinRange(expense.date, range)) return false
    if (filters.categories.length && !filters.categories.includes(expense.category)) return false

    if (filters.payerIds.length) {
      const payers = paymentsByUser(expense)
      if (!filters.payerIds.some((userId) => payers.has(userId))) return false
    }

    if (min !== null && expense.amount < min) return false
    if (max !== null && expense.amount > max) return false

    if (needle) {
      const involved = new Set([
        ...expense.payments.map((payment) => payment.userId),
        ...expense.participants.map((participant) => participant.userId),
      ])
      const names = [...involved]
        .map((id) => users.get(id)?.name.toLowerCase() ?? '')
        .join(' ')
      const haystack = `${expense.description} ${expense.notes ?? ''} ${expense.category} ${names}`.toLowerCase()
      if (!haystack.includes(needle)) return false
    }

    return true
  })

  switch (filters.sort) {
    case 'date_asc':
      return filtered.sort((a, b) => a.date.localeCompare(b.date))
    case 'amount_desc':
      return filtered.sort((a, b) => b.amount - a.amount)
    case 'amount_asc':
      return filtered.sort((a, b) => a.amount - b.amount)
    default:
      return filtered.sort((a, b) => b.date.localeCompare(a.date))
  }
}

function countActiveFilters(filters: ExpenseFilterState): number {
  return (
    (filters.range !== 'all_time' ? 1 : 0) +
    filters.categories.length +
    filters.payerIds.length +
    (filters.minAmount ? 1 : 0) +
    (filters.maxAmount ? 1 : 0)
  )
}

interface ExpenseFiltersProps {
  filters: ExpenseFilterState
  onChange: (filters: ExpenseFilterState) => void
  people: User[]
  currentUserId: string
  currency: CurrencyCode
  resultCount: number
  totalCount: number
}

export function ExpenseFilters({
  filters,
  onChange,
  people,
  currentUserId,
  currency,
  resultCount,
  totalCount,
}: ExpenseFiltersProps) {
  const activeCount = countActiveFilters(filters)

  function patch(changes: Partial<ExpenseFilterState>) {
    onChange({ ...filters, ...changes })
  }

  function toggleCategory(category: ExpenseCategory) {
    patch({
      categories: filters.categories.includes(category)
        ? filters.categories.filter((key) => key !== category)
        : [...filters.categories, category],
    })
  }

  function togglePayer(userId: string) {
    patch({
      payerIds: filters.payerIds.includes(userId)
        ? filters.payerIds.filter((id) => id !== userId)
        : [...filters.payerIds, userId],
    })
  }

  return (
    <div className="space-y-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            type="search"
            value={filters.search}
            onChange={(event) => patch({ search: event.target.value })}
            placeholder="Search expenses or people"
            aria-label="Search expenses"
            className="pl-8"
          />
        </div>

        <Select
          value={filters.range}
          onValueChange={(value) => patch({ range: value as DateRangeKey })}
        >
          <SelectTrigger className="w-auto min-w-36" aria-label="Date range">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(DATE_RANGE_LABELS) as DateRangeKey[])
              .filter((key) => key !== 'custom')
              .map((key) => (
                <SelectItem key={key} value={key}>
                  {DATE_RANGE_LABELS[key]}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="default">
              <SlidersHorizontal aria-hidden />
              Filters
              {activeCount > 0 ? (
                <Badge variant="primary" className="ml-0.5">
                  {activeCount}
                </Badge>
              ) : null}
            </Button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <div className="grid max-h-44 grid-cols-1 gap-0.5 overflow-y-auto">
                {CATEGORY_LIST.map((category) => {
                  const id = `filter-category-${category.key}`
                  return (
                    <label
                      key={category.key}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/60"
                    >
                      <Checkbox
                        id={id}
                        checked={filters.categories.includes(category.key)}
                        onCheckedChange={() => toggleCategory(category.key)}
                      />
                      <category.icon
                        className="size-4"
                        style={{ color: `var(--chart-${category.chart})` }}
                        aria-hidden
                      />
                      {category.label}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Paid by</Label>
              <div className="grid max-h-36 gap-0.5 overflow-y-auto">
                {people.map((person) => {
                  const id = `filter-payer-${person.id}`
                  return (
                    <label
                      key={person.id}
                      htmlFor={id}
                      className="flex cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-sm hover:bg-accent/60"
                    >
                      <Checkbox
                        id={id}
                        checked={filters.payerIds.includes(person.id)}
                        onCheckedChange={() => togglePayer(person.id)}
                      />
                      <UserAvatar user={person} size="xs" />
                      {person.id === currentUserId ? 'You' : person.name}
                    </label>
                  )
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Amount</Label>
              <div className="flex items-center gap-2">
                <Input
                  inputMode="decimal"
                  value={filters.minAmount}
                  onChange={(event) => patch({ minAmount: event.target.value })}
                  placeholder="Min"
                  aria-label="Minimum amount"
                  className="tabular h-8"
                />
                <span className="text-xs text-muted-foreground" aria-hidden>
                  to
                </span>
                <Input
                  inputMode="decimal"
                  value={filters.maxAmount}
                  onChange={(event) => patch({ maxAmount: event.target.value })}
                  placeholder="Max"
                  aria-label="Maximum amount"
                  className="tabular h-8"
                />
              </div>
              <p className="text-[11px] text-muted-foreground">Amounts in {currency}.</p>
            </div>

            {activeCount > 0 ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full"
                onClick={() => onChange({ ...EMPTY_FILTERS, search: filters.search, sort: filters.sort })}
              >
                <X aria-hidden />
                Clear filters
              </Button>
            ) : null}
          </PopoverContent>
        </Popover>

        <Select
          value={filters.sort}
          onValueChange={(value) => patch({ sort: value as ExpenseFilterState['sort'] })}
        >
          <SelectTrigger className="w-auto min-w-36" aria-label="Sort expenses">
            <span className="flex items-center gap-2">
              <ArrowUpDown className="size-4 text-muted-foreground" aria-hidden />
              <SelectValue />
            </span>
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_LABELS) as ExpenseFilterState['sort'][]).map((key) => (
              <SelectItem key={key} value={key}>
                {SORT_LABELS[key]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {activeCount > 0 || filters.search ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          <span aria-live="polite">
            Showing {resultCount} of {totalCount} expenses
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs"
            onClick={() => onChange(EMPTY_FILTERS)}
          >
            <X aria-hidden />
            Clear all
          </Button>
        </div>
      ) : null}
    </div>
  )
}
