'use client'

import { ArrowDownLeft, ArrowUpRight, Scale } from 'lucide-react'

import { Amount } from '@/components/shared/money'
import { UserAvatar } from '@/components/ui/avatar'
import { Separator } from '@/components/ui/misc'
import { SPLIT_METHOD_LABELS } from '@/lib/expenses/calculate-split'
import type { UserImpact } from '@/lib/expenses/calculate-split'
import { formatMoney } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode, Money, SplitMethod, User } from '@/types'

interface SplitPreviewProps {
  total: Money
  currency: CurrencyCode
  method: SplitMethod
  shares: Array<{ userId: string; amount: Money }>
  impact: UserImpact[]
  adjustment: Money
  members: User[]
  currentUserId: string
  className?: string
}

/**
 * The live preview.
 *
 * Two questions, answered as the user types: what does each person owe, and
 * what does this do to everyone's balance. The adjustment line at the bottom
 * is the zero-sum proof — it should always read zero, and if it ever doesn't,
 * the user finds out here rather than after the expense is saved.
 */
export function SplitPreview({
  total,
  currency,
  method,
  shares,
  impact,
  adjustment,
  members,
  currentUserId,
  className,
}: SplitPreviewProps) {
  const memberMap = new Map(members.map((member) => [member.id, member]))
  const impactMap = new Map(impact.map((entry) => [entry.userId, entry]))
  const myImpact = impactMap.get(currentUserId)

  // Everyone the expense touches: participants plus any payer outside the split.
  const involvedIds = [
    ...shares.map((share) => share.userId),
    ...impact.map((entry) => entry.userId).filter((id) => !shares.some((s) => s.userId === id)),
  ]

  return (
    <aside
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-border bg-muted/40',
        className,
      )}
      aria-live="polite"
    >
      <div className="space-y-3 p-4">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm font-semibold tracking-tight">Summary</h3>
          <span className="text-xs text-muted-foreground">{SPLIT_METHOD_LABELS[method]}</span>
        </div>

        <div className="flex items-baseline justify-between gap-3">
          <span className="text-xs text-muted-foreground">Total</span>
          <Amount value={total} currency={currency} size="xl" />
        </div>

        <div className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
          <span>Split between</span>
          <span className="font-medium text-foreground">
            {shares.length} {shares.length === 1 ? 'person' : 'people'}
          </span>
        </div>
      </div>

      <Separator />

      {involvedIds.length === 0 || total === 0 ? (
        <p className="px-4 py-6 text-center text-xs text-muted-foreground">
          Enter an amount and pick who’s involved to see the split.
        </p>
      ) : (
        <>
          <ul className="divide-y divide-border/60">
            {involvedIds.map((userId) => {
              const member = memberMap.get(userId)
              if (!member) return null
              const share = shares.find((candidate) => candidate.userId === userId)?.amount ?? 0
              const entry = impactMap.get(userId)
              const net = entry?.net ?? 0

              return (
                <li key={userId} className="flex items-center gap-2.5 px-4 py-2.5">
                  <UserAvatar user={member} size="xs" highlighted={userId === currentUserId} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">
                      {userId === currentUserId ? 'You' : member.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {share > 0 ? `owes ${formatMoney(share, currency)}` : 'not in the split'}
                      {entry && entry.paid > 0 ? ` · paid ${formatMoney(entry.paid, currency)}` : ''}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1">
                    {net !== 0 ? (
                      net > 0 ? (
                        <ArrowDownLeft className="size-3.5 text-positive" aria-hidden />
                      ) : (
                        <ArrowUpRight className="size-3.5 text-negative" aria-hidden />
                      )
                    ) : null}
                    <Amount value={net} currency={currency} size="sm" tone="auto" signed />
                  </span>
                </li>
              )
            })}
          </ul>

          <Separator />

          <div className="space-y-2 p-4">
            {myImpact ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-medium text-muted-foreground">Your net</span>
                <span className="text-right">
                  <Amount value={myImpact.net} currency={currency} size="lg" tone="auto" signed />
                  <span className="block text-[11px] text-muted-foreground">
                    {myImpact.net > 0
                      ? 'you’ll be owed this'
                      : myImpact.net < 0
                        ? 'you’ll owe this'
                        : 'no change for you'}
                  </span>
                </span>
              </div>
            ) : null}

            <div
              className={cn(
                'flex items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-xs',
                adjustment === 0
                  ? 'bg-positive-muted text-positive'
                  : 'bg-negative-muted text-negative',
              )}
            >
              <span className="inline-flex items-center gap-1.5 font-medium">
                <Scale className="size-3.5" aria-hidden />
                Adjustment
              </span>
              <span className="tabular font-semibold">{formatMoney(adjustment, currency)}</span>
            </div>
          </div>
        </>
      )}
    </aside>
  )
}
