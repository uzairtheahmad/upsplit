'use client'

import { useRouter } from 'next/navigation'
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

      if (event === 'SIGNED_OUT') {
        useAppStore.getState().clear()
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

/** Ends the Supabase session, empties the cache, and returns to /login. */
export function useSignOut(): () => Promise<void> {
  const router = useRouter()

  return React.useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    useAppStore.getState().clear()
    router.replace('/login')
    router.refresh()
  }, [router])
}

/** Re-reads everything from Supabase. Used by the "Refresh data" control. */
export function useRefreshWorkspace(): () => Promise<void> {
  return React.useCallback(async () => {
    await refreshWorkspace()
  }, [])
}
