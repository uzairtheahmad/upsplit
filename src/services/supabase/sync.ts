'use client'

import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'

import { loadWorkspace } from './queries'

/**
 * Reload the whole workspace into the client cache.
 *
 * Every write goes through a database RPC that also rebuilds the ledger, so
 * after any mutation the authoritative numbers live on the server. Rather than
 * trying to patch the cache to match — which is how balances drift — we simply
 * re-read. The payload is small (one person's groups) and this guarantees the
 * UI shows what the database actually computed.
 */
export async function refreshWorkspace(): Promise<void> {
  const store = useAppStore.getState()
  try {
    const snapshot = await loadWorkspace(createClient())
    if (snapshot) {
      store.hydrate(snapshot)
    } else {
      store.clear()
    }
  } catch (error) {
    store.setLoadError(error instanceof Error ? error.message : 'Could not load your data')
    throw error
  }
}
