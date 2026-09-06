'use client'

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  CURRENT_USER_ID,
  seedExpenses,
  seedGroups,
  seedMembers,
  seedNotifications,
  seedPreferences,
  seedSettlements,
  seedUsers,
} from '@/services/mock/seed'
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
 * The Phase 1 in-memory database.
 *
 * This is deliberately a dumb, normalized record store — collections keyed the
 * way relational tables are, with no derived values held in state. Balances,
 * totals and suggestions are always computed from these records on read, so
 * they can never drift out of sync with the expenses that produced them.
 *
 * Phase 2 replaces the *service* layer above this, not the components: the
 * store keeps its role as the client cache, hydrated from Supabase instead of
 * from the seed.
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

  /** Mock auth: not a real session, just enough to gate the app routes. */
  isAuthenticated: boolean

  /** True once the persisted state has been read back on the client. */
  hydrated: boolean

  apply: (recipe: (state: AppState) => void) => void
  signIn: (email?: string) => void
  signOut: () => void
  resetToSeed: () => void
}

function seedActivity(): ActivityEvent[] {
  const recent = [...seedExpenses]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 12)

  const expenseEvents: ActivityEvent[] = recent.map((expense) => ({
    id: `a_${expense.id}`,
    groupId: expense.groupId,
    actorId: expense.createdBy,
    action: 'expense_added',
    subject: expense.description,
    amount: expense.amount,
    currency: expense.currency,
    createdAt: expense.createdAt,
    href: `/groups/${expense.groupId}/expenses/${expense.id}`,
  }))

  const settlementEvents: ActivityEvent[] = seedSettlements.map((settlement) => ({
    id: `a_${settlement.id}`,
    groupId: settlement.groupId,
    actorId: settlement.createdBy,
    action: 'settlement_recorded',
    subject: 'a settlement',
    amount: settlement.amount,
    currency: settlement.currency,
    createdAt: settlement.createdAt,
    href: `/groups/${settlement.groupId}/balances`,
  }))

  return [...expenseEvents, ...settlementEvents].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )
}

function initialState() {
  return {
    users: seedUsers,
    groups: seedGroups,
    members: seedMembers,
    expenses: seedExpenses,
    settlements: seedSettlements,
    notifications: seedNotifications,
    activity: seedActivity(),
    preferences: seedPreferences,
    currentUserId: CURRENT_USER_ID,
    isAuthenticated: false,
  }
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      ...initialState(),
      hydrated: false,

      /**
       * Single mutation entry point. Callers receive a shallow-cloned draft,
       * mutate the collections they care about, and the whole object is
       * swapped in — which keeps every write in one place and every read
       * referentially stable for components that did not change.
       */
      apply: (recipe) =>
        set((state) => {
          const draft: AppState = { ...state }
          recipe(draft)
          return draft
        }),

      signIn: (email) =>
        set((state) => {
          if (!email) return { isAuthenticated: true }
          // Sign in as a known member when the email matches, so the demo can
          // be viewed from more than one person's perspective.
          const match = state.users.find(
            (user) => user.email.toLowerCase() === email.trim().toLowerCase(),
          )
          return {
            isAuthenticated: true,
            currentUserId: match?.id ?? state.currentUserId,
          }
        }),

      signOut: () => set({ isAuthenticated: false }),

      resetToSeed: () => set({ ...initialState(), isAuthenticated: true, hydrated: true }),
    }),
    {
      name: 'upsplit:v1',
      version: 1,
      // `hydrated` is runtime-only — never read it back from storage.
      partialize: ({ hydrated: _hydrated, ...rest }) => rest,
      onRehydrateStorage: () => (state) => {
        state?.apply((draft) => {
          draft.hydrated = true
        })
      },
    },
  ),
)

/** Stable, collision-resistant ids for locally created records. */
export function createId(prefix: string): string {
  const random =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10)
  return `${prefix}_${random}`
}
