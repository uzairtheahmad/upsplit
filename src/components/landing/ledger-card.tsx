import { cn } from '@/lib/utils/cn'

/**
 * The souvenirs ledger — the product's whole argument in one card.
 *
 * Uzair pays Rs 3,000 and is not in the split, so he is owed the full amount
 * and the three people who were in it each owe Rs 1,000. The rows sum to zero,
 * which is what "Adjustment Rs 0" is stating.
 *
 * `animated` staggers the rows in. The delays are inline custom properties
 * rather than Tailwind classes because they are per-row values; the animation
 * itself is a keyframe defined in globals.css, which is disabled wholesale
 * under prefers-reduced-motion.
 */

const ROWS = [
  { name: 'Uzair', detail: 'paid Rs 3,000 · not in split', net: '+Rs 3,000', tone: 'text-positive' },
  { name: 'Ali', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
  { name: 'Shaheer', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
  { name: 'Naveed', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
] as const

export function LedgerCard({
  animated = false,
  className,
}: {
  animated?: boolean
  className?: string
}) {
  /** Header first, then a row every 220ms, then the adjustment last. */
  const delay = (index: number) => ({ '--enter-delay': `${160 + index * 220}ms` }) as React.CSSProperties

  return (
    <figure
      className={cn('rounded-xl border border-border bg-card p-5 card-shadow', className)}
      aria-label="Worked example: Uzair pays Rs 3,000 for souvenirs and is not in the split. Ali, Shaheer and Naveed each owe Rs 1,000. The ledger balances to zero."
    >
      <div
        className={cn(
          'flex items-baseline justify-between border-b border-border pb-3',
          animated && 'motion-safe:animate-ledger-in',
        )}
        style={animated ? delay(0) : undefined}
      >
        <span className="text-sm font-medium">Souvenirs</span>
        <span className="tabular text-lg font-semibold">Rs 3,000</span>
      </div>

      <ul className="divide-y divide-border text-sm" aria-hidden>
        {ROWS.map((row, index) => (
          <li
            key={row.name}
            className={cn(
              'flex items-center justify-between gap-3 py-2.5',
              animated && 'motion-safe:animate-ledger-in',
            )}
            style={animated ? delay(index + 1) : undefined}
          >
            <span>
              <span className="block font-medium">{row.name}</span>
              <span className="block text-xs text-muted-foreground">{row.detail}</span>
            </span>
            <span className={cn('tabular font-semibold', row.tone)}>{row.net}</span>
          </li>
        ))}
      </ul>

      <div
        className={cn(
          'mt-3 flex items-center justify-between rounded-lg bg-positive-muted px-3 py-2 text-sm text-positive',
          animated && 'motion-safe:animate-ledger-in',
        )}
        style={animated ? delay(ROWS.length + 1) : undefined}
      >
        <span className="font-medium">Adjustment</span>
        <span className="tabular font-semibold">Rs 0</span>
      </div>
    </figure>
  )
}
