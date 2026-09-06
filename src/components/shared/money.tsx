import { ArrowDownLeft, ArrowUpRight, Minus } from 'lucide-react'
import * as React from 'react'

import { formatMoney } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode, Money } from '@/types'

/**
 * Money rendering.
 *
 * Financial meaning is never carried by colour alone: every positive/negative
 * figure also gets a sign, an icon, or an explicit words-based label, so the
 * app reads correctly in greyscale and to a screen reader.
 */

interface AmountProps extends React.HTMLAttributes<HTMLSpanElement> {
  value: Money
  currency?: CurrencyCode
  /** Colour the value by sign. Off by default — most amounts are neutral. */
  tone?: 'auto' | 'neutral' | 'positive' | 'negative' | 'muted'
  signed?: boolean
  absolute?: boolean
  size?: 'xs' | 'sm' | 'base' | 'lg' | 'xl' | '2xl' | '3xl'
}

const sizeClasses = {
  xs: 'text-xs',
  sm: 'text-sm',
  base: 'text-base',
  lg: 'text-lg',
  xl: 'text-xl',
  '2xl': 'text-2xl',
  '3xl': 'text-3xl sm:text-4xl',
} as const

function toneClass(tone: AmountProps['tone'], value: number): string {
  const resolved =
    tone === 'auto' ? (value > 0 ? 'positive' : value < 0 ? 'negative' : 'muted') : tone

  switch (resolved) {
    case 'positive':
      return 'text-positive'
    case 'negative':
      return 'text-negative'
    case 'muted':
      return 'text-muted-foreground'
    default:
      return 'text-foreground'
  }
}

function Amount({
  value,
  currency = 'PKR',
  tone = 'neutral',
  signed = false,
  absolute = false,
  size = 'base',
  className,
  ...props
}: AmountProps) {
  return (
    <span
      className={cn(
        'tabular font-semibold',
        sizeClasses[size],
        toneClass(tone, value),
        className,
      )}
      {...props}
    >
      {formatMoney(value, currency, { signed, absolute })}
    </span>
  )
}

interface BalanceValueProps {
  value: Money
  currency?: CurrencyCode
  size?: AmountProps['size']
  /** Wording for the two directions. */
  labels?: { positive: string; negative: string; zero: string }
  className?: string
  /** Show the direction arrow. */
  showIcon?: boolean
}

/**
 * A balance with its meaning spelled out — "you're owed" / "you owe" — rather
 * than relying on a green or red number.
 */
function BalanceValue({
  value,
  currency = 'PKR',
  size = 'lg',
  labels = { positive: 'you’re owed', negative: 'you owe', zero: 'all settled' },
  className,
  showIcon = true,
}: BalanceValueProps) {
  const label = value > 0 ? labels.positive : value < 0 ? labels.negative : labels.zero
  const Icon = value > 0 ? ArrowDownLeft : value < 0 ? ArrowUpRight : Minus

  return (
    <span className={cn('inline-flex flex-col gap-0.5', className)}>
      <span className="inline-flex items-center gap-1.5">
        {showIcon ? (
          <Icon
            className={cn(
              'size-4 shrink-0',
              value > 0 ? 'text-positive' : value < 0 ? 'text-negative' : 'text-muted-foreground',
            )}
            aria-hidden
          />
        ) : null}
        <Amount
          value={value}
          currency={currency}
          size={size}
          tone="auto"
          absolute
        />
      </span>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
    </span>
  )
}

/** Compact inline pill for list rows, e.g. "you owe Rs 1,000". */
function BalancePill({
  value,
  currency = 'PKR',
  className,
  labels = { positive: 'owes you', negative: 'you owe', zero: 'settled up' },
}: {
  value: Money
  currency?: CurrencyCode
  className?: string
  labels?: { positive: string; negative: string; zero: string }
}) {
  if (value === 0) {
    return (
      <span className={cn('text-xs font-medium text-muted-foreground', className)}>
        {labels.zero}
      </span>
    )
  }

  return (
    <span className={cn('flex flex-col items-end leading-tight', className)}>
      <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {value > 0 ? labels.positive : labels.negative}
      </span>
      <Amount value={value} currency={currency} size="sm" tone="auto" absolute />
    </span>
  )
}

export { Amount, BalancePill, BalanceValue }
