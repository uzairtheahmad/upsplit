'use client'

import { Plus } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import * as React from 'react'

import { DeleteExpenseDialog, EditExpenseDialog } from '@/components/expenses/expense-dialogs'
import {
  applyExpenseFilters,
  EMPTY_FILTERS,
  ExpenseFilters,
  type ExpenseFilterState,
} from '@/components/expenses/expense-filters'
import { ExpenseList } from '@/components/expenses/expense-list'
import { Button } from '@/components/ui/button'
import {
  useCurrentUserId,
  useGroup,
  useGroupLedger,
  useUserMap,
} from '@/hooks/use-app-data'
import type { Expense } from '@/types'

export default function GroupExpensesPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const users = useUserMap()
  const currentUserId = useCurrentUserId()

  const [filters, setFilters] = React.useState<ExpenseFilterState>(EMPTY_FILTERS)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [deleting, setDeleting] = React.useState<Expense | null>(null)

  if (!group) return null

  const filtered = applyExpenseFilters(ledger.expenses, filters, users, group.currency)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {ledger.expenses.length} {ledger.expenses.length === 1 ? 'expense' : 'expenses'}
        </h2>
        <Button asChild size="sm">
          <Link href={`/groups/${groupId}/expenses/new`}>
            <Plus aria-hidden />
            Add expense
          </Link>
        </Button>
      </div>

      <ExpenseFilters
        filters={filters}
        onChange={setFilters}
        people={ledger.members.map((member) => member.user)}
        currentUserId={currentUserId}
        currency={group.currency}
        resultCount={filtered.length}
        totalCount={ledger.expenses.length}
      />

      <ExpenseList
        expenses={filtered}
        users={users}
        currentUserId={currentUserId}
        hrefFor={(expense) => `/groups/${groupId}/expenses/${expense.id}`}
        onEdit={setEditing}
        onDelete={setDeleting}
        emptyTitle={
          ledger.expenses.length === 0 ? 'No expenses yet' : 'Nothing matches those filters'
        }
        emptyDescription={
          ledger.expenses.length === 0
            ? 'Add the first expense to start tracking the group.'
            : 'Try widening the date range or clearing a filter.'
        }
        emptyAction={
          ledger.expenses.length === 0 ? (
            <Button asChild>
              <Link href={`/groups/${groupId}/expenses/new`}>
                <Plus aria-hidden />
                Add expense
              </Link>
            </Button>
          ) : (
            <Button variant="outline" onClick={() => setFilters(EMPTY_FILTERS)}>
              Clear filters
            </Button>
          )
        }
      />

      <EditExpenseDialog
        expense={editing}
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
      />
      <DeleteExpenseDialog
        expense={deleting}
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
      />
    </div>
  )
}
