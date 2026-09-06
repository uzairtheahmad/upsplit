'use client'

import { useParams } from 'next/navigation'
import * as React from 'react'

import {
  BalanceList,
  GroupBalanceTable,
  TransactionBreakdownDialog,
} from '@/components/balances/balance-components'
import { useAppActions } from '@/components/layout/app-actions'
import { SectionHeader } from '@/components/shared/page-header'
import {
  SettlementList,
  SettlementSuggestions,
} from '@/components/settlements/settlement-components'
import {
  useCurrentUser,
  useCurrentUserId,
  useGroup,
  useGroupLedger,
  useUserMap,
} from '@/hooks/use-app-data'
import { netBetween } from '@/lib/balances/calculate-balances'

export default function GroupBalancesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const users = useUserMap()
  const currentUser = useCurrentUser()
  const currentUserId = useCurrentUserId()
  const actions = useAppActions()

  const [inspecting, setInspecting] = React.useState<string | null>(null)

  if (!group || !currentUser) return null

  const people = ledger.members
    .filter((member) => member.userId !== currentUserId)
    .map((member) => ({
      userId: member.userId,
      amount: netBetween(ledger.pairwise, currentUserId, member.userId),
    }))
    .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount))

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <SectionHeader
          title="Your balances"
          description="Tap anyone to see the exact expenses behind the number."
        />
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
          onInspect={(userId) => setInspecting(userId)}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Suggested settlements"
          description="Debts are simplified across the whole group."
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
        <SectionHeader
          title="Everyone’s position"
          description="What each member paid, was charged, and where that leaves them."
        />
        <GroupBalanceTable
          balances={ledger.balances}
          users={users}
          currency={group.currency}
          currentUserId={currentUserId}
        />
      </section>

      <section className="space-y-3">
        <SectionHeader title="Settlement history" />
        <SettlementList
          settlements={ledger.settlements}
          users={users}
          currentUserId={currentUserId}
        />
      </section>

      <TransactionBreakdownDialog
        open={inspecting !== null}
        onOpenChange={(open) => !open && setInspecting(null)}
        viewer={currentUser}
        other={inspecting ? users.get(inspecting) : undefined}
        expenses={ledger.expenses}
        settlements={ledger.settlements}
        currency={group.currency}
        onSettle={() => {
          if (!inspecting) return
          const amount = netBetween(ledger.pairwise, currentUserId, inspecting)
          if (amount === 0) return
          setInspecting(null)
          actions.recordSettlement({
            groupId,
            fromUserId: amount > 0 ? inspecting : currentUserId,
            toUserId: amount > 0 ? currentUserId : inspecting,
            amount: Math.abs(amount),
          })
        }}
      />
    </div>
  )
}
