'use client'

import { AlertTriangle, Equal, Hash, Percent, SlidersHorizontal } from 'lucide-react'
import * as React from 'react'

import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Input, Label } from '@/components/ui/input'
import {
  SPLIT_METHOD_DESCRIPTIONS,
  SPLIT_METHOD_LABELS,
} from '@/lib/expenses/calculate-split'
import { currencySymbol, formatMoney, parseMoney, toMajorString } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { SplitValidation } from '@/lib/validation/expense-schema'
import type {
  CurrencyCode,
  ExpenseParticipant,
  Money,
  SplitMethod,
  User,
} from '@/types'

const METHOD_ICONS: Record<SplitMethod, React.ElementType> = {
  equal: Equal,
  exact: Hash,
  percentage: Percent,
  weighted: SlidersHorizontal,
}

const METHODS: SplitMethod[] = ['equal', 'exact', 'percentage', 'weighted']

export function SplitMethodSelector({
  value,
  onChange,
}: {
  value: SplitMethod
  onChange: (method: SplitMethod) => void
}) {
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium leading-none text-foreground">Split</legend>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {METHODS.map((method) => {
          const Icon = METHOD_ICONS[method]
          const selected = value === method
          return (
            <button
              key={method}
              type="button"
              onClick={() => onChange(method)}
              aria-pressed={selected}
              className={cn(
                'flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                selected
                  ? 'border-primary bg-primary-muted text-primary'
                  : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden />
              {SPLIT_METHOD_LABELS[method]}
            </button>
          )
        })}
      </div>
      <p className="text-xs text-muted-foreground">{SPLIT_METHOD_DESCRIPTIONS[value]}</p>
    </fieldset>
  )
}

interface SplitEditorProps {
  method: SplitMethod
  participants: ExpenseParticipant[]
  members: User[]
  currentUserId: string
  currency: CurrencyCode
  total: Money
  shares: Array<{ userId: string; amount: Money }>
  validation: SplitValidation
  onValueChange: (userId: string, value: number | undefined) => void
}

/**
 * Per-person inputs for the non-equal split methods.
 *
 * Equal splits need no editor at all — the preview already shows the outcome —
 * so we render nothing rather than a row of disabled boxes.
 */
export function SplitEditor({
  method,
  participants,
  members,
  currentUserId,
  currency,
  total,
  shares,
  validation,
  onValueChange,
}: SplitEditorProps) {
  if (method === 'equal' || participants.length === 0) return null

  const memberMap = new Map(members.map((member) => [member.id, member]))
  const shareMap = new Map(shares.map((share) => [share.userId, share.amount]))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>{method === 'weighted' ? 'Shares' : method === 'exact' ? 'Exact amounts' : 'Percentages'}</Label>
        <SplitDifference method={method} validation={validation} currency={currency} />
      </div>

      <div className="divide-y divide-border rounded-lg border border-border">
        {participants.map((participant) => {
          const member = memberMap.get(participant.userId)
          if (!member) return null
          const inputId = `split-${participant.userId}`

          return (
            <div key={participant.userId} className="flex items-center gap-2 px-2.5 py-2">
              <UserAvatar user={member} size="xs" />
              <label htmlFor={inputId} className="min-w-0 flex-1 truncate text-sm">
                {member.id === currentUserId ? 'You' : member.name}
              </label>

              <SplitValueInput
                id={inputId}
                method={method}
                currency={currency}
                value={participant.value}
                name={member.name}
                onChange={(next) => onValueChange(participant.userId, next)}
              />

              {method !== 'exact' ? (
                <span className="tabular w-24 shrink-0 text-right text-xs text-muted-foreground">
                  {formatMoney(shareMap.get(participant.userId) ?? 0, currency)}
                </span>
              ) : null}
            </div>
          )
        })}
      </div>

      {method === 'weighted' ? (
        <p className="text-xs text-muted-foreground">
          Someone with 2 shares pays twice what someone with 1 share pays.
        </p>
      ) : null}
      {method === 'exact' && total > 0 ? (
        <p className="text-xs text-muted-foreground">
          Must add up to {formatMoney(total, currency)}.
        </p>
      ) : null}
    </div>
  )
}

function SplitValueInput({
  id,
  method,
  currency,
  value,
  name,
  onChange,
}: {
  id: string
  method: SplitMethod
  currency: CurrencyCode
  value: number | undefined
  name: string
  onChange: (value: number | undefined) => void
}) {
  // Percentages are stored as basis points and weights as plain integers, so
  // each method needs its own text projection.
  const text =
    method === 'exact'
      ? value === undefined
        ? ''
        : toMajorString(value, currency)
      : method === 'percentage'
        ? value === undefined
          ? ''
          : String(Math.round((value / 100) * 100) / 100)
        : value === undefined
          ? ''
          : String(value)

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value
    if (raw === '') return onChange(undefined)

    if (method === 'exact') {
      const parsed = parseMoney(raw, currency)
      return onChange(parsed ?? undefined)
    }

    const numeric = Number(raw)
    if (Number.isNaN(numeric) || numeric < 0) return

    if (method === 'percentage') return onChange(Math.round(numeric * 100))
    return onChange(numeric)
  }

  const affix =
    method === 'exact' ? currencySymbol(currency) : method === 'percentage' ? '%' : '×'

  return (
    <div className="relative w-28 shrink-0">
      {method === 'exact' ? (
        <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {affix}
        </span>
      ) : (
        <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
          {affix}
        </span>
      )}
      <Input
        id={id}
        inputMode="decimal"
        value={text}
        onChange={handleChange}
        placeholder="0"
        aria-label={`${method === 'weighted' ? 'Shares' : method === 'exact' ? 'Amount' : 'Percentage'} for ${name}`}
        className={cn('tabular h-8 text-sm', method === 'exact' ? 'pl-8 text-right' : 'pr-7 text-right')}
      />
    </div>
  )
}

function SplitDifference({
  method,
  validation,
  currency,
}: {
  method: SplitMethod
  validation: SplitValidation
  currency: CurrencyCode
}) {
  if (validation.difference === 0) {
    return <span className="text-xs font-medium text-positive">Balanced</span>
  }

  const over = validation.difference > 0
  const magnitude = Math.abs(validation.difference)
  const text =
    method === 'percentage'
      ? `${Math.round((magnitude / 100) * 100) / 100}%`
      : formatMoney(magnitude, currency)

  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
      <AlertTriangle className="size-3.5" aria-hidden />
      {over ? `${text} over` : `${text} left`}
    </span>
  )
}

export { Button }
