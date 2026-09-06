'use client'

import {
  ArrowDownLeft,
  ArrowUpRight,
  Scale,
  Users,
  type LucideIcon,
} from 'lucide-react'
import * as React from 'react'

import { Amount } from '@/components/shared/money'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode, Money } from '@/types'

interface BalanceCardProps {
  label: string
  value: React.ReactNode
  icon: LucideIcon
  tone?: 'neutral' | 'positive' | 'negative'
  /** Secondary line — a trend, a count, or an explanation. */
  detail?: string
  className?: string
}

export function BalanceCard({ label, value, icon: Icon, tone = 'neutral', detail, className }: BalanceCardProps) {
  return (
    <Card className={cn('transition-shadow hover:card-shadow-lg', className)}>
      <CardContent className="space-y-2 p-4 sm:p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <span
            className={cn(
              'flex size-7 items-center justify-center rounded-lg',
              tone === 'positive'
                ? 'bg-positive-muted text-positive'
                : tone === 'negative'
                  ? 'bg-negative-muted text-negative'
                  : 'bg-muted text-muted-foreground',
            )}
            aria-hidden
          >
            <Icon className="size-4" />
          </span>
        </div>
        <div>{value}</div>
        {detail ? <p className="text-xs text-muted-foreground">{detail}</p> : null}
      </CardContent>
    </Card>
  )
}

interface BalanceSummaryProps {
  youOwe: Money
  youAreOwed: Money
  net: Money
  activeGroups: number
  currency: CurrencyCode
  peopleCount: number
}

/**
 * The four headline numbers.
 *
 * "You owe" and "you're owed" are shown separately rather than only as a net,
 * because a net of zero can hide two large opposing debts that still need
 * settling.
 */
export function BalanceSummary({
  youOwe,
  youAreOwed,
  net,
  activeGroups,
  currency,
  peopleCount,
}: BalanceSummaryProps) {
  return (
    <section aria-label="Your balance summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <BalanceCard
        label="You owe"
        icon={ArrowUpRight}
        tone={youOwe > 0 ? 'negative' : 'neutral'}
        value={
          <Amount
            value={youOwe}
            currency={currency}
            size="2xl"
            tone={youOwe > 0 ? 'negative' : 'neutral'}
          />
        }
        detail={
          youOwe > 0
            ? `across ${peopleCount} ${peopleCount === 1 ? 'person' : 'people'}`
            : 'nothing outstanding'
        }
      />

      <BalanceCard
        label="You’re owed"
        icon={ArrowDownLeft}
        tone={youAreOwed > 0 ? 'positive' : 'neutral'}
        value={
          <Amount
            value={youAreOwed}
            currency={currency}
            size="2xl"
            tone={youAreOwed > 0 ? 'positive' : 'neutral'}
          />
        }
        detail={youAreOwed > 0 ? 'waiting to be settled' : 'nobody owes you right now'}
      />

      <BalanceCard
        label="Net balance"
        icon={Scale}
        tone={net > 0 ? 'positive' : net < 0 ? 'negative' : 'neutral'}
        value={<Amount value={net} currency={currency} size="2xl" tone="auto" signed />}
        detail={
          net > 0
            ? 'in your favour overall'
            : net < 0
              ? 'you’re behind overall'
              : 'you’re all square'
        }
      />

      <BalanceCard
        label="Active groups"
        icon={Users}
        value={<span className="tabular text-2xl font-semibold">{activeGroups}</span>}
        detail={`${peopleCount} ${peopleCount === 1 ? 'person' : 'people'} with an open balance`}
      />
    </section>
  )
}
