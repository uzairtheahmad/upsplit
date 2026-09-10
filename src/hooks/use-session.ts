'use client'

import * as React from 'react'

import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import { refreshWorkspace } from '@/services/supabase/sync'

/**
 * Loads the workspace once the shell mounts, and keeps it in step with the
 * auth session.
 *
 * Route protection itself lives in middleware — by the time this runs the user
 * is already known to be signed in. What this adds is the *data*: middleware
 * can say who you are, but only a query can say what you may see.
 */
export function useWorkspaceLoader(): void {
  React.useEffect(() => {
    const supabase = createClient()
    let active = true

    // Swallow the rejection: refreshWorkspace already records the message on
    // the store, which is what the shell renders.
    void refreshWorkspace().catch(() => {})

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!active) return

      // Also fires when the session ends somewhere else — a sign-out in
      // another tab, or a refresh token the server has revoked. Leaving the
      // page up in that case would show a stale workspace to whoever is
      // sitting at the machine, so take the same exit as a deliberate
      // sign-out.
      if (event === 'SIGNED_OUT') {
        leaveForLogin()
        return
      }

      // SIGNED_IN also fires on tab focus with a refreshed token. Reloading
      // then is harmless and keeps a long-lived tab from going stale.
      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        void refreshWorkspace().catch(() => {})
      }
    })

    return () => {
      active = false
      subscription.unsubscribe()
    }
  }, [])
}

/**
 * Empties the cache and sends the browser to /login.
 *
 * A hard navigation rather than `router.replace`, deliberately. A soft
 * navigation keeps the signed-in React tree mounted while Next fetches the
 * /login payload — through middleware, which itself re-validates the token
 * with Supabase — so the page the user just left stays on screen, fully
 * rendered, for the length of two network round trips. Replacing the document
 * also drops the client router cache, which would otherwise still hold the
 * RSC payloads of the pages that were just visited.
 */
let leaving = false

function leaveForLogin(): void {
  useAppStore.getState().beginSignOut()
  // signOut() makes Supabase emit SIGNED_OUT, so this runs twice on a normal
  // sign-out. The second call must not restart the navigation.
  if (leaving) return
  leaving = true
  window.location.replace('/login')
}

/** Ends the Supabase session, empties the cache, and returns to /login. */
export function useSignOut(): () => Promise<void> {
  return React.useCallback(async () => {
    // Blank the workspace before the first await. Everything below touches the
    // network, and the whole point is that none of it is allowed to happen
    // while the user's data is still on screen.
    useAppStore.getState().beginSignOut()


    const supabase = createClient()
    try {
      await supabase.auth.signOut()
    } catch {
      // Revoking the token server-side is best effort. The local session is
      // gone either way, and stranding someone on a signed-out-looking screen
      // because Supabase was unreachable helps nobody.
    }

    leaveForLogin()
  }, [])
}

/** Re-reads everything from Supabase. Used by the "Refresh data" control. */
export function useRefreshWorkspace(): () => Promise<void> {
  return React.useCallback(async () => {
    await refreshWorkspace()
  }, [])
}
