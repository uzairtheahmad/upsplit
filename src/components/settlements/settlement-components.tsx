'use client'

import { ArrowRight, CheckCircle2, Handshake, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Amount } from '@/components/shared/money'
import { EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/money/money'
import { friendlyDate } from '@/lib/utils/dates'
import { services } from '@/services'
import type { CurrencyCode, Group, SettlementSuggestion, Settlement, User } from '@/types'

/**
 * One suggested transfer.
 *
 * Suggestions come out of the simplification pass, so the two people named
 * here may never have shared an expense directly — the copy says what the
 * payment achieves rather than implying a direct debt.
 */
function SettlementSuggestionCard({
  suggestion,
  users,
  currency,
  currentUserId,
  onRecord,
}: {
  suggestion: SettlementSuggestion
  users: Map<string, User>
  currency: CurrencyCode
  currentUserId: string
  onRecord: () => void
}) {
  const from = users.get(suggestion.fromUserId)
  const to = users.get(suggestion.toUserId)
  if (!from || !to) return null

  const involvesMe =
    suggestion.fromUserId === currentUserId || suggestion.toUserId === currentUserId

  return (
    <li className="flex flex-wrap items-center gap-3 px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <UserAvatar user={from} size="sm" highlighted={suggestion.fromUserId === currentUserId} />
        <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
        <UserAvatar user={to} size="sm" highlighted={suggestion.toUserId === currentUserId} />

        <p className="min-w-0 flex-1 truncate text-sm">
          <span className="font-medium">
            {suggestion.fromUserId === currentUserId ? 'You' : from.name.split(' ')[0]}
          </span>
          {/* "You pay Ali" but "Ali pays you" — the verb agrees with the sender. */}
          <span className="text-muted-foreground">
            {suggestion.fromUserId === currentUserId ? ' pay ' : ' pays '}
          </span>
          <span className="font-medium">
            {suggestion.toUserId === currentUserId ? 'you' : to.name.split(' ')[0]}
          </span>
        </p>
      </div>

      <div className="flex shrink-0 items-center gap-2.5">
        <Amount value={suggestion.amount} currency={currency} size="base" />
        <Button variant={involvesMe ? 'default' : 'outline'} size="sm" onClick={onRecord}>
          Mark settled
        </Button>
      </div>
    </li>
  )
}

export function SettlementSuggestions({
  suggestions,
  users,
  currency,
  currentUserId,
  onRecord,
  /** How many transfers a naive pair-by-pair settle-up would have needed. */
  pairwiseCount,
}: {
  suggestions: SettlementSuggestion[]
  users: Map<string, User>
  currency: CurrencyCode
  currentUserId: string
  onRecord: (suggestion: SettlementSuggestion) => void
  pairwiseCount?: number
}) {
  if (suggestions.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Nothing left to settle"
        description="Every balance in this group is at zero."
        compact
      />
    )
  }

  const saved = pairwiseCount ? Math.max(0, pairwiseCount - suggestions.length) : 0

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card card-shadow">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <p className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="size-3.5 text-primary" aria-hidden />
          {suggestions.length} {suggestions.length === 1 ? 'payment' : 'payments'} clears everyone
        </p>
        {saved > 0 ? (
          <Badge variant="positive">
            {saved} fewer {saved === 1 ? 'transfer' : 'transfers'}
          </Badge>
        ) : null}
      </div>

      <ul className="divide-y divide-border">
        {suggestions.map((suggestion) => (
          <SettlementSuggestionCard
            key={`${suggestion.fromUserId}-${suggestion.toUserId}-${suggestion.amount}`}
            suggestion={suggestion}
            users={users}
            currency={currency}
            currentUserId={currentUserId}
            onRecord={() => onRecord(suggestion)}
          />
        ))}
      </ul>
    </div>
  )
}

export function SettlementList({
  settlements,
  users,
  groups,
  currentUserId,
  showGroup = false,
}: {
  settlements: Settlement[]
  users: Map<string, User>
  groups?: Group[]
  currentUserId: string
  showGroup?: boolean
}) {
  if (settlements.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="No settlements recorded"
        description="When someone pays back what they owe, record it here and balances update."
        compact
      />
    )
  }

  const groupMap = new Map((groups ?? []).map((group) => [group.id, group]))

  async function handleUndo(settlement: Settlement) {
    try {
      await services.settlements.remove(settlement.id)
      toast.success('Settlement removed', { description: 'Balances have been restored.' })
    } catch (error) {
      toast.error('Could not remove it', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-shadow">
      {settlements.map((settlement) => {
        const from = users.get(settlement.fromUserId)
        const to = users.get(settlement.toUserId)
        if (!from || !to) return null

        return (
          <li key={settlement.id} className="flex items-center gap-3 px-4 py-3">
            <span
              className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-positive-muted text-positive"
              aria-hidden
            >
              <Handshake className="size-4" />
            </span>

            <div className="min-w-0 flex-1">
              <p className="truncate text-sm">
                <span className="font-medium">
                  {settlement.fromUserId === currentUserId ? 'You' : from.name.split(' ')[0]}
                </span>
                <span className="text-muted-foreground"> paid </span>
                <span className="font-medium">
                  {settlement.toUserId === currentUserId ? 'you' : to.name.split(' ')[0]}
                </span>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {friendlyDate(settlement.date)}
                {showGroup && groupMap.get(settlement.groupId)
                  ? ` · ${groupMap.get(settlement.groupId)!.name}`
                  : ''}
                {settlement.note ? ` · ${settlement.note}` : ''}
              </p>
            </div>

            <span className="tabular shrink-0 text-sm font-semibold">
              {formatMoney(settlement.amount, settlement.currency)}
            </span>

            <Button
              variant="ghost"
              size="icon-sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => handleUndo(settlement)}
              aria-label={`Remove the settlement from ${from.name} to ${to.name}`}
            >
              <Trash2 aria-hidden />
            </Button>
          </li>
        )
      })}
    </ul>
  )
}
