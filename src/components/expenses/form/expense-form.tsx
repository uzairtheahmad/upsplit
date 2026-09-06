'use client'

import * as React from 'react'
import { toast } from 'sonner'

import { AmountInput } from '@/components/expenses/form/amount-input'
import { CategorySelector } from '@/components/expenses/form/category-selector'
import { ParticipantSelector } from '@/components/expenses/form/participant-selector'
import { PayerSelector } from '@/components/expenses/form/payer-selector'
import { SplitEditor, SplitMethodSelector } from '@/components/expenses/form/split-editor'
import { SplitPreview } from '@/components/expenses/form/split-preview'
import { Button } from '@/components/ui/button'
import { Field, Input, Textarea } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentUserId, useGroupMembers, useMyGroups } from '@/hooks/use-app-data'
import { useExpenseForm } from '@/hooks/use-expense-form'
import { services } from '@/services'
import type { Expense } from '@/types'

interface ExpenseFormProps {
  groupId: string
  /** Pass an expense to edit it; omit to create a new one. */
  expense?: Expense
  /** Let the user move the expense between groups (creation only). */
  allowGroupChange?: boolean
  onGroupChange?: (groupId: string) => void
  onSuccess?: (expense: Expense) => void
  onCancel?: () => void
  /** Stack the preview under the fields instead of beside them. */
  layout?: 'split' | 'stacked'
}

/**
 * Create or edit an expense.
 *
 * Composition only: the maths lives in `useExpenseForm` and the domain layer,
 * and the same component handles both modes so the two paths can never drift.
 */
export function ExpenseForm({
  groupId,
  expense,
  allowGroupChange = false,
  onGroupChange,
  onSuccess,
  onCancel,
  layout = 'split',
}: ExpenseFormProps) {
  const currentUserId = useCurrentUserId()
  const groups = useMyGroups()
  const members = useGroupMembers(groupId)
  const group = groups.find((candidate) => candidate.id === groupId)
  const currency = group?.currency ?? 'PKR'

  const memberUsers = React.useMemo(() => members.map((member) => member.user), [members])
  const memberIds = React.useMemo(() => members.map((member) => member.userId), [members])

  const form = useExpenseForm({
    groupId,
    currency,
    memberIds,
    currentUserId,
    initial: expense,
  })

  const [multiplePayers, setMultiplePayers] = React.useState(
    (expense?.payments.length ?? 1) > 1,
  )
  const [saving, setSaving] = React.useState(false)

  const selectedParticipantIds = form.state.participants.map((p) => p.userId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    form.setSubmitted(true)

    if (!form.validation.ok) {
      // Move focus to the first problem so keyboard and screen-reader users
      // are not left guessing why nothing happened.
      const first = form.validation.issues[0]
      toast.error('Check the highlighted fields', { description: first?.message })
      return
    }

    setSaving(true)
    try {
      const saved = expense
        ? await services.expenses.update(expense.id, form.draft)
        : await services.expenses.create(form.draft)

      toast.success(expense ? 'Expense updated' : 'Expense added', {
        description: `${saved.description} · ${group?.name ?? ''}`,
      })
      onSuccess?.(saved)
    } catch (error) {
      toast.error('Could not save the expense', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  function handleToggleMultiple(next: boolean) {
    setMultiplePayers(next)
    if (!next && form.state.payerIds.length > 1) {
      form.setSinglePayer(form.state.payerIds[0])
    }
  }

  const fields = (
    <div className="space-y-5">
      {allowGroupChange && groups.length > 0 ? (
        <Field label="Group" htmlFor="expense-group" error={form.issuesFor('group')}>
          <Select value={groupId} onValueChange={(next) => onGroupChange?.(next)}>
            <SelectTrigger id="expense-group">
              <SelectValue placeholder="Choose a group" />
            </SelectTrigger>
            <SelectContent>
              {groups.map((candidate) => (
                <SelectItem key={candidate.id} value={candidate.id}>
                  {candidate.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      ) : null}

      <Field label="Description" htmlFor="expense-description" error={form.issuesFor('description')}>
        <Input
          id="expense-description"
          value={form.state.description}
          onChange={(event) => form.patch({ description: event.target.value })}
          placeholder="Dinner at Monal"
          autoFocus={!expense}
          autoComplete="off"
          aria-invalid={form.issuesFor('description') ? true : undefined}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <AmountInput
          value={form.state.amountText}
          onChange={(value) => form.patch({ amountText: value })}
          currency={currency}
          id="expense-amount"
          error={form.issuesFor('amount')}
          emphasis
        />

        <div className="grid gap-4 sm:content-end">
          <Field label="Date" htmlFor="expense-date" error={form.issuesFor('date')}>
            <Input
              id="expense-date"
              type="date"
              value={form.state.date}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(event) => form.patch({ date: event.target.value })}
            />
          </Field>
        </div>
      </div>

      <CategorySelector
        value={form.state.category}
        onChange={(category) => form.patch({ category })}
        id="expense-category"
      />

      <PayerSelector
        members={memberUsers}
        currentUserId={currentUserId}
        payerIds={form.state.payerIds}
        payerAmounts={form.state.payerAmounts}
        total={form.amount}
        paidTotal={form.paidTotal}
        currency={currency}
        multiple={multiplePayers}
        onToggleMultiple={handleToggleMultiple}
        onSelectSingle={form.setSinglePayer}
        onTogglePayer={form.togglePayer}
        onPayerAmountChange={form.setPayerAmount}
        error={form.issuesFor('payments')}
      />

      <ParticipantSelector
        members={memberUsers}
        currentUserId={currentUserId}
        selectedIds={selectedParticipantIds}
        payerIds={form.state.payerIds}
        onToggle={form.toggleParticipant}
        onSelectAll={() => form.setParticipants(memberIds)}
        onClear={() => form.setParticipants([])}
        error={form.issuesFor('participants')}
      />

      <SplitMethodSelector value={form.state.splitMethod} onChange={form.setSplitMethod} />

      <SplitEditor
        method={form.state.splitMethod}
        participants={form.state.participants}
        members={memberUsers}
        currentUserId={currentUserId}
        currency={currency}
        total={form.amount}
        shares={form.shares}
        validation={form.splitValidation}
        onValueChange={form.setParticipantValue}
      />

      {form.submitted && form.issuesFor('split') ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {form.issuesFor('split')}
        </p>
      ) : null}

      <Field label="Notes" htmlFor="expense-notes" hint="Optional — anything worth remembering later.">
        <Textarea
          id="expense-notes"
          value={form.state.notes}
          onChange={(event) => form.patch({ notes: event.target.value })}
          placeholder="Two twin rooms, breakfast included."
          rows={2}
        />
      </Field>
    </div>
  )

  const preview = (
    <SplitPreview
      total={form.amount}
      currency={currency}
      method={form.state.splitMethod}
      shares={form.shares}
      impact={form.impact}
      adjustment={form.adjustment}
      members={memberUsers}
      currentUserId={currentUserId}
      className={layout === 'split' ? 'lg:sticky lg:top-4' : undefined}
    />
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6" noValidate>
      {layout === 'split' ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="min-w-0">{fields}</div>
          <div className="min-w-0">{preview}</div>
        </div>
      ) : (
        <div className="space-y-6">
          {fields}
          {preview}
        </div>
      )}

      <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
        {onCancel ? (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        ) : null}
        <Button type="submit" loading={saving}>
          {expense ? 'Save changes' : 'Add expense'}
        </Button>
      </div>
    </form>
  )
}
