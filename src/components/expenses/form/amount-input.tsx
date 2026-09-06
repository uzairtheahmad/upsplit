'use client'

import * as React from 'react'

import { Field, Input } from '@/components/ui/input'
import { currencySymbol } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode } from '@/types'

interface AmountInputProps {
  value: string
  onChange: (value: string) => void
  currency: CurrencyCode
  label?: string
  id?: string
  error?: string
  autoFocus?: boolean
  /** Large display treatment for the primary expense amount. */
  emphasis?: boolean
  className?: string
}

/**
 * Numeric money entry.
 *
 * Keeps the raw text so a half-typed "12." is never rewritten under the
 * cursor; conversion to minor units happens once, in the form hook.
 */
export function AmountInput({
  value,
  onChange,
  currency,
  label = 'Amount',
  id = 'amount',
  error,
  autoFocus,
  emphasis,
  className,
}: AmountInputProps) {
  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.value
    // Allow only digits and a single decimal point while typing.
    if (next === '' || /^\d*\.?\d{0,2}$/.test(next.replace(/,/g, ''))) {
      onChange(next.replace(/,/g, ''))
    }
  }

  return (
    <Field label={label} htmlFor={id} error={error} className={className}>
      <div className="relative">
        <span
          className={cn(
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 font-medium text-muted-foreground',
            emphasis ? 'text-lg' : 'text-sm',
          )}
          aria-hidden
        >
          {currencySymbol(currency)}
        </span>
        <Input
          id={id}
          inputMode="decimal"
          autoComplete="off"
          placeholder="0.00"
          value={value}
          onChange={handleChange}
          autoFocus={autoFocus}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
          className={cn(
            'tabular pl-10',
            emphasis && 'h-14 text-2xl font-semibold pl-11',
          )}
        />
      </div>
    </Field>
  )
}
