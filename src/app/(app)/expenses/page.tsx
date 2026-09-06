'use client'

import { Plus } from 'lucide-react'
import * as React from 'react'

import { DeleteExpenseDialog, EditExpenseDialog } from '@/components/expenses/expense-dialogs'
import {
  applyExpenseFilters,
  EMPTY_FILTERS,
  ExpenseFilters,
  type ExpenseFilterState,
} from '@/components/expenses/expense-filters'
import { ExpenseList } from '@/components/expenses/expense-list'
import { useAppActions } from '@/components/layout/app-actions'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { Button } from '@/components/ui/button'
import {
  useCurrentUserId,
  useMyExpenses,
  useMyGroups,
  useUserMap,
  useUsers,
} from '@/hooks/use-app-data'
import type { Expense } from '@/types'

/** Search and filter across every group at once. */
export default function AllExpensesPage() {
  const expenses = useMyExpenses()
  const groups = useMyGroups({ includeArchived: true })
  const users = useUserMap()
  const allUsers = useUsers()
  const currentUserId = useCurrentUserId()
  const actions = useAppActions()

  const [filters, setFilters] = React.useState<ExpenseFilterState>(EMPTY_FILTERS)
  const [editing, setEditing] = React.useState<Expense | null>(null)
  const [deleting, setDeleting] = React.useState<Expense | null>(null)

  const currency = groups[0]?.currency ?? 'PKR'
  const filtered = applyExpenseFilters(expenses, filters, users, currency)

  const groupMap = new Map(groups.map((group) => [group.id, group]))

  return (
    <PageContainer>
      <PageHeader
        title="All expenses"
        description="Everything across every group you’re part of."
        actions={
          <Button onClick={() => actions.addExpense()}>
            <Plus aria-hidden />
            Add expense
          </Button>
        }
      />

      <ExpenseFilters
        filters={filters}
        onChange={setFilters}
        people={allUsers}
        currentUserId={currentUserId}
        currency={currency}
        resultCount={filtered.length}
        totalCount={expenses.length}
      />

      <ExpenseList
        expenses={filtered}
        users={users}
        currentUserId={currentUserId}
        hrefFor={(expense) => `/groups/${expense.groupId}/expenses/${expense.id}`}
        groupNameFor={(expense) => groupMap.get(expense.groupId)?.name}
        onEdit={setEditing}
        onDelete={setDeleting}
        emptyTitle={
          expenses.length === 0 ? 'No expenses yet' : 'Nothing matches those filters'
        }
        emptyDescription={
          expenses.length === 0
            ? 'Add your first expense to start tracking who owes what.'
            : 'Try widening the date range or clearing a filter.'
        }
        emptyAction={
          expenses.length === 0 ? (
            <Button onClick={() => actions.addExpense()}>
              <Plus aria-hidden />
              Add expense
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
    </PageContainer>
  )
}
