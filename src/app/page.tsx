import {
  ArrowRight,
  ChartPie,
  Check,
  Scale,
  Split,
  Users,
  Wallet,
} from 'lucide-react'
import Link from 'next/link'

import { BrandLockup } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'

const FEATURES = [
  {
    icon: Split,
    title: 'Four ways to split',
    body: 'Equally, by exact amounts, by percentage, or by shares. Rounding is distributed so the parts always add up to the total — never 33.33 three times.',
  },
  {
    icon: Wallet,
    title: 'Whoever actually paid',
    body: 'One payer, several payers, or someone covering a bill they had no part in. The maths handles all of it.',
  },
  {
    icon: Scale,
    title: 'Balances you can interrogate',
    body: 'Tap any balance to see the exact expenses behind it, line by line, right down to the settlement that cleared it.',
  },
  {
    icon: ArrowRight,
    title: 'The shortest way to square up',
    body: 'Debts are simplified across the whole group, so everyone settles in as few transfers as possible.',
  },
  {
    icon: ChartPie,
    title: 'Spending, not shuffling',
    body: 'Analytics count what the group actually spent. Payments between members never inflate the numbers.',
  },
  {
    icon: Users,
    title: 'Groups for every context',
    body: 'A trip, a flat, a friend group. Each keeps its own currency, members, expenses and balances.',
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-30 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <BrandLockup href="/" />
          <nav className="flex items-center gap-1.5" aria-label="Account">
            <Button asChild variant="ghost" size="sm">
              <Link href="/login">Log in</Link>
            </Button>
            <Button asChild size="sm">
              <Link href="/signup">Get started</Link>
            </Button>
          </nav>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="surface-grid absolute inset-0 opacity-30" aria-hidden />
          <div
            className="absolute left-1/2 top-0 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
            style={{ background: 'var(--primary)' }}
            aria-hidden
          />
          <div className="relative mx-auto max-w-3xl px-4 py-20 text-center sm:px-6 sm:py-28">
            <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
              <Check className="size-3.5 text-positive" aria-hidden />
              Every split balances to zero. Always.
            </p>
            <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
              Shared expenses, actually settled.
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
              Track what everyone paid, see exactly who owes whom, and clear the whole group in the
              fewest possible payments.
            </p>
            <div className="mt-8 flex flex-col justify-center gap-2.5 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Get started free
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/login">See the demo</Link>
              </Button>
            </div>
          </div>
        </section>

        {/* Worked example — the product's whole argument in one card. */}
        <section className="border-b border-border bg-muted/30">
          <div className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
            <div className="grid items-center gap-10 lg:grid-cols-2">
              <div className="space-y-3">
                <h2 className="text-2xl font-semibold tracking-tight">
                  The person who paid doesn’t have to be in the split.
                </h2>
                <p className="text-muted-foreground">
                  Uzair covers Rs 3,000 of souvenirs for three friends and buys nothing himself. Most
                  tools force him into the split. UpSplit doesn’t — he’s simply owed the full amount,
                  and the ledger still balances to zero.
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 card-shadow">
                <div className="flex items-baseline justify-between border-b border-border pb-3">
                  <span className="text-sm font-medium">Souvenirs</span>
                  <span className="tabular text-lg font-semibold">Rs 3,000</span>
                </div>
                <ul className="divide-y divide-border text-sm">
                  {[
                    { name: 'Uzair', detail: 'paid Rs 3,000 · not in split', net: '+Rs 3,000', tone: 'text-positive' },
                    { name: 'Ali', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
                    { name: 'Shaheer', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
                    { name: 'Naveed', detail: 'owes Rs 1,000', net: '−Rs 1,000', tone: 'text-negative' },
                  ].map((row) => (
                    <li key={row.name} className="flex items-center justify-between gap-3 py-2.5">
                      <span>
                        <span className="block font-medium">{row.name}</span>
                        <span className="block text-xs text-muted-foreground">{row.detail}</span>
                      </span>
                      <span className={`tabular font-semibold ${row.tone}`}>{row.net}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-positive-muted px-3 py-2 text-sm text-positive">
                  <span className="font-medium">Adjustment</span>
                  <span className="tabular font-semibold">Rs 0</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              Built around the accounting, not around the screens.
            </h2>
            <p className="mt-3 text-muted-foreground">
              Money is tracked in whole paisa, never floating point. Splits are checked before they
              are saved. Balances are derived, never stored.
            </p>
          </div>

          <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <li key={title} className="rounded-xl border border-border bg-card p-5 card-shadow">
                <span className="flex size-9 items-center justify-center rounded-lg bg-primary-muted text-primary">
                  <Icon className="size-4" aria-hidden />
                </span>
                <h3 className="mt-3.5 text-sm font-semibold">{title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* CTA */}
        <section className="border-t border-border bg-muted/30">
          <div className="mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 className="text-2xl font-semibold tracking-tight">
              Stop reconciling the group chat.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Add your first expense in a few seconds and watch the balances fall out of it.
            </p>
            <Button asChild size="lg" className="mt-7">
              <Link href="/signup">
                Create your account
                <ArrowRight aria-hidden />
              </Link>
            </Button>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <BrandLockup href="/" />
          <p>UpSplit — a demo product. No real money is involved.</p>
        </div>
      </footer>
    </div>
  )
}
