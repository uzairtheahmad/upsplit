'use client'

import { ArrowLeftRight } from 'lucide-react'

import { useAppActions } from '@/components/layout/app-actions'
import { PageContainer, PageHeader, SectionHeader } from '@/components/shared/page-header'
import {
  SettlementList,
  SettlementSuggestions,
} from '@/components/settlements/settlement-components'
import { Button } from '@/components/ui/button'
import { groupColor, groupIcon } from '@/constants/categories'
import {
  useAllGroups,
  useCurrentUserId,
  useGlobalLedger,
  useMySettlements,
  useUserMap,
} from '@/hooks/use-app-data'
import { optimizeSettlements } from '@/lib/settlements/optimize-settlements'
import { cn } from '@/lib/utils/cn'

export default function SettlementsPage() {
  const ledger = useGlobalLedger()
  const users = useUserMap()
  const groups = useAllGroups()
  const currentUserId = useCurrentUserId()
  const settlements = useMySettlements()
  const actions = useAppActions()

  // Suggestions are generated per group and never across groups — a debt in
  // one group cannot legitimately be cleared by a payment in another.
  const perGroup = ledger.perGroup
    .filter((entry) => !entry.group.archivedAt)
    .map((entry) => ({
      ...entry,
      suggestions: optimizeSettlements(entry.balances),
    }))
    .filter((entry) => entry.suggestions.length > 0)

  const totalSuggestions = perGroup.reduce((sum, entry) => sum + entry.suggestions.length, 0)

  return (
    <PageContainer>
      <PageHeader
        title="Settlements"
        description="The shortest set of payments that clears every balance."
        actions={
          <Button onClick={() => actions.recordSettlement()}>
            <ArrowLeftRight aria-hidden />
            Record settlement
          </Button>
        }
      />

      <section className="space-y-5">
        <SectionHeader
          title="Suggested payments"
          description={
            totalSuggestions > 0
              ? `${totalSuggestions} ${totalSuggestions === 1 ? 'payment' : 'payments'} would square up every group.`
              : 'Every group is already settled.'
          }
        />

        {perGroup.length === 0 ? (
          <SettlementSuggestions
            suggestions={[]}
            users={users}
            currency="PKR"
            currentUserId={currentUserId}
            onRecord={() => {}}
          />
        ) : (
          perGroup.map((entry) => {
            const Icon = groupIcon(entry.group.icon)
            return (
              <div key={entry.group.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      'flex size-6 items-center justify-center rounded-md',
                      groupColor(entry.group.color).chip,
                    )}
                    aria-hidden
                  >
                    <Icon className="size-3.5" />
                  </span>
                  <h3 className="text-sm font-medium">{entry.group.name}</h3>
                </div>

                <SettlementSuggestions
                  suggestions={entry.suggestions}
                  users={users}
                  currency={entry.group.currency}
                  currentUserId={currentUserId}
                  pairwiseCount={entry.pairwise.length}
                  onRecord={(suggestion) =>
                    actions.recordSettlement({
                      groupId: entry.group.id,
                      fromUserId: suggestion.fromUserId,
                      toUserId: suggestion.toUserId,
                      amount: suggestion.amount,
                    })
                  }
                />
              </div>
            )
          })
        )}
      </section>

      <section className="space-y-3">
        <SectionHeader
          title="Settlement history"
          description="Payments already recorded. These never count as spending."
        />
        <SettlementList
          settlements={settlements}
          users={users}
          groups={groups}
          currentUserId={currentUserId}
          showGroup
        />
      </section>
    </PageContainer>
  )
}
