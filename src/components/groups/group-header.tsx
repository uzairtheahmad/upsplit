'use client'

import { ArrowLeftRight, ChevronLeft, Plus, UserPlus } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { useAppActions } from '@/components/layout/app-actions'
import { Amount } from '@/components/shared/money'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { groupColor, groupIcon } from '@/constants/categories'
import { formatMoney } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { Group, Money, User } from '@/types'

const TABS = [
  { segment: '', label: 'Overview' },
  { segment: 'expenses', label: 'Expenses' },
  { segment: 'balances', label: 'Balances' },
  { segment: 'members', label: 'Members' },
  { segment: 'analytics', label: 'Analytics' },
  { segment: 'settings', label: 'Settings' },
]

export function GroupHeader({
  group,
  members,
  myNet,
  totalSpend,
  expenseCount,
}: {
  group: Group
  members: User[]
  myNet: Money
  totalSpend: Money
  expenseCount: number
}) {
  const pathname = usePathname()
  const actions = useAppActions()
  const Icon = groupIcon(group.icon)
  const base = `/groups/${group.id}`

  return (
    <div className="space-y-5">
      <Link
        href="/groups"
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        All groups
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 gap-3.5">
          <span
            className={cn(
              'flex size-12 shrink-0 items-center justify-center rounded-xl',
              groupColor(group.color).chip,
            )}
            aria-hidden
          >
            <Icon className="size-5" />
          </span>

          <div className="min-w-0 space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{group.name}</h1>
              {group.archivedAt ? <Badge variant="outline">Archived</Badge> : null}
            </div>
            {group.description ? (
              <p className="text-sm text-muted-foreground">{group.description}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-0.5 text-xs text-muted-foreground">
              <AvatarStack users={members} max={5} size="xs" />
              <span>
                {members.length} {members.length === 1 ? 'member' : 'members'}
              </span>
              <span aria-hidden>·</span>
              <span>
                {expenseCount} {expenseCount === 1 ? 'expense' : 'expenses'}
              </span>
              <span aria-hidden>·</span>
              <span>{formatMoney(totalSpend, group.currency)} total</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <div className="mr-1 text-right">
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {myNet > 0 ? 'You’re owed' : myNet < 0 ? 'You owe' : 'Your balance'}
            </p>
            <Amount value={myNet} currency={group.currency} size="lg" tone="auto" absolute />
          </div>
          <Button variant="outline" size="sm" onClick={() => actions.inviteMember(group.id)}>
            <UserPlus aria-hidden />
            Invite
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => actions.recordSettlement({ groupId: group.id })}
          >
            <ArrowLeftRight aria-hidden />
            Settle up
          </Button>
          <Button size="sm" onClick={() => actions.addExpense(group.id)}>
            <Plus aria-hidden />
            Add expense
          </Button>
        </div>
      </div>

      {/* Tabs are real links so each view is addressable and back works. */}
      <nav
        aria-label="Group sections"
        className="-mx-4 w-[calc(100%+2rem)] overflow-x-auto px-4 sm:mx-0 sm:w-full sm:px-0"
      >
        <ul className="flex w-max min-w-full gap-1 border-b border-border">
          {TABS.map((tab) => {
            const href = tab.segment ? `${base}/${tab.segment}` : base
            const active = tab.segment
              ? pathname === href || pathname.startsWith(`${href}/`)
              : pathname === base

            return (
              <li key={tab.label}>
                <Link
                  href={href}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    '-mb-px inline-flex border-b-2 px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    active
                      ? 'border-primary text-foreground'
                      : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground',
                  )}
                >
                  {tab.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
