'use client'

import { ArrowLeftRight, CheckCircle2, ChevronRight, Scale } from 'lucide-react'
import * as React from 'react'

import { CategoryIconChip } from '@/components/expenses/form/category-selector'
import { Amount } from '@/components/shared/money'
import { EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/misc'
import { pairwiseTransactions } from '@/lib/balances/calculate-balances'
import { formatMoney } from '@/lib/money/money'
import { friendlyDate } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Balance, CurrencyCode, Expense, Money, Settlement, User } from '@/types'

/**
 * Person-to-person balance row.
 *
 * The direction is stated in a sentence — "Ali owes you" / "You owe Shaheer" —
 * so the meaning never depends on the colour of the number.
 */
function PersonBalanceCard({
  person,
  amount,
  currency,
  onSettle,
  onInspect,
  className,
}: {
  person: User
  /** Signed from the viewer's perspective: positive means they owe you. */
  amount: Money
  currency: CurrencyCode
  onSettle?: () => void
  onInspect?: () => void
  className?: string
}) {
  const settled = amount === 0

  return (
    <div
      className={cn(
        'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40',
        className,
      )}
    >
      <UserAvatar user={person} size="lg" />

      <button
        type="button"
        onClick={onInspect}
        disabled={!onInspect}
        className="min-w-0 flex-1 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-default"
      >
        <p className="truncate text-sm font-medium text-foreground">{person.name}</p>
        <p className="truncate text-xs text-muted-foreground">
          {settled
            ? 'All settled up'
            : amount > 0
              ? `${person.name.split(' ')[0]} owes you`
              : `You owe ${person.name.split(' ')[0]}`}
        </p>
      </button>

      <div className="flex shrink-0 items-center gap-2">
        {settled ? (
          <span className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <CheckCircle2 className="size-3.5" aria-hidden />
            Settled
          </span>
        ) : (
          <Amount value={amount} currency={currency} size="base" tone="auto" absolute />
        )}

        {onSettle && !settled ? (
          <Button variant="outline" size="sm" onClick={onSettle}>
            Settle
          </Button>
        ) : null}

        {onInspect ? (
          <button
            type="button"
            onClick={onInspect}
            className="rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`See the expenses behind your balance with ${person.name}`}
          >
            <ChevronRight className="size-4" />
          </button>
        ) : null}
      </div>
    </div>
  )
}

export function BalanceList({
  entries,
  users,
  currency,
  onSettle,
  onInspect,
  emptyDescription = 'Once expenses are added, who owes whom shows up here.',
}: {
  entries: Array<{ userId: string; amount: Money }>
  users: Map<string, User>
  currency: CurrencyCode
  onSettle?: (userId: string, amount: Money) => void
  onInspect?: (userId: string) => void
  emptyDescription?: string
}) {
  if (entries.length === 0) {
    return (
      <EmptyState
        icon={CheckCircle2}
        title="Everyone’s square"
        description={emptyDescription}
        compact
      />
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-shadow">
      {entries.map((entry) => {
        const person = users.get(entry.userId)
        if (!person) return null
        return (
          <li key={entry.userId}>
            <PersonBalanceCard
              person={person}
              amount={entry.amount}
              currency={currency}
              onSettle={onSettle ? () => onSettle(entry.userId, entry.amount) : undefined}
              onInspect={onInspect ? () => onInspect(entry.userId) : undefined}
            />
          </li>
        )
      })}
    </ul>
  )
}

/**
 * The "why do I owe this?" view.
 *
 * Lists every expense and settlement that moved the balance between two people,
 * signed from the viewer's side, and totals to the current figure — so the
 * number is auditable rather than asserted.
 */
export function TransactionBreakdownDialog({
  open,
  onOpenChange,
  viewer,
  other,
  expenses,
  settlements,
  currency,
  onSettle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  viewer: User
  other: User | undefined
  expenses: Expense[]
  settlements: Settlement[]
  currency: CurrencyCode
  onSettle?: () => void
}) {
  const rows = React.useMemo(
    () => (other ? pairwiseTransactions(expenses, settlements, viewer.id, other.id) : []),
    [expenses, settlements, viewer.id, other],
  )

  const total = rows.reduce((sum, row) => sum + row.amount, 0)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserAvatar user={viewer} size="xs" />
            <ArrowLeftRight className="size-3.5 text-muted-foreground" aria-hidden />
            {other ? <UserAvatar user={other} size="xs" /> : null}
            <span>You and {other?.name ?? 'them'}</span>
          </DialogTitle>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {rows.length === 0 ? (
            <EmptyState
              icon={Scale}
              title="Nothing between you two"
              description="You haven’t shared any expenses with this person yet."
              compact
            />
          ) : (
            <>
              <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border">
                {rows.map((row) => (
                  <li
                    key={`${row.sourceType}-${row.sourceId}`}
                    className="flex items-center gap-3 px-3 py-2.5"
                  >
                    {row.category ? (
                      <CategoryIconChip category={row.category} size="sm" />
                    ) : (
                      <span
                        className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
                        aria-hidden
                      >
                        <ArrowLeftRight className="size-4" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm">{row.description}</p>
                      <p className="text-xs text-muted-foreground">
                        {friendlyDate(row.date)}
                        {row.sourceType === 'settlement' ? ' · settlement' : ''}
                      </p>
                    </div>
                    <Amount value={row.amount} currency={currency} size="sm" tone="auto" signed />
                  </li>
                ))}
              </ul>

              <Separator />

              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">Current balance</p>
                  <p className="text-xs text-muted-foreground">
                    {total > 0
                      ? `${other?.name.split(' ')[0]} owes you ${formatMoney(total, currency)}`
                      : total < 0
                        ? `You owe ${other?.name.split(' ')[0]} ${formatMoney(-total, currency)}`
                        : 'You’re all square'}
                  </p>
                </div>
                <Amount value={total} currency={currency} size="xl" tone="auto" signed />
              </div>

              {onSettle && total !== 0 ? (
                <Button className="w-full" onClick={onSettle}>
                  <ArrowLeftRight aria-hidden />
                  Settle this up
                </Button>
              ) : null}
            </>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

/** Group-wide member positions — paid, owed, and the resulting net. */
export function GroupBalanceTable({
  balances,
  users,
  currency,
  currentUserId,
}: {
  balances: Balance[]
  users: Map<string, User>
  currency: CurrencyCode
  currentUserId: string
}) {
  const sorted = [...balances].sort((a, b) => b.net - a.net)

  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card card-shadow">
      <table className="w-full min-w-[34rem] text-sm">
        <caption className="sr-only">
          What each member paid, was charged, and their resulting net balance.
        </caption>
        <thead>
          <tr className="border-b border-border text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2.5 font-medium">
              Member
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Paid
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Share
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Settled
            </th>
            <th scope="col" className="px-4 py-2.5 text-right font-medium">
              Net
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {sorted.map((balance) => {
            const person = users.get(balance.userId)
            if (!person) return null
            return (
              <tr key={balance.userId} className="transition-colors hover:bg-accent/30">
                <th scope="row" className="px-4 py-2.5 text-left font-normal">
                  <span className="flex items-center gap-2.5">
                    <UserAvatar user={person} size="sm" highlighted={balance.userId === currentUserId} />
                    <span className="truncate font-medium">
                      {balance.userId === currentUserId ? 'You' : person.name}
                    </span>
                  </span>
                </th>
                <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                  {formatMoney(balance.paid, currency)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                  {formatMoney(balance.owed, currency)}
                </td>
                <td className="tabular px-4 py-2.5 text-right text-muted-foreground">
                  {balance.settled === 0 ? '-' : formatMoney(balance.settled, currency, { signed: true })}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <Amount value={balance.net} currency={currency} size="sm" tone="auto" signed />
                </td>
              </tr>
            )
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border bg-muted/40 text-xs">
            <th scope="row" className="px-4 py-2.5 text-left font-medium">
              Total
            </th>
            <td colSpan={3} />
            <td className="tabular px-4 py-2.5 text-right font-semibold">
              {/* Always zero — the visible proof that the group's ledger balances. */}
              {formatMoney(
                balances.reduce((sum, balance) => sum + balance.net, 0),
                currency,
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
