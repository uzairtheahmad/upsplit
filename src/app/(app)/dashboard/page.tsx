'use client'

import { ArrowRight, Plus, Users, Wallet } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'

import { CategoryChart } from '@/components/charts/charts'
import { BalanceSummary } from '@/components/dashboard/balance-summary'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { RecentActivity } from '@/components/dashboard/recent-activity'
import { useAppActions } from '@/components/layout/app-actions'
import { GroupCard } from '@/components/groups/group-card'
import { PageContainer, SectionHeader } from '@/components/shared/page-header'
import { ChartSkeleton, EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  spendingByCategory,
  spendingByMonth,
  totalSpending,
} from '@/lib/analytics/spending'
import {
  useActivity,
  useAllGroups,
  useCurrentUser,
  useCurrentUserId,
  useGlobalLedger,
  useGroupMembers,
  useMyExpenses,
  useMyGroups,
  useUserMap,
} from '@/hooks/use-app-data'
import { greeting, recentMonthKeys } from '@/lib/utils/dates'

// Recharts is heavy and below the fold — load it only once the page is up.
const SpendingTrendChart = dynamic(
  () => import('@/components/charts/charts').then((mod) => mod.SpendingTrendChart),
  { ssr: false, loading: () => <ChartSkeleton className="h-[200px]" /> },
)

function GroupOverview() {
  const ledger = useGlobalLedger()
  const actions = useAppActions()

  if (ledger.perGroup.length === 0) {
    return (
      <EmptyState
        icon={Users}
        title="No groups yet"
        description="Create a group for a trip, a flat or a friend circle, then start adding what everyone spends."
        action={
          <Button onClick={actions.createGroup}>
            <Plus aria-hidden />
            Create a group
          </Button>
        }
      />
    )
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ledger.perGroup
        .filter((entry) => !entry.group.archivedAt)
        .slice(0, 6)
        .map((entry) => (
          <GroupCardConnected key={entry.group.id} groupId={entry.group.id} />
        ))}
    </div>
  )
}

function GroupCardConnected({ groupId }: { groupId: string }) {
  const ledger = useGlobalLedger()
  const members = useGroupMembers(groupId)
  const entry = ledger.perGroup.find((candidate) => candidate.group.id === groupId)
  if (!entry) return null

  return (
    <GroupCard
      group={entry.group}
      members={members.map((member) => member.user)}
      myNet={entry.myNet}
      totalSpend={entry.totalSpend}
      expenseCount={entry.expenses.length}
      lastExpense={entry.expenses[0]}
    />
  )
}

export default function DashboardPage() {
  const user = useCurrentUser()
  const currentUserId = useCurrentUserId()
  const ledger = useGlobalLedger()
  const groups = useMyGroups({ includeArchived: true })
  const allGroups = useAllGroups()
  const expenses = useMyExpenses()
  const activity = useActivity()
  const users = useUserMap()

  const currency = groups[0]?.currency ?? 'PKR'
  const months = recentMonthKeys(6)
  const monthly = spendingByMonth(expenses, months)
  const categories = spendingByCategory(expenses)
  const total = totalSpending(expenses)

  return (
    <PageContainer>
      <header className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
          {greeting()}, {user?.name.split(' ')[0] ?? 'there'}
        </h1>
        <p className="text-sm text-muted-foreground">
          Here’s where your shared expenses stand today.
        </p>
      </header>

      <BalanceSummary
        youOwe={ledger.youOwe}
        youAreOwed={ledger.youAreOwed}
        net={ledger.net}
        activeGroups={ledger.activeGroups}
        currency={currency}
        peopleCount={ledger.people.length}
      />

      <QuickActions />

      <section className="space-y-3">
        <SectionHeader
          title="Your groups"
          description="Balances update the moment an expense changes."
          action={
            <Button asChild variant="ghost" size="sm">
              <Link href="/groups">
                View all
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          }
        />
        <GroupOverview />
      </section>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)]">
        <section className="min-w-0 space-y-3">
          <SectionHeader
            title="Spending over time"
            description="Settlements between members aren’t counted as spending."
          />
          <Card>
            <CardContent className="p-4 sm:p-5">
              {expenses.length === 0 ? (
                <EmptyState
                  icon={Wallet}
                  title="Nothing to chart yet"
                  description="Add an expense and your spending trend will appear here."
                  compact
                  className="border-0 bg-transparent"
                />
              ) : (
                <SpendingTrendChart data={monthly} currency={currency} />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4 sm:p-5">
              <h3 className="mb-4 text-sm font-semibold">Where it goes</h3>
              <CategoryChart data={categories} currency={currency} total={total} />
            </CardContent>
          </Card>
        </section>

        <section className="min-w-0 space-y-3">
          <SectionHeader
            title="Recent activity"
            action={
              <Button asChild variant="ghost" size="sm">
                <Link href="/activity">
                  View all
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
            }
          />
          <Card className="overflow-hidden">
            <RecentActivity
              events={activity}
              users={users}
              groups={allGroups}
              currentUserId={currentUserId}
              limit={9}
            />
          </Card>
        </section>
      </div>
    </PageContainer>
  )
}
