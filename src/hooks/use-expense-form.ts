'use client'

import { useCallback, useMemo, useState } from 'react'

import {
  buildParticipants,
  calculateExpenseImpact,
  calculateShares,
} from '@/lib/expenses/calculate-split'
import { parseMoney, toMajorString } from '@/lib/money/money'
import { todayISO } from '@/lib/utils/dates'
import {
  validateExpenseDraft,
  validateSplit,
  type ValidationIssue,
} from '@/lib/validation/expense-schema'
import type {
  CurrencyCode,
  Expense,
  ExpenseCategory,
  ExpenseParticipant,
  ExpensePayment,
  SplitMethod,
} from '@/types'

/**
 * All of the expense form's state and derived values in one place.
 *
 * The form components below it are presentational: they render what this hook
 * gives them and call its setters. That keeps the split maths in the domain
 * layer and out of the JSX, and means creating and editing an expense run
 * through exactly the same code path.
 */

export interface ExpenseFormState {
  description: string
  /** Raw text as typed, so the field never fights the user mid-entry. */
  amountText: string
  notes: string
  date: string
  category: ExpenseCategory
  splitMethod: SplitMethod
  /** userId → amount text, for the multi-payer editor. */
  payerIds: string[]
  payerAmounts: Record<string, string>
  participants: ExpenseParticipant[]
}

export interface UseExpenseFormOptions {
  groupId: string
  currency: CurrencyCode
  memberIds: string[]
  currentUserId: string
  /** Pre-fill from an existing expense to edit it. */
  initial?: Expense
}

function stateFromExpense(expense: Expense, currency: CurrencyCode): ExpenseFormState {
  return {
    description: expense.description,
    amountText: toMajorString(expense.amount, currency),
    notes: expense.notes ?? '',
    date: expense.date,
    category: expense.category,
    splitMethod: expense.splitMethod,
    payerIds: expense.payments.map((payment) => payment.userId),
    payerAmounts: Object.fromEntries(
      expense.payments.map((payment) => [payment.userId, toMajorString(payment.amount, currency)]),
    ),
    participants: expense.participants,
  }
}

export function useExpenseForm({
  groupId,
  currency,
  memberIds,
  currentUserId,
  initial,
}: UseExpenseFormOptions) {
  const [state, setState] = useState<ExpenseFormState>(() =>
    initial
      ? stateFromExpense(initial, currency)
      : {
          description: '',
          amountText: '',
          notes: '',
          date: todayISO(),
          category: 'food',
          splitMethod: 'equal',
          // Sensible defaults: you paid, and everyone is in.
          payerIds: memberIds.includes(currentUserId) ? [currentUserId] : memberIds.slice(0, 1),
          payerAmounts: {},
          participants: memberIds.map((userId) => ({ userId })),
        },
  )

  /** Only show validation messages once the user has tried to submit. */
  const [submitted, setSubmitted] = useState(false)

  const amount = parseMoney(state.amountText, currency) ?? 0

  const patch = useCallback((changes: Partial<ExpenseFormState>) => {
    setState((current) => ({ ...current, ...changes }))
  }, [])

  /**
   * Payments derived from the payer selection. With a single payer the amount
   * is implicit — they covered the whole thing — so the user never has to type
   * the total twice.
   */
  const payments = useMemo<ExpensePayment[]>(() => {
    if (state.payerIds.length === 0) return []
    if (state.payerIds.length === 1) {
      return [{ userId: state.payerIds[0], amount }]
    }
    return state.payerIds.map((userId) => ({
      userId,
      amount: parseMoney(state.payerAmounts[userId] ?? '', currency) ?? 0,
    }))
  }, [state.payerIds, state.payerAmounts, amount, currency])

  const paidTotal = payments.reduce((sum, payment) => sum + payment.amount, 0)

  const setParticipants = useCallback(
    (userIds: string[]) => {
      setState((current) => ({
        ...current,
        participants: buildParticipants(
          userIds,
          current.splitMethod,
          parseMoney(current.amountText, currency) ?? 0,
          current.participants,
        ),
      }))
    },
    [currency],
  )

  const toggleParticipant = useCallback(
    (userId: string) => {
      setState((current) => {
        const selected = current.participants.some(
          (participant) => participant.userId === userId,
        )
        const next = selected
          ? current.participants.filter((participant) => participant.userId !== userId)
          : [...current.participants, { userId }]

        return {
          ...current,
          participants: buildParticipants(
            next.map((participant) => participant.userId),
            current.splitMethod,
            parseMoney(current.amountText, currency) ?? 0,
            next,
          ),
        }
      })
    },
    [currency],
  )

  const setSplitMethod = useCallback(
    (splitMethod: SplitMethod) => {
      setState((current) => ({
        ...current,
        splitMethod,
        // Re-seed values so switching method never lands in an invalid state.
        participants: buildParticipants(
          current.participants.map((participant) => participant.userId),
          splitMethod,
          parseMoney(current.amountText, currency) ?? 0,
          splitMethod === current.splitMethod ? current.participants : [],
        ),
      }))
    },
    [currency],
  )

  const setParticipantValue = useCallback((userId: string, value: number | undefined) => {
    setState((current) => ({
      ...current,
      participants: current.participants.map((participant) =>
        participant.userId === userId ? { ...participant, value } : participant,
      ),
    }))
  }, [])

  const togglePayer = useCallback((userId: string) => {
    setState((current) => {
      const selected = current.payerIds.includes(userId)
      const payerIds = selected
        ? current.payerIds.filter((id) => id !== userId)
        : [...current.payerIds, userId]
      return { ...current, payerIds }
    })
  }, [])

  const setSinglePayer = useCallback((userId: string) => {
    setState((current) => ({ ...current, payerIds: [userId], payerAmounts: {} }))
  }, [])

  const setPayerAmount = useCallback((userId: string, text: string) => {
    setState((current) => ({
      ...current,
      payerAmounts: { ...current.payerAmounts, [userId]: text },
    }))
  }, [])

  /* ── Derived: the live preview ──────────────────────────────────────────── */

  const shares = useMemo(
    () =>
      calculateShares({
        total: amount,
        method: state.splitMethod,
        participants: state.participants,
      }),
    [amount, state.splitMethod, state.participants],
  )

  const impact = useMemo(
    () =>
      calculateExpenseImpact({
        amount,
        splitMethod: state.splitMethod,
        participants: state.participants,
        payments,
      }),
    [amount, state.splitMethod, state.participants, payments],
  )

  const splitValidation = useMemo(
    () => validateSplit(state.splitMethod, amount, state.participants),
    [state.splitMethod, amount, state.participants],
  )

  const draft = useMemo(
    () => ({
      groupId,
      description: state.description,
      notes: state.notes || undefined,
      amount,
      currency,
      category: state.category,
      date: state.date,
      splitMethod: state.splitMethod,
      payments,
      participants: state.participants,
    }),
    [groupId, state, amount, currency, payments],
  )

  const validation = useMemo(
    () => validateExpenseDraft(draft, { memberIds }),
    [draft, memberIds],
  )

  const issuesFor = useCallback(
    (field: ValidationIssue['field']): string | undefined => {
      if (!submitted) return undefined
      return validation.issues.find((issue) => issue.field === field)?.message
    },
    [validation.issues, submitted],
  )

  /** The zero-sum check, surfaced in the preview so it is never a surprise. */
  const adjustment = impact.reduce((sum, entry) => sum + entry.net, 0)

  return {
    state,
    patch,
    submitted,
    setSubmitted,

    amount,
    payments,
    paidTotal,
    shares,
    impact,
    adjustment,
    draft,
    validation,
    splitValidation,
    issuesFor,

    setParticipants,
    toggleParticipant,
    setParticipantValue,
    setSplitMethod,
    togglePayer,
    setSinglePayer,
    setPayerAmount,
  }
}

export type ExpenseFormApi = ReturnType<typeof useExpenseForm>
