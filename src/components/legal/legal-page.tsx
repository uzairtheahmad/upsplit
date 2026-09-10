import Link from 'next/link'

import { BrandLockup } from '@/components/layout/brand'

/**
 * The shell for /terms and /privacy.
 *
 * Both are public: being asked to accept terms you cannot read without an
 * account would be absurd, so middleware lets them through. Forced to light,
 * like the landing page, because that is the surface a signed-out visitor
 * sees.
 */
export function LegalPage({
  title,
  updated,
  children,
}: {
  title: string
  updated: string
  children: React.ReactNode
}) {
  return (
    <div className="force-light relative min-h-dvh bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4 sm:px-6">
          <BrandLockup href="/" />
          <Link href="/signup" className="text-sm font-medium text-primary hover:underline">
            Get started
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
        <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>

        <div className="mt-10 space-y-8">{children}</div>

        <p className="mt-14 border-t border-border pt-6 text-xs text-muted-foreground">
          UpSplit is an open-source project, not a company. This page is written in plain
          English to describe honestly what the software does. It is not legal advice, and it
          is not drafted by a lawyer.
        </p>
      </main>
    </div>
  )
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
    </section>
  )
}
