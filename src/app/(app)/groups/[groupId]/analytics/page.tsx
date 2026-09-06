'use client'

import { Receipt, Users, Wallet } from 'lucide-react'
import dynamic from 'next/dynamic'
import { useParams } from 'next/navigation'

import { CategoryChart } from '@/components/charts/charts'
import { BalanceCard } from '@/components/dashboard/balance-summary'
import { Amount } from '@/components/shared/money'
import { ChartSkeleton, EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/misc'
import { chartColor } from '@/constants/categories'
import { useGroup, useGroupLedger, useUserMap } from '@/hooks/use-app-data'
import {
  averageExpense,
  spendingByCategory,
  spendingByMonth,
  topSpenders,
} from '@/lib/analytics/spending'
import { formatMoney } from '@/lib/money/money'
import { recentMonthKeys } from '@/lib/utils/dates'

const MonthlySpendingChart = dynamic(
  () => import('@/components/charts/charts').then((mod) => mod.MonthlySpendingChart),
  { ssr: false, loading: () => <ChartSkeleton /> },
)

export default function GroupAnalyticsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const users = useUserMap()

  if (!group) return null

  const categories = spendingByCategory(ledger.expenses)
  const months = spendingByMonth(ledger.expenses, recentMonthKeys(6))
  const spenders = topSpenders(ledger.expenses)
  const average = averageExpense(ledger.expenses)

  if (ledger.expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title="Nothing to analyse yet"
        description="Add a few expenses and this group’s spending patterns will show up here."
      />
    )
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <BalanceCard
          label="Group spending"
          icon={Wallet}
          value={<Amount value={ledger.totalSpend} currency={group.currency} size="2xl" />}
          detail="settlements excluded"
        />
        <BalanceCard
          label="Expenses"
          icon={Receipt}
          value={<span className="tabular text-2xl font-semibold">{ledger.expenses.length}</span>}
          detail={`${formatMoney(average, group.currency)} average`}
        />
        <BalanceCard
          label="Per member"
          icon={Users}
          value={
            <Amount
              value={Math.round(ledger.totalSpend / Math.max(1, ledger.members.length))}
              currency={group.currency}
              size="2xl"
            />
          }
          detail={`across ${ledger.members.length} members`}
        />
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Monthly spending</CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlySpendingChart data={months} currency={group.currency} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>By category</CardTitle>
          </CardHeader>
          <CardContent>
            <CategoryChart
              data={categories}
              currency={group.currency}
              total={ledger.totalSpend}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Who paid the most</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3.5">
              {spenders.map((spender, index) => {
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
                        {formatMoney(spender.amount, group.currency)}
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
            <p className="mt-4 text-xs text-muted-foreground">
              This ranks what people <em>paid</em>, not what they consumed — see Balances for the
              net position.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
