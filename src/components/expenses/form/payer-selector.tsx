'use client'

import { AlertTriangle, Check, Users } from 'lucide-react'
import * as React from 'react'

import { Amount } from '@/components/shared/money'
import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Field, Input } from '@/components/ui/input'
import { Label } from '@/components/ui/input'
import { currencySymbol, formatMoney } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode, Money, User } from '@/types'

interface PayerSelectorProps {
  members: User[]
  currentUserId: string
  payerIds: string[]
  payerAmounts: Record<string, string>
  total: Money
  paidTotal: Money
  currency: CurrencyCode
  multiple: boolean
  onToggleMultiple: (multiple: boolean) => void
  onSelectSingle: (userId: string) => void
  onTogglePayer: (userId: string) => void
  onPayerAmountChange: (userId: string, value: string) => void
  error?: string
}

/**
 * Who paid.
 *
 * Single-payer is the common case and stays a one-tap choice. Splitting the
 * payment across several people is one toggle away — the data model has always
 * supported it, so this is purely a UI affordance.
 */
export function PayerSelector({
  members,
  currentUserId,
  payerIds,
  payerAmounts,
  total,
  paidTotal,
  currency,
  multiple,
  onToggleMultiple,
  onSelectSingle,
  onTogglePayer,
  onPayerAmountChange,
  error,
}: PayerSelectorProps) {
  const remaining = total - paidTotal

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor="payer-list">Paid by</Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={() => onToggleMultiple(!multiple)}
          aria-pressed={multiple}
        >
          <Users aria-hidden />
          {multiple ? 'Single payer' : 'Multiple payers'}
        </Button>
      </div>

      {multiple ? (
        <div id="payer-list" className="space-y-2 rounded-lg border border-border p-2">
          {members.map((member) => {
            const selected = payerIds.includes(member.id)
            return (
              <div
                key={member.id}
                className={cn(
                  'flex items-center gap-2 rounded-md p-1.5 transition-colors',
                  selected && 'bg-accent/60',
                )}
              >
                <button
                  type="button"
                  onClick={() => onTogglePayer(member.id)}
                  aria-pressed={selected}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span
                    className={cn(
                      'flex size-[18px] shrink-0 items-center justify-center rounded-[5px] border',
                      selected
                        ? 'border-primary bg-primary text-primary-foreground'
                        : 'border-input bg-card',
                    )}
                    aria-hidden
                  >
                    {selected ? <Check className="size-3" strokeWidth={3} /> : null}
                  </span>
                  <UserAvatar user={member} size="xs" />
                  <span className="truncate text-sm">
                    {member.id === currentUserId ? 'You' : member.name}
                  </span>
                </button>

                {selected ? (
                  <div className="relative w-28 shrink-0">
                    <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                      {currencySymbol(currency)}
                    </span>
                    <Input
                      inputMode="decimal"
                      value={payerAmounts[member.id] ?? ''}
                      onChange={(event) => onPayerAmountChange(member.id, event.target.value)}
                      placeholder="0.00"
                      aria-label={`Amount paid by ${member.name}`}
                      className="tabular h-8 pl-8 text-right text-sm"
                    />
                  </div>
                ) : null}
              </div>
            )
          })}

          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-xs',
              remaining === 0 ? 'text-muted-foreground' : 'bg-warning-muted text-warning',
            )}
          >
            <span className="flex items-center gap-1.5 font-medium">
              {remaining !== 0 ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
              {remaining === 0
                ? 'Payments match the total'
                : remaining > 0
                  ? `${formatMoney(remaining, currency)} still unaccounted for`
                  : `${formatMoney(-remaining, currency)} more than the total`}
            </span>
            <Amount value={paidTotal} currency={currency} size="xs" tone="muted" />
          </div>
        </div>
      ) : (
        <div id="payer-list" className="flex flex-wrap gap-1.5">
          {members.map((member) => {
            const selected = payerIds[0] === member.id
            return (
              <button
                key={member.id}
                type="button"
                onClick={() => onSelectSingle(member.id)}
                aria-pressed={selected}
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-full border py-1 pl-1 pr-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                  selected
                    ? 'border-primary bg-primary-muted font-medium text-primary'
                    : 'border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground',
                )}
              >
                <UserAvatar user={member} size="xs" />
                <span className="truncate">{member.id === currentUserId ? 'You' : member.name.split(' ')[0]}</span>
              </button>
            )
          })}
        </div>
      )}

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

export { Field }
