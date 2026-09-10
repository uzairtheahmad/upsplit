'use client'

import { AlertTriangle, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { ExpenseForm } from '@/components/expenses/form/expense-form'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { formatMoney } from '@/lib/money/money'
import { services } from '@/services'
import type { Expense } from '@/types'

interface AddExpenseDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
  onGroupChange?: (groupId: string) => void
  allowGroupChange?: boolean
}

export function AddExpenseDialog({
  open,
  onOpenChange,
  groupId,
  onGroupChange,
  allowGroupChange = true,
}: AddExpenseDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Add an expense</DialogTitle>
          <DialogDescription>
            Choose who paid and who it’s split between. The preview updates as you type.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {/* Remounting per group resets the form cleanly when the group changes. */}
          <ExpenseForm
            key={groupId}
            groupId={groupId}
            allowGroupChange={allowGroupChange}
            onGroupChange={onGroupChange}
            onSuccess={() => onOpenChange(false)}
            onCancel={() => onOpenChange(false)}
            layout="split"
          />
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export function EditExpenseDialog({
  expense,
  open,
  onOpenChange,
}: {
  expense: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>Edit expense</DialogTitle>
          <DialogDescription>
            Balances for everyone involved update as soon as you save.
          </DialogDescription>
        </DialogHeader>
        <DialogBody>
          {expense ? (
            <ExpenseForm
              key={expense.id}
              groupId={expense.groupId}
              expense={expense}
              onSuccess={() => onOpenChange(false)}
              onCancel={() => onOpenChange(false)}
              layout="split"
            />
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  )
}

export function DeleteExpenseDialog({
  expense,
  open,
  onOpenChange,
  onDeleted,
}: {
  expense: Expense | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onDeleted?: () => void
}) {
  const [deleting, setDeleting] = React.useState(false)
  // A refusal is shown inside this dialog rather than as a toast: the reason
  // belongs next to the button that was refused, and stacking a second dialog
  // on top of a confirmation is worse than either.
  const [refusal, setRefusal] = React.useState<string | null>(null)

  async function handleDelete() {
    if (!expense) return
    setDeleting(true)
    setRefusal(null)
    try {
      await services.expenses.remove(expense.id)
      toast.success('Expense deleted', {
        description: `${expense.description} was removed and balances updated.`,
      })
      onOpenChange(false)
      onDeleted?.()
    } catch (error) {
      setRefusal(error instanceof Error ? error.message : 'Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>Delete expense?</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <p className="text-sm text-muted-foreground">
            This removes{' '}
            <span className="font-medium text-foreground">{expense?.description}</span>
            {expense ? ` (${formatMoney(expense.amount, expense.currency)})` : ''} from the group and
            updates everyone’s balances.
          </p>

          {refusal ? (
            <p
              role="alert"
              className="mt-3 flex gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
              {refusal}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={deleting}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleDelete} loading={deleting}>
            <Trash2 aria-hidden />
            Delete expense
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
