import { ArrowRight, Check, Github } from 'lucide-react'
import Link from 'next/link'

import { DemoButton } from '@/components/landing/demo-button'
import { Faq } from '@/components/landing/faq'
import { FaqJsonLd } from '@/components/landing/faq-json-ld'
import { LedgerCard } from '@/components/landing/ledger-card'
import { BrandLockup } from '@/components/layout/brand'
import { cn } from '@/lib/utils/cn'
import { Button } from '@/components/ui/button'
import {
  EYEBROW,
  FEATURES,
  GITHUB_URL,
  HEADLINE,
  HERO_ASSURANCES,
  HOW_IT_WORKS,
  SUBHEADLINE,
  TRUST_SIGNALS,
} from '@/constants/landing'

export default function LandingPage() {
  return (
    <div className="force-light relative min-h-dvh bg-background text-foreground">
      {/*
        * A single page-wide wash sits behind every section, so the alternating
        * band backgrounds read as one surface rather than as stripes. It is
        * fixed and pointer-events-none, so it costs nothing to scroll past.
        */}
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <FaqJsonLd />

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
        {/* ── Hero ─────────────────────────────────────────────────────────── */}
        <section className="relative overflow-hidden border-b border-border">
          <div className="surface-grid-fade absolute inset-0 opacity-40" aria-hidden />
          <div
            className="absolute left-1/2 top-0 size-[36rem] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-20 blur-3xl"
            style={{ background: 'var(--primary)' }}
            aria-hidden
          />

          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14">
              <div className="text-center lg:text-left">
                <p className="mb-4 inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs font-medium text-muted-foreground">
                  <Check className="size-3.5 text-positive" aria-hidden />
                  {EYEBROW}
                </p>
                <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
                  {HEADLINE}
                </h1>
                <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg lg:mx-0">
                  {SUBHEADLINE}
                </p>

                <div className="mt-8 flex flex-col gap-2.5 sm:flex-row sm:justify-center lg:justify-start">
                  <Button asChild size="lg">
                    <Link href="/signup">
                      Get started free
                      <ArrowRight aria-hidden />
                    </Link>
                  </Button>
                  <DemoButton />
                </div>

                <p className="mt-4 text-xs text-muted-foreground">
                  {HERO_ASSURANCES.join(' · ')}
                </p>
              </div>

              {/* Below the copy on mobile, beside it from lg up. */}
              <LedgerCard animated className="mx-auto w-full max-w-sm lg:max-w-none" />
            </div>
          </div>
        </section>

        {/* ── How it works ─────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6" aria-labelledby="how-it-works">
          <h2
            id="how-it-works"
            className="text-center text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            How it works
          </h2>

          <ol className="mt-10 grid gap-6 sm:grid-cols-3">
            {HOW_IT_WORKS.map((step, index) => (
              <li
                key={step.title}
                className="flex gap-3.5 rounded-xl border border-border bg-card p-5 card-shadow sm:flex-col sm:gap-3"
              >
                <span
                  className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground"
                  aria-hidden
                >
                  {index + 1}
                </span>
                <div>
                  <h3 className="text-sm font-semibold">
                    <span className="sr-only">Step {index + 1}: </span>
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{step.body}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* ── Features ─────────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden border-t border-border bg-muted/30"
          aria-labelledby="features"
        >
          <div className="section-glow left-1/2 top-0 size-[34rem] -translate-x-1/2 opacity-[0.07]" aria-hidden />
          <div className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
              <h2
                id="features"
                className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl"
              >
                Splits that always add up.
              </h2>
              <p className="mt-3 text-muted-foreground">
                However you divide a bill, the parts add back up to the total, and every balance
                can be traced to the expenses that made it.
              </p>
            </div>

            {/*
               * Six columns, each card spanning two. Five cards would
               * otherwise leave the last row hanging on the left; starting
               * card four at column two centres the pair beneath the trio.
               */}
            <ul className="mt-12 grid gap-5 sm:grid-cols-2 lg:grid-cols-6">
              {FEATURES.map(({ icon: Icon, title, body, detail }, index) => (
                <li
                  key={title}
                  className={cn(
                    'rounded-xl border border-border bg-card p-5 card-shadow lg:col-span-2',
                    index === 3 && 'lg:col-start-2',
                  )}
                >
                  <span className="flex size-9 items-center justify-center rounded-lg bg-primary-muted text-primary">
                    <Icon className="size-4" aria-hidden />
                  </span>
                  <h3 className="mt-3.5 text-sm font-semibold">{title}</h3>
                  <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
                  {detail ? (
                    <p className="mt-2 border-t border-border pt-2 text-xs text-muted-foreground">
                      {detail}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── FAQ ──────────────────────────────────────────────────────────── */}
        <section className="mx-auto max-w-3xl px-4 pb-16 sm:px-6" aria-labelledby="faq">
          <h2
            id="faq"
            className="text-center text-2xl font-semibold tracking-tight sm:text-3xl"
          >
            Questions
          </h2>
          <div className="mt-8">
            <Faq />
          </div>
        </section>

        {/* ── Final CTA ────────────────────────────────────────────────────── */}
        <section
          className="relative overflow-hidden border-t border-border bg-muted/30"
          aria-labelledby="get-started"
        >
          <div className="surface-grid-fade absolute inset-0 opacity-40" aria-hidden />
          <div className="section-glow left-1/2 top-full size-[32rem] -translate-x-1/2 -translate-y-1/2 opacity-[0.10]" aria-hidden />
          <div className="relative mx-auto max-w-3xl px-4 py-16 text-center sm:px-6">
            <h2 id="get-started" className="text-2xl font-semibold tracking-tight">
              Stop reconciling the group chat.
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-muted-foreground">
              Add your first expense in a few seconds and watch the balances fall out of it.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
              <Button asChild size="lg">
                <Link href="/signup">
                  Start your first group
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <DemoButton />
            </div>

            <ul className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
              {TRUST_SIGNALS.map((signal) => (
                <li key={signal} className="flex items-center gap-1.5">
                  <Check className="size-3.5 text-positive" aria-hidden />
                  {signal}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:px-6">
          <BrandLockup href="/" />

          <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2" aria-label="Footer">
            <Link href="/login" className="hover:text-foreground">
              Log in
            </Link>
            <Link href="/signup" className="hover:text-foreground">
              Get started
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer noopener"
              className="flex items-center gap-1.5 hover:text-foreground"
            >
              <Github className="size-3.5" aria-hidden />
              GitHub
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
