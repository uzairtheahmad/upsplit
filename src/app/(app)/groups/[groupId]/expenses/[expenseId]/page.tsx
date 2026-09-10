'use client'

import { ChevronLeft, FileX, Pencil, Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'

import { DeleteExpenseDialog, EditExpenseDialog } from '@/components/expenses/expense-dialogs'
import { ExpenseComments } from '@/components/expenses/expense-comments'
import { CategoryIconChip } from '@/components/expenses/form/category-selector'
import { Amount } from '@/components/shared/money'
import { EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/misc'
import { categoryMeta } from '@/constants/categories'
import {
  useCurrentUserId,
  useExpense,
  useGroup,
  useUserMap,
} from '@/hooks/use-app-data'
import {
  calculateExpenseImpact,
  calculateShares,
  SPLIT_METHOD_LABELS,
} from '@/lib/expenses/calculate-split'
import { formatMoney } from '@/lib/money/money'
import { formatDateLong, relativeTime } from '@/lib/utils/dates'

export default function ExpenseDetailPage() {
  const { groupId, expenseId } = useParams<{ groupId: string; expenseId: string }>()
  const router = useRouter()
  const expense = useExpense(expenseId)
  const group = useGroup(groupId)
  const users = useUserMap()
  const currentUserId = useCurrentUserId()

  const [editing, setEditing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  if (!expense || !group) {
    return (
      <EmptyState
        icon={FileX}
        title="Expense not found"
        description="It may have been deleted, or the link is out of date."
        action={
          <Button asChild>
            <Link href={`/groups/${groupId}/expenses`}>Back to expenses</Link>
          </Button>
        }
      />
    )
  }

  const shares = calculateShares({
    total: expense.amount,
    method: expense.splitMethod,
    participants: expense.participants,
  })
  const impact = calculateExpenseImpact(expense)
  const myImpact = impact.find((entry) => entry.userId === currentUserId)
  const creator = users.get(expense.createdBy)
  const category = categoryMeta(expense.category)

  const shareMap = new Map(shares.map((share) => [share.userId, share.amount]))

  return (
    <div className="space-y-5">
      <Link
        href={`/groups/${groupId}/expenses`}
        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        <ChevronLeft className="size-3.5" aria-hidden />
        All expenses
      </Link>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,340px)]">
        <div className="min-w-0 space-y-5">
          <Card>
            <CardContent className="p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex min-w-0 gap-3.5">
                  <CategoryIconChip category={expense.category} size="lg" />
                  <div className="min-w-0 space-y-1">
                    <h1 className="text-lg font-semibold tracking-tight">{expense.description}</h1>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                      <Badge variant="outline">{category.label}</Badge>
                      <span>{formatDateLong(expense.date)}</span>
                      <span aria-hidden>·</span>
                      <span>{SPLIT_METHOD_LABELS[expense.splitMethod]}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Amount value={expense.amount} currency={expense.currency} size="2xl" />
                </div>
              </div>

              {expense.notes ? (
                <>
                  <Separator className="my-4" />
                  <p className="text-sm text-muted-foreground">{expense.notes}</p>
                </>
              ) : null}

              <Separator className="my-4" />

              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
                  <Pencil aria-hidden />
                  Edit
                </Button>
                <Button variant="outline" size="sm" onClick={() => setDeleting(true)}>
                  <Trash2 aria-hidden />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Paid by</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <ul className="divide-y divide-border">
                {expense.payments.map((payment) => {
                  const person = users.get(payment.userId)
                  if (!person) return null
                  return (
                    <li key={payment.userId} className="flex items-center gap-3 px-5 py-3">
                      <UserAvatar
                        user={person}
                        size="sm"
                        highlighted={payment.userId === currentUserId}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {payment.userId === currentUserId ? 'You' : person.name}
                      </span>
                      <Amount value={payment.amount} currency={expense.currency} size="sm" />
                    </li>
                  )
                })}
              </ul>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Split breakdown</CardTitle>
            </CardHeader>
            <CardContent className="p-0 pb-2">
              <ul className="divide-y divide-border">
                {impact.map((entry) => {
                  const person = users.get(entry.userId)
                  if (!person) return null
                  const share = shareMap.get(entry.userId) ?? 0

                  return (
                    <li key={entry.userId} className="flex items-center gap-3 px-5 py-3">
                      <UserAvatar
                        user={person}
                        size="sm"
                        highlighted={entry.userId === currentUserId}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {entry.userId === currentUserId ? 'You' : person.name}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {share > 0
                            ? `share ${formatMoney(share, expense.currency)}`
                            : 'not in the split'}
                          {entry.paid > 0
                            ? ` · paid ${formatMoney(entry.paid, expense.currency)}`
                            : ''}
                        </p>
                      </div>
                      <Amount
                        value={entry.net}
                        currency={expense.currency}
                        size="sm"
                        tone="auto"
                        signed
                      />
                    </li>
                  )
                })}
              </ul>

              {/* The zero-sum proof, restated on the record itself. */}
              <div className="mx-5 mt-2 flex items-center justify-between rounded-lg bg-muted/60 px-3 py-2 text-xs">
                <span className="font-medium text-muted-foreground">Total effect</span>
                <span className="tabular font-semibold">
                  {formatMoney(
                    impact.reduce((sum, entry) => sum + entry.net, 0),
                    expense.currency,
                  )}
                </span>
              </div>
            </CardContent>
          </Card>

          <ExpenseComments expenseId={expense.id} />
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Your impact</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {myImpact ? (
                <>
                  <Amount
                    value={myImpact.net}
                    currency={expense.currency}
                    size="2xl"
                    tone="auto"
                    signed
                  />
                  <p className="text-sm text-muted-foreground">
                    {myImpact.net > 0
                      ? 'You’re owed this much from this expense.'
                      : myImpact.net < 0
                        ? 'You owe this much from this expense.'
                        : 'This expense doesn’t change your balance.'}
                  </p>
                  <Separator />
                  <dl className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">You paid</dt>
                      <dd className="tabular font-medium">
                        {formatMoney(myImpact.paid, expense.currency)}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Your share</dt>
                      <dd className="tabular font-medium">
                        {formatMoney(myImpact.owed, expense.currency)}
                      </dd>
                    </div>
                  </dl>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  You weren’t involved in this expense.
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>History</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="flex items-start gap-2.5">
                {creator ? <UserAvatar user={creator} size="xs" /> : null}
                <div className="min-w-0">
                  <p className="truncate">
                    {creator?.id === currentUserId ? 'You' : creator?.name ?? 'Someone'} added this
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {relativeTime(expense.createdAt)}
                  </p>
                </div>
              </div>

              {expense.updatedAt !== expense.createdAt ? (
                <div className="flex items-start gap-2.5">
                  <span
                    className="flex size-6 items-center justify-center rounded-full bg-muted text-muted-foreground"
                    aria-hidden
                  >
                    <Pencil className="size-3" />
                  </span>
                  <div className="min-w-0">
                    <p>Last edited</p>
                    <p className="text-xs text-muted-foreground">
                      {relativeTime(expense.updatedAt)}
                    </p>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>

      <EditExpenseDialog expense={expense} open={editing} onOpenChange={setEditing} />
      <DeleteExpenseDialog
        expense={expense}
        open={deleting}
        onOpenChange={setDeleting}
        onDeleted={() => router.push(`/groups/${groupId}/expenses`)}
      />
    </div>
  )
}
