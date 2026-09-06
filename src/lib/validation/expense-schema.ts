import { z } from 'zod'

import { CURRENCY_CODES } from '@/lib/money/money'
import type { ExpenseParticipant, ExpensePayment, Money, SplitMethod } from '@/types'

export const EXPENSE_CATEGORIES = [
  'food',
  'transport',
  'shopping',
  'bills',
  'entertainment',
  'travel',
  'accommodation',
  'groceries',
  'health',
  'education',
  'other',
] as const

export const SPLIT_METHODS = ['equal', 'exact', 'percentage', 'weighted'] as const

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date')
  .refine((value) => !Number.isNaN(Date.parse(value)), 'Pick a valid date')

export const expenseDraftSchema = z.object({
  groupId: z.string().min(1, 'Choose a group'),
  description: z
    .string()
    .trim()
    .min(2, 'Give the expense a description')
    .max(120, 'Keep the description under 120 characters'),
  notes: z.string().trim().max(500, 'Notes are limited to 500 characters').optional(),
  /** Minor units. */
  amount: z
    .number()
    .int('Amounts are tracked in whole minor units')
    .positive('Amount must be greater than zero')
    .max(1_000_000_000_000, 'That amount is too large'),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  category: z.enum(EXPENSE_CATEGORIES),
  date: isoDate,
  splitMethod: z.enum(SPLIT_METHODS),
  payments: z
    .array(
      z.object({
        userId: z.string().min(1),
        amount: z.number().int().nonnegative(),
      }),
    )
    .min(1, 'Choose who paid'),
  participants: z
    .array(
      z.object({
        userId: z.string().min(1),
        value: z.number().optional(),
      }),
    )
    .min(1, 'Choose at least one person to split with'),
})

export type ExpenseDraft = z.infer<typeof expenseDraftSchema>

export interface ValidationIssue {
  /** Which part of the form the message belongs to. */
  field: 'description' | 'amount' | 'date' | 'payments' | 'participants' | 'split' | 'group'
  message: string
}

export interface SplitValidation {
  ok: boolean
  issues: ValidationIssue[]
  /**
   * For exact splits: stated total − expense total. For percentage splits:
   * stated basis points − 10,000. Zero when the split balances.
   */
  difference: number
}

/**
 * Method-specific split checks, kept separate from the Zod schema because they
 * are cross-field and need to feed a live, non-blocking preview as the user
 * types — not just a submit-time pass/fail.
 */
export function validateSplit(
  method: SplitMethod,
  total: Money,
  participants: readonly ExpenseParticipant[],
): SplitValidation {
  const issues: ValidationIssue[] = []

  if (participants.length === 0) {
    return {
      ok: false,
      difference: 0,
      issues: [{ field: 'participants', message: 'Choose at least one person to split with' }],
    }
  }

  if (method === 'equal') {
    return { ok: true, difference: 0, issues }
  }

  const values = participants.map((participant) => participant.value ?? 0)

  if (values.some((value) => value < 0)) {
    issues.push({ field: 'split', message: 'Split values cannot be negative' })
  }

  if (method === 'exact') {
    const stated = values.reduce((sum, value) => sum + value, 0)
    const difference = stated - total
    if (difference !== 0) {
      issues.push({
        field: 'split',
        message:
          difference > 0
            ? 'The exact amounts add up to more than the total'
            : 'The exact amounts do not add up to the total yet',
      })
    }
    return { ok: issues.length === 0, difference, issues }
  }

  if (method === 'percentage') {
    const stated = values.reduce((sum, value) => sum + value, 0)
    const difference = stated - 10_000
    if (difference !== 0) {
      issues.push({ field: 'split', message: 'Percentages must add up to exactly 100%' })
    }
    return { ok: issues.length === 0, difference, issues }
  }

  // weighted
  const totalWeight = values.reduce((sum, value) => sum + value, 0)
  if (totalWeight <= 0) {
    issues.push({ field: 'split', message: 'Give at least one person a share above zero' })
  }
  return { ok: issues.length === 0, difference: 0, issues }
}

export interface ExpenseValidationContext {
  /** User ids allowed to appear as payers or participants. */
  memberIds: readonly string[]
}

/**
 * Full validation for an expense draft: schema, payer totals, membership, and
 * the split itself. Returns every issue at once so the form can show them all
 * rather than one at a time.
 */
export function validateExpenseDraft(
  draft: Partial<ExpenseDraft>,
  context: ExpenseValidationContext,
): { ok: boolean; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = []

  const parsed = expenseDraftSchema.safeParse(draft)
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      const field: ValidationIssue['field'] =
        key === 'description' || key === 'amount' || key === 'date' || key === 'payments' || key === 'participants'
          ? key
          : key === 'groupId'
            ? 'group'
            : 'split'
      issues.push({ field, message: issue.message })
    }
    return { ok: false, issues: dedupe(issues) }
  }

  const value = parsed.data
  const members = new Set(context.memberIds)

  const paidTotal = value.payments.reduce((sum, payment) => sum + payment.amount, 0)
  if (paidTotal !== value.amount) {
    issues.push({
      field: 'payments',
      message: 'What the payers put down must add up to the expense total',
    })
  }
  if (value.payments.some((payment) => payment.amount <= 0)) {
    issues.push({ field: 'payments', message: 'Every payer must contribute more than zero' })
  }
  if (value.payments.some((payment) => !members.has(payment.userId))) {
    issues.push({ field: 'payments', message: 'A payer is not a member of this group' })
  }
  if (new Set(value.payments.map((p) => p.userId)).size !== value.payments.length) {
    issues.push({ field: 'payments', message: 'Each payer can only be listed once' })
  }

  if (value.participants.some((participant) => !members.has(participant.userId))) {
    issues.push({ field: 'participants', message: 'A participant is not a member of this group' })
  }
  if (new Set(value.participants.map((p) => p.userId)).size !== value.participants.length) {
    issues.push({ field: 'participants', message: 'Each participant can only be listed once' })
  }

  issues.push(
    ...validateSplit(value.splitMethod, value.amount, value.participants as ExpenseParticipant[]).issues,
  )

  return { ok: issues.length === 0, issues: dedupe(issues) }
}

function dedupe(issues: ValidationIssue[]): ValidationIssue[] {
  const seen = new Set<string>()
  return issues.filter((issue) => {
    const key = `${issue.field}:${issue.message}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

export const settlementDraftSchema = z
  .object({
    groupId: z.string().min(1, 'Choose a group'),
    fromUserId: z.string().min(1, 'Choose who is paying'),
    toUserId: z.string().min(1, 'Choose who is being paid'),
    amount: z.number().int().positive('Amount must be greater than zero'),
    currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
    date: isoDate,
    note: z.string().trim().max(200).optional(),
  })
  .refine((value) => value.fromUserId !== value.toUserId, {
    message: 'A settlement needs two different people',
    path: ['toUserId'],
  })

export type SettlementDraft = z.infer<typeof settlementDraftSchema>

export const groupDraftSchema = z.object({
  name: z.string().trim().min(2, 'Give the group a name').max(60, 'Keep the name under 60 characters'),
  description: z.string().trim().max(200, 'Keep the description under 200 characters').optional(),
  currency: z.enum(CURRENCY_CODES as [string, ...string[]]),
  icon: z.string().min(1),
  color: z.string().min(1),
  memberIds: z.array(z.string()).default([]),
})

export type GroupDraft = z.infer<typeof groupDraftSchema>

export type { ExpensePayment }
