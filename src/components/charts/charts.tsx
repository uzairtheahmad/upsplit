'use client'

import * as React from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { categoryMeta } from '@/constants/categories'
import type { CategoryTotal, MonthlyTotal } from '@/lib/analytics/spending'
import { formatMoney, formatMoneyCompact, toMajorNumber } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import type { CurrencyCode, Money } from '@/types'

/**
 * Charts.
 *
 * All series colours come from the six validated categorical tokens; the axes
 * and grid are deliberately recessive, and every chart is paired with either
 * direct labels or an accessible table so identity is never carried by colour
 * alone. Values are formatted through the money layer so a chart can never
 * disagree with a figure shown elsewhere.
 */

const AXIS_STYLE = {
  fontSize: 11,
  fill: 'var(--muted-foreground)',
} as const

function ChartTooltip({
  active,
  payload,
  label,
  currency,
}: {
  active?: boolean
  payload?: Array<{ name?: string; value?: number; payload?: Record<string, unknown> }>
  label?: string
  currency: CurrencyCode
}) {
  if (!active || !payload?.length) return null
  const entry = payload[0]
  const minor = (entry.payload?.amount as Money) ?? 0

  return (
    <div className="rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs card-shadow-lg">
      <p className="font-medium text-foreground">
        {(entry.payload?.label as string) ?? label ?? entry.name}
      </p>
      <p className="tabular mt-0.5 text-muted-foreground">{formatMoney(minor, currency)}</p>
    </div>
  )
}

/* ── Monthly spending ─────────────────────────────────────────────────────── */

export function MonthlySpendingChart({
  data,
  currency,
  height = 260,
}: {
  data: MonthlyTotal[]
  currency: CurrencyCode
  height?: number
}) {
  const rows = data.map((row) => ({
    ...row,
    value: toMajorNumber(row.amount, currency),
  }))

  const max = Math.max(...rows.map((row) => row.value), 0)

  return (
    <figure className="w-full min-w-0 space-y-2">
      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }} barCategoryGap="28%">
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={AXIS_STYLE}
              dy={4}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_STYLE}
              width={66}
              tickFormatter={(value: number) =>
                formatMoneyCompact(Math.round(value * 100), currency)
              }
            />
            <RechartsTooltip
              cursor={{ fill: 'var(--accent)', radius: 6 }}
              content={<ChartTooltip currency={currency} />}
            />
            <Bar dataKey="value" radius={[4, 4, 0, 0]}>
              {rows.map((row) => (
                // One series, one hue: the peak month is emphasised by opacity
                // rather than by a second colour, which would imply a category.
                <Cell key={row.key} fill="var(--chart-1)" fillOpacity={row.value === max ? 1 : 0.55} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <figcaption className="sr-only">
        Monthly spending.{' '}
        {data.map((row) => `${row.label}: ${formatMoney(row.amount, currency)}`).join('. ')}
      </figcaption>
    </figure>
  )
}

/* ── Spending trend ───────────────────────────────────────────────────────── */

export function SpendingTrendChart({
  data,
  currency,
  height = 200,
}: {
  data: MonthlyTotal[]
  currency: CurrencyCode
  height?: number
}) {
  const rows = data.map((row) => ({ ...row, value: toMajorNumber(row.amount, currency) }))

  return (
    <figure className="w-full min-w-0 space-y-2">
      <div className="w-full min-w-0" style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={AXIS_STYLE} dy={4} />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={AXIS_STYLE}
              width={66}
              tickFormatter={(value: number) =>
                formatMoneyCompact(Math.round(value * 100), currency)
              }
            />
            <RechartsTooltip
              cursor={{ stroke: 'var(--border)', strokeWidth: 1 }}
              content={<ChartTooltip currency={currency} />}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="var(--chart-1)"
              strokeWidth={2}
              dot={{ r: 3, fill: 'var(--chart-1)', strokeWidth: 2, stroke: 'var(--card)' }}
              activeDot={{ r: 5, strokeWidth: 2, stroke: 'var(--card)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <figcaption className="sr-only">
        Spending over time.{' '}
        {data.map((row) => `${row.label}: ${formatMoney(row.amount, currency)}`).join('. ')}
      </figcaption>
    </figure>
  )
}

/* ── Category breakdown ───────────────────────────────────────────────────── */

/**
 * Donut plus a labelled legend.
 *
 * Only the top five categories get their own slot; everything else folds into a
 * neutral "Other" so the ramp is never cycled past six.
 */
export function CategoryChart({
  data,
  currency,
  total,
  className,
}: {
  data: CategoryTotal[]
  currency: CurrencyCode
  total: Money
  className?: string
}) {
  const top = data.slice(0, 5)
  const rest = data.slice(5)
  const restAmount = rest.reduce((sum, row) => sum + row.amount, 0)

  const slices = [
    ...top.map((row) => ({
      key: row.category as string,
      label: categoryMeta(row.category).label,
      amount: row.amount,
      percentage: row.percentage,
      color: `var(--chart-${categoryMeta(row.category).chart})`,
      value: toMajorNumber(row.amount, currency),
    })),
    ...(restAmount > 0
      ? [
          {
            key: 'other-fold',
            label: `Other (${rest.length})`,
            amount: restAmount,
            percentage: total === 0 ? 0 : Math.round((restAmount / total) * 1000) / 10,
            color: 'var(--chart-other)',
            value: toMajorNumber(restAmount, currency),
          },
        ]
      : []),
  ]

  if (slices.length === 0) {
    return (
      <p className={cn('py-10 text-center text-sm text-muted-foreground', className)}>
        No spending to break down yet.
      </p>
    )
  }

  return (
    <div className={cn('flex w-full min-w-0 flex-col items-center gap-5 sm:flex-row', className)}>
      <figure className="relative shrink-0" style={{ width: 168, height: 168 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="label"
              innerRadius={54}
              outerRadius={82}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {slices.map((slice) => (
                <Cell key={slice.key} fill={slice.color} />
              ))}
            </Pie>
            <RechartsTooltip content={<ChartTooltip currency={currency} />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Hero number in the hole — the thing people actually came to read. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[11px] text-muted-foreground">Total</span>
          <span className="tabular text-sm font-semibold">
            {formatMoneyCompact(total, currency)}
          </span>
        </div>
        <figcaption className="sr-only">Spending by category.</figcaption>
      </figure>

      {/* The legend doubles as the accessible table of values. */}
      <ul className="w-full min-w-0 space-y-1.5">
        {slices.map((slice) => (
          <li key={slice.key} className="flex items-center gap-2.5 text-sm">
            <span
              className="size-2.5 shrink-0 rounded-[3px]"
              style={{ backgroundColor: slice.color }}
              aria-hidden
            />
            <span className="min-w-0 flex-1 truncate text-muted-foreground">{slice.label}</span>
            <span className="tabular shrink-0 text-xs text-muted-foreground">
              {slice.percentage}%
            </span>
            <span className="tabular w-24 shrink-0 text-right font-medium">
              {formatMoney(slice.amount, currency)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
