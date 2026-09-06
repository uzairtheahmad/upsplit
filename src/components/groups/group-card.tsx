'use client'

import { Archive, ArrowRight, Receipt } from 'lucide-react'
import Link from 'next/link'

import { Amount } from '@/components/shared/money'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { groupColor, groupIcon } from '@/constants/categories'
import { formatMoney } from '@/lib/money/money'
import { relativeTime } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Expense, Group, Money, User } from '@/types'

interface GroupCardProps {
  group: Group
  members: User[]
  myNet: Money
  totalSpend: Money
  expenseCount: number
  lastExpense?: Expense
  className?: string
}

export function GroupCard({
  group,
  members,
  myNet,
  totalSpend,
  expenseCount,
  lastExpense,
  className,
}: GroupCardProps) {
  const Icon = groupIcon(group.icon)

  return (
    <Link
      href={`/groups/${group.id}`}
      className={cn(
        'group flex flex-col rounded-xl border border-border bg-card p-4 card-shadow transition-all hover:-translate-y-0.5 hover:card-shadow-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        className,
      )}
    >
      <div className="flex items-start gap-3">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-lg',
            groupColor(group.color).chip,
          )}
          aria-hidden
        >
          <Icon className="size-[18px]" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <h3 className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
              {group.name}
            </h3>
            {group.archivedAt ? (
              <Badge variant="outline" className="shrink-0">
                <Archive aria-hidden />
                Archived
              </Badge>
            ) : null}
          </div>
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {group.description || `${members.length} members`}
          </p>
        </div>

        <ArrowRight
          className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
          aria-hidden
        />
      </div>

      <div className="mt-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {myNet > 0 ? 'You’re owed' : myNet < 0 ? 'You owe' : 'Your balance'}
          </p>
          <Amount
            value={myNet}
            currency={group.currency}
            size="lg"
            tone="auto"
            absolute
          />
          {myNet === 0 ? (
            <p className="text-xs text-muted-foreground">All settled up</p>
          ) : null}
        </div>
        <AvatarStack users={members} max={4} size="sm" />
      </div>

      <div className="mt-4 flex items-center justify-between gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <Receipt className="size-3.5" aria-hidden />
          {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'} ·{' '}
          {formatMoney(totalSpend, group.currency)}
        </span>
        {lastExpense ? (
          <span className="truncate">{relativeTime(lastExpense.createdAt)}</span>
        ) : null}
      </div>
    </Link>
  )
}
