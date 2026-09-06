'use client'

import { ArrowRight, Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { CategoryChart } from '@/components/charts/charts'
import { BalanceList } from '@/components/balances/balance-components'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { ExpenseList } from '@/components/expenses/expense-list'
import { useAppActions } from '@/components/layout/app-actions'
import { SectionHeader } from '@/components/shared/page-header'
import { SettlementSuggestions } from '@/components/settlements/settlement-components'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { spendingByCategory } from '@/lib/analytics/spending'
import {
  useActivity,
  useAllGroups,
  useCurrentUserId,
  useGroup,
  useGroupLedger,
  useUserMap,
} from '@/hooks/use-app-data'
import { netBetween } from '@/lib/balances/calculate-balances'

export default function GroupOverviewPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const users = useUserMap()
  const allGroups = useAllGroups()
  const activity = useActivity(groupId)
  const currentUserId = useCurrentUserId()
  const actions = useAppActions()

  if (!group) return null

  const categories = spendingByCategory(ledger.expenses)

  // Everyone the signed-in user has an open balance with, in this group only.
  const people = ledger.members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => ({
      userId: member.userId,
      amount: netBetween(ledger.pairwise, currentUserId, member.userId),
    }))
    .filter((entry) => entry.amount !== 0)
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)]">
      <div className="min-w-0 space-y-6">
        <section className="space-y-3">
          <SectionHeader
            title="Recent expenses"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href={`/groups/${groupId}/expenses`}>
                  View all
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
          <ExpenseList
            expenses={ledger.expenses.slice(0, 6)}
            users={users}
            currentUserId={currentUserId}
            hrefFor={(expense) => `/groups/${groupId}/expenses/${expense.id}`}
            emptyDescription="Add the first expense and balances will appear straight away."
            emptyAction={
              <Button onClick={() => actions.addExpense(groupId)}>
                <Plus aria-hidden />
                Add expense
              </Button>
            }
          />
        </section>

        {ledger.expenses.length > 0 ? (
          <section className="space-y-3">
            <SectionHeader title="Where the money went" />
            <Card>
              <CardContent className="p-4 sm:p-5">
                <CategoryChart
                  data={categories}
                  currency={group.currency}
                  total={ledger.totalSpend}
                />
              </CardContent>
            </Card>
          </section>
        ) : null}
      </div>

      <div className="min-w-0 space-y-6">
        <section className="space-y-3">
          <SectionHeader title="Your balances here" />
          <BalanceList
            entries={people}
            users={users}
            currency={group.currency}
            onSettle={(userId, amount) =>
              actions.recordSettlement({
                groupId,
                fromUserId: amount > 0 ? userId : currentUserId,
                toUserId: amount > 0 ? currentUserId : userId,
                amount: Math.abs(amount),
              })
            }
            emptyDescription="You don’t owe anyone in this group and nobody owes you."
          />
        </section>

        <section className="space-y-3">
          <SectionHeader
            title="Settle up"
            description="The fewest payments that clear this group."
          />
          <SettlementSuggestions
            suggestions={ledger.suggestions}
            users={users}
            currency={group.currency}
            currentUserId={currentUserId}
            pairwiseCount={ledger.pairwise.length}
            onRecord={(suggestion) =>
              actions.recordSettlement({
                groupId,
                fromUserId: suggestion.fromUserId,
                toUserId: suggestion.toUserId,
                amount: suggestion.amount,
              })
            }
          />
        </section>

        <section className="space-y-3">
          <SectionHeader title="Activity" />
          <Card className="overflow-hidden">
            <RecentActivity
              events={activity}
              users={users}
              groups={allGroups}
              currentUserId={currentUserId}
              limit={6}
            />
          </Card>
        </section>
      </div>
    </div>
  )
}
