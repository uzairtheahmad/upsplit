import { AlertCircle, ArrowRight, Check, Users } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'

import { AcceptInvitation } from '@/components/invite/accept-invitation'
import { BrandLockup } from '@/components/layout/brand'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase/server'
import type { InvitationPreview } from '@/services/types'

/**
 * The page an emailed invitation links to.
 *
 * Public on purpose: the recipient has no account yet, which is the entire
 * reason the invitation exists. Middleware lets /invite through, and the
 * preview RPC is granted to `anon`.
 *
 * What it shows is deliberately thin. Somebody holding a token gets the
 * group's name, who invited them and how many people are in it, which is
 * enough to recognise the invitation as genuine. No member list, no other
 * addresses, no amounts.
 */

// The invitation can be accepted or expire at any moment, so a cached render
// would show a stale state to the one person who most needs the current one.
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: 'Your invitation',
  // An invitation token in a URL should not end up in a search index.
  robots: { index: false, follow: false },
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="force-light relative flex min-h-dvh flex-col bg-background text-foreground">
      <div
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            'radial-gradient(60rem 40rem at 50% -10%, color-mix(in oklch, var(--primary) 10%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <header className="border-b border-border">
        <div className="mx-auto flex h-14 max-w-6xl items-center px-4 sm:px-6">
          <BrandLockup href="/" />
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12 sm:px-6">
        <div className="w-full max-w-md">{children}</div>
      </main>
    </div>
  )
}

function Problem({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-8 text-center card-shadow">
      <span
        className="mx-auto flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
        aria-hidden
      >
        <AlertCircle className="size-5" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">{title}</h1>
      <p className="mt-1.5 text-sm text-muted-foreground">{body}</p>
      <Button asChild variant="outline" size="sm" className="mt-6">
        <Link href="/">Go to UpSplit</Link>
      </Button>
    </div>
  )
}

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>
}) {
  const { token } = await params
  const supabase = await createClient()

  const [{ data, error }, { data: auth }] = await Promise.all([
    supabase.rpc('invitation_preview', { p_token: token }),
    supabase.auth.getUser(),
  ])

  // A missing function or an unreachable database looks the same to the
  // visitor as a bad token, and it should: there is nothing they can do about
  // either. Log it, so the difference is visible to whoever runs the app.
  if (error) {
    console.error('[UpSplit] invitation_preview failed', error)
  }

  const preview = data as InvitationPreview | null

  if (!preview || preview.status === 'invalid') {
    return (
      <Shell>
        <Problem
          title="That invitation link is not valid"
          body="It may have been mistyped, or the group may have been deleted. Ask whoever invited you to send a new one."
        />
      </Shell>
    )
  }

  if (preview.status === 'expired') {
    return (
      <Shell>
        <Problem
          title="This invitation has expired"
          body={`Invitations to ${preview.group_name} are good for 14 days. Ask for a fresh one and it will work straight away.`}
        />
      </Shell>
    )
  }

  if (preview.status === 'accepted') {
    return (
      <Shell>
        <Problem
          title="This invitation has already been used"
          body={`If that was you, log in and you will find ${preview.group_name} waiting.`}
        />
      </Shell>
    )
  }

  const signedIn = Boolean(auth.user)

  // Carry the invitation through authentication, so signing up or logging in
  // returns here and the accept happens without the person clicking twice.
  const nextParam = encodeURIComponent(`/invite/${token}`)
  const signupHref = `/signup?next=${nextParam}&email=${encodeURIComponent(preview.email)}`
  const loginHref = `/login?next=${nextParam}`

  return (
    <Shell>
      <div className="rounded-xl border border-border bg-card p-8 card-shadow">
        <span
          className="flex size-11 items-center justify-center rounded-full bg-primary-muted text-primary"
          aria-hidden
        >
          <Users className="size-5" />
        </span>

        <p className="mt-5 text-sm text-muted-foreground">
          {preview.inviter_name} invited you to join
        </p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{preview.group_name}</h1>

        <p className="mt-3 text-sm text-muted-foreground">
          {preview.member_count === 1
            ? 'One person is in this group so far.'
            : `${preview.member_count} people are already in this group.`}{' '}
          Expenses are tracked in {preview.currency}.
        </p>

        {signedIn ? (
          <div className="mt-7">
            <AcceptInvitation token={token} groupName={preview.group_name} />
          </div>
        ) : (
          <>
            <div className="mt-7 space-y-2.5">
              <Button asChild size="lg" className="w-full">
                <Link href={signupHref}>
                  Create an account to join
                  <ArrowRight aria-hidden />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="w-full">
                <Link href={loginHref}>I already have an account</Link>
              </Button>
            </div>

            <p className="mt-4 text-xs text-muted-foreground">
              Sign up with <span className="font-medium text-foreground">{preview.email}</span> and
              you will be added to {preview.group_name} automatically.
            </p>
          </>
        )}

        <ul className="mt-7 space-y-2 border-t border-border pt-5 text-xs text-muted-foreground">
          {[
            'Free, and no card is ever asked for',
            'See exactly who owes whom, not just a running total',
            'Settle up in the fewest possible payments',
          ].map((line) => (
            <li key={line} className="flex items-start gap-2">
              <Check className="mt-0.5 size-3.5 shrink-0 text-positive" aria-hidden />
              {line}
            </li>
          ))}
        </ul>
      </div>
    </Shell>
  )
}
