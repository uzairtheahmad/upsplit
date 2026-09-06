'use client'

import { Receipt, TrendingDown, TrendingUp, Wallet } from 'lucide-react'
import dynamic from 'next/dynamic'
import * as React from 'react'

import { CategoryChart } from '@/components/charts/charts'
import { BalanceCard } from '@/components/dashboard/balance-summary'
import { CategoryIconChip } from '@/components/expenses/form/category-selector'
import { Amount } from '@/components/shared/money'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { ChartSkeleton, EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  averageExpense,
  filterExpensesByRange,
  largestExpenses,
  percentageChange,
  spendingByCategory,
  spendingByMonth,
  topSpenders,
  totalSpending,
} from '@/lib/analytics/spending'
import { categoryMeta, chartColor } from '@/constants/categories'
import { useMyExpenses, useMyGroups, useUserMap } from '@/hooks/use-app-data'
import { formatMoney } from '@/lib/money/money'
import {
  DATE_RANGE_LABELS,
  friendlyDate,
  recentMonthKeys,
  resolveDateRange,
  type DateRangeKey,
} from '@/lib/utils/dates'

const MonthlySpendingChart = dynamic(
  () => import('@/components/charts/charts').then((mod) => mod.MonthlySpendingChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

export default function AnalyticsPage() {
  const allExpenses = useMyExpenses()
  const groups = useMyGroups({ includeArchived: true })
  const users = useUserMap()

  const [rangeKey, setRangeKey] = React.useState<DateRangeKey>('last_6_months')
  const [groupId, setGroupId] = React.useState<string>('all')

  const currency = groups[0]?.currency ?? 'PKR'

  const scoped = React.useMemo(
    () => (groupId === 'all' ? allExpenses : allExpenses.filter((e) => e.groupId === groupId)),
    [allExpenses, groupId],
  )

  const range = resolveDateRange(rangeKey)
  const expenses = filterExpensesByRange(scoped, range)

  const total = totalSpending(expenses)
  const categories = spendingByCategory(expenses)
  const months = spendingByMonth(scoped, recentMonthKeys(6))
  const spenders = topSpenders(expenses)
  const largest = largestExpenses(expenses, 5)
  const average = averageExpense(expenses)

  const thisMonth = months[months.length - 1]?.amount ?? 0
  const lastMonth = months[months.length - 2]?.amount ?? 0

  // The current month is almost always partial, so a month-over-month
  // percentage would overstate a "drop" that is really just the calendar.
  // Only show a percentage once the month is actually over.
  const today = new Date()
  const monthComplete =
    today.getDate() === new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate()
  const change = monthComplete ? percentageChange(thisMonth, lastMonth) : null

  return (
    <PageContainer>
      <PageHeader
        title="Analytics"
        description="What the group actually spent. Settlements between members are never counted."
        actions={
          <div className="flex flex-wrap gap-2">
            <Select value={groupId} onValueChange={setGroupId}>
              <SelectTrigger className="w-auto min-w-40" aria-label="Filter by group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All groups</SelectItem>
                {groups.map((group) => (
                  <SelectItem key={group.id} value={group.id}>
                    {group.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={rangeKey} onValueChange={(value) => setRangeKey(value as DateRangeKey)}>
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
          </div>
        }
      />

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BalanceCard
          label="Total spending"
          icon={Wallet}
          value={<Amount value={total} currency={currency} size="2xl" />}
          detail={DATE_RANGE_LABELS[rangeKey].toLowerCase()}
        />
        <BalanceCard
          label="Expenses"
          icon={Receipt}
          value={<span className="tabular text-2xl font-semibold">{expenses.length}</span>}
          detail={`${formatMoney(average, currency)} average`}
        />
        <BalanceCard
          label={monthComplete ? 'This month' : 'This month so far'}
          icon={change !== null && change >= 0 ? TrendingUp : TrendingDown}
          value={<Amount value={thisMonth} currency={currency} size="2xl" />}
          detail={
            change !== null
              ? `${change >= 0 ? 'up' : 'down'} ${Math.abs(change)}% on last month`
              : lastMonth > 0
                ? `last month totalled ${formatMoney(lastMonth, currency)}`
                : 'no previous month to compare'
          }
        />
        <BalanceCard
          label="Biggest category"
          icon={Wallet}
          value={
            <span className="text-2xl font-semibold">
              {categories[0] ? categories[0].percentage : 0}%
            </span>
          }
          detail={
            categories[0]
              ? `${categoryMeta(categories[0].category).label} · ${formatMoney(categories[0].amount, currency)}`
              : 'nothing recorded yet'
          }
        />
      </section>

      {expenses.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="Nothing in this range"
          description="Try a wider date range, or add some expenses to see the breakdown."
        />
      ) : (
        <>
          <Card>
            <CardHeader>
              <CardTitle>Monthly spending</CardTitle>
            </CardHeader>
            <CardContent>
              <MonthlySpendingChart data={months} currency={currency} />
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>By category</CardTitle>
              </CardHeader>
              <CardContent>
                <CategoryChart data={categories} currency={currency} total={total} />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Top spenders</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3.5">
                  {spenders.slice(0, 6).map((spender, index) => {
                    const person = users.get(spender.userId)
                    if (!person) return null
                    return (
                      <li key={spender.userId} className="space-y-1.5">
                        <div className="flex items-center gap-2.5">
                          <UserAvatar user={person} size="sm" />
                          <span className="min-w-0 flex-1 truncate text-sm">{person.name}</span>
                          <span className="tabular shrink-0 text-xs text-muted-foreground">
                            {spender.percentage}%
                          </span>
                          <span className="tabular w-24 shrink-0 text-right text-sm font-medium">
                            {formatMoney(spender.amount, currency)}
                          </span>
                        </div>
                        <Progress
                          value={spender.percentage}
                          indicatorColor={chartColor(index)}
                          aria-label={`${person.name} paid ${spender.percentage} percent of the total`}
                        />
                      </li>
                    )
                  })}
                </ul>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Largest expenses</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <ul className="divide-y divide-border">
                {largest.map((expense) => {
                  const group = groups.find((candidate) => candidate.id === expense.groupId)
                  return (
                    <li key={expense.id} className="flex items-center gap-3 px-5 py-3">
                      <CategoryIconChip category={expense.category} size="sm" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{expense.description}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {group?.name} · {friendlyDate(expense.date)}
                        </p>
                      </div>
                      <Amount value={expense.amount} currency={expense.currency} size="sm" />
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </PageContainer>
  )
}
