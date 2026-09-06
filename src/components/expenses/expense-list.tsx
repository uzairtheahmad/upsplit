'use client'

import { MoreHorizontal, Pencil, Receipt, Trash2 } from 'lucide-react'
import Link from 'next/link'

import { CategoryIconChip } from '@/components/expenses/form/category-selector'
import { Amount } from '@/components/shared/money'
import { EmptyState } from '@/components/shared/states'
import { AvatarStack } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { calculateExpenseImpact, paymentsByUser } from '@/lib/expenses/calculate-split'
import { friendlyDate } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { Expense, User } from '@/types'

interface ExpenseRowProps {
  expense: Expense
  users: Map<string, User>
  currentUserId: string
  /** Where the row links to. Omit to render a non-interactive row. */
  href?: string
  onEdit?: (expense: Expense) => void
  onDelete?: (expense: Expense) => void
  /** Show which group the expense belongs to — for cross-group lists. */
  groupName?: string
}

/**
 * One expense row.
 *
 * Says four things at a glance: what it was, who paid, how it affects *you*,
 * and when. The personal impact is stated in words as well as colour.
 */
export function ExpenseRow({
  expense,
  users,
  currentUserId,
  href,
  onEdit,
  onDelete,
  groupName,
}: ExpenseRowProps) {
  const impact = calculateExpenseImpact(expense)
  const myNet = impact.find((entry) => entry.userId === currentUserId)?.net ?? 0

  const payers = [...paymentsByUser(expense).keys()]
  const payerNames = payers
    .map((id) => (id === currentUserId ? 'You' : users.get(id)?.name.split(' ')[0] ?? 'Someone'))
    .join(' & ')

  const participants = expense.participants
    .map((participant) => users.get(participant.userId))
    .filter((user): user is User => Boolean(user))

  const content = (
    <>
      <CategoryIconChip category={expense.category} />

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
            {expense.description}
          </p>
          <Amount value={expense.amount} currency={expense.currency} size="sm" className="shrink-0" />
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          <span className="truncate">{payerNames} paid</span>
          <span aria-hidden>·</span>
          <span>{friendlyDate(expense.date)}</span>
          {groupName ? (
            <>
              <span aria-hidden>·</span>
              <span className="truncate">{groupName}</span>
            </>
          ) : null}
          {expense.splitMethod !== 'equal' ? (
            <Badge variant="outline" className="ml-0.5 px-1 py-0 text-[10px]">
              {expense.splitMethod}
            </Badge>
          ) : null}
        </div>
      </div>

      <div className="hidden shrink-0 sm:block">
        <AvatarStack users={participants} max={3} size="xs" />
      </div>

      <div className="w-24 shrink-0 text-right">
        {myNet === 0 ? (
          <span className="text-xs text-muted-foreground">not involved</span>
        ) : (
          <>
            <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {myNet > 0 ? 'you lent' : 'you owe'}
            </span>
            <Amount value={myNet} currency={expense.currency} size="sm" tone="auto" absolute />
          </>
        )}
      </div>
    </>
  )

  const rowClass =
    'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

  return (
    <li className="relative flex items-center">
      {href ? (
        <Link href={href} className={cn(rowClass, 'flex-1')}>
          {content}
        </Link>
      ) : (
        <div className={cn(rowClass, 'flex-1')}>{content}</div>
      )}

      {onEdit || onDelete ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              className="mr-2 shrink-0"
              aria-label={`Actions for ${expense.description}`}
            >
              <MoreHorizontal aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {onEdit ? (
              <DropdownMenuItem onSelect={() => onEdit(expense)}>
                <Pencil aria-hidden />
                Edit
              </DropdownMenuItem>
            ) : null}
            {onDelete ? (
              <DropdownMenuItem destructive onSelect={() => onDelete(expense)}>
                <Trash2 aria-hidden />
                Delete
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </li>
  )
}

interface ExpenseListProps {
  expenses: Expense[]
  users: Map<string, User>
  currentUserId: string
  hrefFor?: (expense: Expense) => string
  groupNameFor?: (expense: Expense) => string | undefined
  onEdit?: (expense: Expense) => void
  onDelete?: (expense: Expense) => void
  emptyAction?: React.ReactNode
  emptyTitle?: string
  emptyDescription?: string
}

export function ExpenseList({
  expenses,
  users,
  currentUserId,
  hrefFor,
  groupNameFor,
  onEdit,
  onDelete,
  emptyAction,
  emptyTitle = 'No expenses yet',
  emptyDescription = 'Add your first expense to start tracking who owes what.',
}: ExpenseListProps) {
  if (expenses.length === 0) {
    return (
      <EmptyState
        icon={Receipt}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
      />
    )
  }

  return (
    <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-shadow">
      {expenses.map((expense) => (
        <ExpenseRow
          key={expense.id}
          expense={expense}
          users={users}
          currentUserId={currentUserId}
          href={hrefFor?.(expense)}
          groupName={groupNameFor?.(expense)}
          onEdit={onEdit}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}
