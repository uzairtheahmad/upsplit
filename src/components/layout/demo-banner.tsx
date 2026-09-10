'use client'

import { X } from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { createClient } from '@/lib/supabase/client'

/**
 * Shown while a visitor is exploring the demo.
 *
 * The demo signs people in anonymously, so `is_anonymous` on the auth user is
 * the reliable signal — it cannot be faked by a real account, and it survives
 * a page reload without needing anything in the store.
 *
 * Dismissal is per-tab (sessionStorage) rather than permanent: a demo visitor
 * should be reminded again next time they come back, but not nagged while they
 * are looking around.
 */
const DISMISS_KEY = 'upsplit:demo-banner-dismissed'

export function DemoBanner() {
  const [isDemo, setIsDemo] = React.useState(false)
  const [dismissed, setDismissed] = React.useState(true)

  React.useEffect(() => {
    let active = true

    createClient()
      .auth.getUser()
      .then(({ data }) => {
        if (!active) return
        setIsDemo(Boolean(data.user?.is_anonymous))
        try {
          setDismissed(window.sessionStorage.getItem(DISMISS_KEY) === '1')
        } catch {
          // Private browsing can throw on storage access; show the banner.
          setDismissed(false)
        }
      })
      .catch(() => {
        // Not signed in, or the session could not be read — show nothing.
      })

    return () => {
      active = false
    }
  }, [])

  if (!isDemo || dismissed) return null

  function dismiss() {
    setDismissed(true)
    try {
      window.sessionStorage.setItem(DISMISS_KEY, '1')
    } catch {
      // Nothing to do — the banner is hidden for this render either way.
    }
  }

  return (
    <div className="border-b border-border bg-primary-muted">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 text-sm sm:px-6">
        <p className="min-w-0 flex-1 text-primary">
          You’re exploring a demo.{' '}
          <Link href="/signup" className="font-medium underline underline-offset-4">
            Create a free account
          </Link>{' '}
          to start your own group.
        </p>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss demo notice"
          className="shrink-0 rounded-md p-1 text-primary transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>
    </div>
  )
}
