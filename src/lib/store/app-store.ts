'use client'

import { create } from 'zustand'

import type { WorkspaceSnapshot } from '@/services/supabase/queries'
import type {
  ActivityEvent,
  AppNotification,
  Expense,
  Group,
  GroupMember,
  Settlement,
  User,
  UserPreferences,
} from '@/types'

/**
 * The client cache.
 *
 * This is a dumb, normalized record store — collections keyed the way the
 * relational tables are, with no derived values held in state. Balances,
 * totals and suggestions are always computed from these records on read, so
 * they can never drift out of sync with the expenses that produced them.
 *
 * In Phase 1 it was hydrated from a seed file. It is now hydrated from
 * Supabase, which is why it is no longer persisted to localStorage: the server
 * owns this data, and a stale copy surviving a sign-out would be both wrong
 * and a privacy leak on a shared machine.
 */

export interface AppState {
  users: User[]
  groups: Group[]
  members: GroupMember[]
  expenses: Expense[]
  settlements: Settlement[]
  notifications: AppNotification[]
  activity: ActivityEvent[]
  preferences: UserPreferences
  currentUserId: string

  /** True when a Supabase session is present. */
  isAuthenticated: boolean

  /** True once the first load from Supabase has settled, success or failure. */
  hydrated: boolean

  /** Set when the last load failed, so the shell can show it rather than spin. */
  loadError: string | null

  /**
   * True from the moment sign-out is requested until the browser has left for
   * /login. Ending a session involves at least one network round trip, and
   * until this flag existed the shell went on rendering the signed-in page —
   * names, balances and all — for the whole of it. The shell watches this so
   * the workspace disappears on the click, not on the response.
   */
  signingOut: boolean

  apply: (recipe: (state: AppState) => void) => void
  hydrate: (snapshot: WorkspaceSnapshot) => void
  setLoadError: (message: string | null) => void
  clear: () => void
  beginSignOut: () => void
}

const EMPTY_PREFERENCES: UserPreferences = {
  defaultCurrency: 'PKR',
}

function emptyState() {
  return {
    users: [] as User[],
    groups: [] as Group[],
    members: [] as GroupMember[],
    expenses: [] as Expense[],
    settlements: [] as Settlement[],
    notifications: [] as AppNotification[],
    activity: [] as ActivityEvent[],
    preferences: EMPTY_PREFERENCES,
    currentUserId: '',
    isAuthenticated: false,
    hydrated: false,
    loadError: null as string | null,
    signingOut: false,
  }
}

export const useAppStore = create<AppState>()((set) => ({
  ...emptyState(),

  /**
   * Single mutation entry point. Callers receive a shallow-cloned draft,
   * mutate the collections they care about, and the whole object is swapped
   * in — which keeps every write in one place and every read referentially
   * stable for components that did not change.
   */
  apply: (recipe) =>
    set((state) => {
      const draft: AppState = { ...state }
      recipe(draft)
      return draft
    }),

  hydrate: (snapshot) =>
    set({
      ...snapshot,
      isAuthenticated: true,
      hydrated: true,
      loadError: null,
    }),

  setLoadError: (message) => set({ loadError: message, hydrated: true }),

  clear: () => set({ ...emptyState(), hydrated: true }),

  // Same wipe as clear(), but latches the flag the shell reads. Kept separate
  // because clear() also runs on an ordinary "no session" load, which must not
  // put the app into the leaving-now state.
  beginSignOut: () => set({ ...emptyState(), hydrated: true, signingOut: true }),
}))
