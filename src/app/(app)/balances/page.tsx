'use client'

import { ArrowLeftRight, Scale } from 'lucide-react'
import * as React from 'react'

import {
  BalanceList,
  TransactionBreakdownDialog,
} from '@/components/balances/balance-components'
import { BalanceCard } from '@/components/dashboard/balance-summary'
import { useAppActions } from '@/components/layout/app-actions'
import { Amount } from '@/components/shared/money'
import { PageContainer, PageHeader, SectionHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { groupColor, groupIcon } from '@/constants/categories'
import {
  useCurrentUser,
  useCurrentUserId,
  useGlobalLedger,
  useUserMap,
} from '@/hooks/use-app-data'
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

export default function BalancesPage() {
  const ledger = useGlobalLedger()
  const users = useUserMap()
  const currentUser = useCurrentUser()
  const currentUserId = useCurrentUserId()
  const actions = useAppActions()

  const [inspecting, setInspecting] = React.useState<{ userId: string; groupId: string } | null>(
    null,
  )

  const currency = ledger.perGroup[0]?.group.currency ?? 'PKR'

  // The breakdown is always scoped to one group, because netting a balance
  // across groups would merge obligations the user never agreed to merge.
  const inspectedGroup = ledger.perGroup.find((entry) => entry.group.id === inspecting?.groupId)

  return (
    <PageContainer>
      <PageHeader
        title="Balances"
        description="Who owes whom, and exactly which expenses got you there."
        actions={
          <Button onClick={() => actions.recordSettlement()}>
            <ArrowLeftRight aria-hidden />
            Settle up
          </Button>
        }
      />

      <section className="grid gap-3 sm:grid-cols-3">
        <BalanceCard
          label="Your net balance"
          icon={Scale}
          tone={ledger.net > 0 ? 'positive' : ledger.net < 0 ? 'negative' : 'neutral'}
          value={<Amount value={ledger.net} currency={currency} size="2xl" tone="auto" signed />}
          detail={
            ledger.net > 0
              ? 'in your favour across all groups'
              : ledger.net < 0
                ? 'you’re behind across all groups'
                : 'everything is square'
          }
        />
        <BalanceCard
          label="You owe"
          icon={ArrowUpRight}
          tone={ledger.youOwe > 0 ? 'negative' : 'neutral'}
          value={
            <Amount
              value={ledger.youOwe}
              currency={currency}
              size="2xl"
              tone={ledger.youOwe > 0 ? 'negative' : 'neutral'}
            />
          }
        />
        <BalanceCard
          label="You’re owed"
          icon={ArrowDownLeft}
          tone={ledger.youAreOwed > 0 ? 'positive' : 'neutral'}
          value={
            <Amount
              value={ledger.youAreOwed}
              currency={currency}
              size="2xl"
              tone={ledger.youAreOwed > 0 ? 'positive' : 'neutral'}
            />
          }
        />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="By person"
          description="Combined across every group you share with them."
        />
        <BalanceList
          entries={ledger.people}
          users={users}
          currency={currency}
          onSettle={(userId, amount) => {
            // Settle against the group where the largest part of the balance sits.
            const best = ledger.perGroup
              .map((entry) => ({
                groupId: entry.group.id,
                edge: entry.pairwise.find(
                  (candidate) =>
                    (candidate.fromUserId === currentUserId && candidate.toUserId === userId) ||
                    (candidate.fromUserId === userId && candidate.toUserId === currentUserId),
                ),
              }))
              .filter((entry) => entry.edge)
              .sort((a, b) => (b.edge?.amount ?? 0) - (a.edge?.amount ?? 0))[0]

            if (!best?.edge) return
            actions.recordSettlement({
              groupId: best.groupId,
              fromUserId: best.edge.fromUserId,
              toUserId: best.edge.toUserId,
              amount: best.edge.amount,
            })
          }}
          onInspect={(userId) => {
            const group = ledger.perGroup.find((entry) =>
              entry.pairwise.some(
                (edge) => edge.fromUserId === userId || edge.toUserId === userId,
              ),
            )
            if (group) setInspecting({ userId, groupId: group.group.id })
          }}
          emptyDescription="Nobody owes you and you don’t owe anyone. Add an expense to change that."
        />
      </section>

      <section className="space-y-3">
        <SectionHeader title="By group" description="Your position in each group." />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ledger.perGroup.map((entry) => {
            const Icon = groupIcon(entry.group.icon)
            return (
              <Card key={entry.group.id}>
                <CardContent className="flex items-center gap-3 p-4">
                  <span
                    className={cn(
                      'flex size-10 shrink-0 items-center justify-center rounded-lg',
                      groupColor(entry.group.color).chip,
                    )}
                    aria-hidden
                  >
                    <Icon className="size-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{entry.group.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.myNet > 0
                        ? 'you’re owed'
                        : entry.myNet < 0
                          ? 'you owe'
                          : 'all settled'}
                    </p>
                  </div>
                  <Amount
                    value={entry.myNet}
                    currency={entry.group.currency}
                    size="base"
                    tone="auto"
                    absolute
                  />
                </CardContent>
              </Card>
            )
          })}
        </div>
      </section>

      {currentUser ? (
        <TransactionBreakdownDialog
          open={inspecting !== null}
          onOpenChange={(open) => !open && setInspecting(null)}
          viewer={currentUser}
          other={inspecting ? users.get(inspecting.userId) : undefined}
          expenses={inspectedGroup?.expenses ?? []}
          settlements={inspectedGroup?.settlements ?? []}
          currency={inspectedGroup?.group.currency ?? currency}
          onSettle={() => {
            if (!inspecting || !inspectedGroup) return
            const edge = inspectedGroup.pairwise.find(
              (candidate) =>
                (candidate.fromUserId === currentUserId &&
                  candidate.toUserId === inspecting.userId) ||
                (candidate.fromUserId === inspecting.userId &&
                  candidate.toUserId === currentUserId),
            )
            if (!edge) return
            setInspecting(null)
            actions.recordSettlement({
              groupId: inspectedGroup.group.id,
              fromUserId: edge.fromUserId,
              toUserId: edge.toUserId,
              amount: edge.amount,
            })
          }}
        />
      ) : null}
    </PageContainer>
  )
}
