import { Scale, Sparkles, Users } from 'lucide-react'
import Link from 'next/link'

import { BrandLockup } from '@/components/layout/brand'

const HIGHLIGHTS = [
  {
    icon: Scale,
    title: 'Balances that explain themselves',
    body: 'Every number opens into the expenses that produced it. No more “why do I owe this?”',
  },
  {
    icon: Sparkles,
    title: 'Settle in the fewest payments',
    body: 'Debts are simplified across the whole group, so four people settle in three transfers, not six.',
  },
  {
    icon: Users,
    title: 'Splits that match real life',
    body: 'Equal or exact amounts, and the person who paid doesn’t have to be in the split.',
  },
]

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="flex flex-col px-5 py-6 sm:px-8">
        <BrandLockup href="/" />
        <div className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">{children}</div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          <Link href="/" className="underline-offset-4 hover:underline">
            Back to home
          </Link>
        </p>
      </div>

      {/* Decorative panel — hidden on small screens where it would only push
          the form below the fold. */}
      <div className="relative hidden overflow-hidden border-l border-border bg-muted/40 lg:block">
        <div className="surface-grid absolute inset-0 opacity-40" aria-hidden />
        <div
          className="absolute -right-24 -top-24 size-96 rounded-full opacity-25 blur-3xl"
          style={{ background: 'var(--primary)' }}
          aria-hidden
        />
        <div className="relative flex h-full flex-col justify-center gap-8 px-12 xl:px-16">
          <div className="space-y-3">
            <h2 className="max-w-sm text-2xl font-semibold tracking-tight">
              Shared money, without the spreadsheet.
            </h2>
            <p className="max-w-sm text-sm text-muted-foreground">
              UpSplit keeps track of who paid for what, works out who owes whom, and tells you the
              shortest way to square up.
            </p>
          </div>

          <ul className="space-y-5">
            {HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
              <li key={title} className="flex max-w-sm gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <span>
                  <span className="block text-sm font-medium">{title}</span>
                  <span className="mt-0.5 block text-sm text-muted-foreground">{body}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
