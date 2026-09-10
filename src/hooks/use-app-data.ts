'use client'

import { useMemo } from 'react'

import {
  calculateBalances,
  calculatePairwiseBalances,
  splitOwedAndOwing,
} from '@/lib/balances/calculate-balances'
import { optimizeSettlements } from '@/lib/settlements/optimize-settlements'
import { useAppStore } from '@/lib/store/app-store'
import type { Expense, Group, Settlement, User } from '@/types'

/**
 * Read-side hooks.
 *
 * Each one selects a *raw* slice from the store — the collections are only
 * replaced when they actually change — and derives everything else in a memo.
 * Nothing derived is ever stored, so a balance cannot go stale.
 */

export function useCurrentUserId(): string {
  return useAppStore((state) => state.currentUserId)
}

export function useUsers(): User[] {
  return useAppStore((state) => state.users)
}

export function useCurrentUser(): User | undefined {
  const users = useUsers()
  const currentUserId = useCurrentUserId()
  return useMemo(
    () => users.find((user) => user.id === currentUserId),
    [users, currentUserId],
  )
}

/** id → user, for the many places that render a name from an id. */
export function useUserMap(): Map<string, User> {
  const users = useUsers()
  return useMemo(() => new Map(users.map((user) => [user.id, user])), [users])
}

export function useAllGroups(): Group[] {
  return useAppStore((state) => state.groups)
}

/** Groups the signed-in user actually belongs to, active ones first. */
export function useMyGroups(options: { includeArchived?: boolean } = {}): Group[] {
  const groups = useAllGroups()
  const members = useAppStore((state) => state.members)
  const currentUserId = useCurrentUserId()
  const { includeArchived = false } = options

  return useMemo(() => {
    const mine = new Set(
      members.filter((member) => member.userId === currentUserId).map((member) => member.groupId),
    )
    return groups
      .filter((group) => mine.has(group.id))
      .filter((group) => includeArchived || !group.archivedAt)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }, [groups, members, currentUserId, includeArchived])
}

export function useGroup(groupId: string | undefined): Group | undefined {
  const groups = useAllGroups()
  return useMemo(
    () => (groupId ? groups.find((group) => group.id === groupId) : undefined),
    [groups, groupId],
  )
}

export interface GroupMemberWithUser {
  userId: string
  groupId: string
  role: 'owner' | 'admin' | 'member'
  joinedAt: string
  user: User
}

export function useGroupMembers(groupId: string | undefined): GroupMemberWithUser[] {
  const members = useAppStore((state) => state.members)
  const userMap = useUserMap()

  return useMemo(() => {
    if (!groupId) return []
    const rank = { owner: 0, admin: 1, member: 2 } as const
    return members
      .filter((member) => member.groupId === groupId)
      .flatMap((member) => {
        const user = userMap.get(member.userId)
        return user ? [{ ...member, user }] : []
      })
      .sort((a, b) => rank[a.role] - rank[b.role] || a.user.name.localeCompare(b.user.name))
  }, [members, groupId, userMap])
}

/** The signed-in user's role in a group, used to gate destructive actions. */
export function useMyRole(groupId: string | undefined) {
  const members = useGroupMembers(groupId)
  const currentUserId = useCurrentUserId()
  const role = members.find((member) => member.userId === currentUserId)?.role
  return {
    role,
    isOwner: role === 'owner',
    canManageMembers: role === 'owner' || role === 'admin',
    canManageGroup: role === 'owner',
  }
}

/** Live expenses, optionally narrowed to a group. */
export function useExpenses(groupId?: string): Expense[] {
  const expenses = useAppStore((state) => state.expenses)
  return useMemo(
    () =>
      expenses
        .filter((expense) => !expense.deletedAt)
        .filter((expense) => !groupId || expense.groupId === groupId)
        .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt)),
    [expenses, groupId],
  )
}

export function useExpense(expenseId: string | undefined): Expense | undefined {
  const expenses = useAppStore((state) => state.expenses)
  return useMemo(
    () =>
      expenseId
        ? expenses.find((expense) => expense.id === expenseId && !expense.deletedAt)
        : undefined,
    [expenses, expenseId],
  )
}

export function useSettlements(groupId?: string): Settlement[] {
  const settlements = useAppStore((state) => state.settlements)
  return useMemo(
    () =>
      settlements
        .filter((settlement) => !settlement.deletedAt)
        .filter((settlement) => !groupId || settlement.groupId === groupId)
        .sort((a, b) => b.date.localeCompare(a.date)),
    [settlements, groupId],
  )
}

/** Expenses across every group the user is a member of. */
export function useMyExpenses(): Expense[] {
  const expenses = useExpenses()
  const groups = useMyGroups({ includeArchived: true })

  return useMemo(() => {
    const ids = new Set(groups.map((group) => group.id))
    return expenses.filter((expense) => ids.has(expense.groupId))
  }, [expenses, groups])
}

export function useMySettlements(): Settlement[] {
  const settlements = useSettlements()
  const groups = useMyGroups({ includeArchived: true })

  return useMemo(() => {
    const ids = new Set(groups.map((group) => group.id))
    return settlements.filter((settlement) => ids.has(settlement.groupId))
  }, [settlements, groups])
}

/** Everything the balances views need for one group, in one pass. */
export function useGroupLedger(groupId: string | undefined) {
  const expenses = useExpenses(groupId)
  const settlements = useSettlements(groupId)
  const members = useGroupMembers(groupId)
  const currentUserId = useCurrentUserId()

  return useMemo(() => {
    const memberIds = members.map((member) => member.userId)
    const balances = calculateBalances(expenses, settlements, memberIds)
    const pairwise = calculatePairwiseBalances(expenses, settlements)
    const suggestions = optimizeSettlements(balances)
    const summary = splitOwedAndOwing(pairwise, currentUserId)
    const myBalance = balances.find((balance) => balance.userId === currentUserId)

    return {
      expenses,
      settlements,
      members,
      memberIds,
      balances,
      pairwise,
      suggestions,
      summary,
      myBalance: myBalance ?? { userId: currentUserId, paid: 0, owed: 0, settled: 0, net: 0 },
      totalSpend: expenses.reduce((sum, expense) => sum + expense.amount, 0),
    }
  }, [expenses, settlements, members, currentUserId])
}

/**
 * The user's position across every group.
 *
 * Pairwise balances are computed *per group* and only then combined, because
 * netting across groups would silently claim that money owed in one group
 * cancels money owed in another — which is not something the app is entitled
 * to decide on the user's behalf.
 */
export function useGlobalLedger() {
  const expenses = useMyExpenses()
  const settlements = useMySettlements()
  const groups = useMyGroups({ includeArchived: true })
  const currentUserId = useCurrentUserId()

  return useMemo(() => {
    const perGroup = groups.map((group) => {
      const groupExpenses = expenses.filter((expense) => expense.groupId === group.id)
      const groupSettlements = settlements.filter(
        (settlement) => settlement.groupId === group.id,
      )
      const balances = calculateBalances(groupExpenses, groupSettlements)
      const pairwise = calculatePairwiseBalances(groupExpenses, groupSettlements)
      const summary = splitOwedAndOwing(pairwise, currentUserId)

      return {
        group,
        expenses: groupExpenses,
        settlements: groupSettlements,
        balances,
        pairwise,
        summary,
        myNet: balances.find((balance) => balance.userId === currentUserId)?.net ?? 0,
        totalSpend: groupExpenses.reduce((sum, expense) => sum + expense.amount, 0),
      }
    })

    const youOwe = perGroup.reduce((sum, entry) => sum + entry.summary.youOwe, 0)
    const youAreOwed = perGroup.reduce((sum, entry) => sum + entry.summary.youAreOwed, 0)

    /** Net position with each individual person, summed across groups. */
    const people = new Map<string, number>()
    for (const entry of perGroup) {
      for (const edge of entry.pairwise) {
        if (edge.fromUserId === currentUserId) {
          people.set(edge.toUserId, (people.get(edge.toUserId) ?? 0) - edge.amount)
        } else if (edge.toUserId === currentUserId) {
          people.set(edge.fromUserId, (people.get(edge.fromUserId) ?? 0) + edge.amount)
        }
      }
    }

    return {
      perGroup,
      youOwe,
      youAreOwed,
      net: youAreOwed - youOwe,
      activeGroups: groups.filter((group) => !group.archivedAt).length,
      people: [...people.entries()]
        .filter(([, amount]) => amount !== 0)
        .map(([userId, amount]) => ({ userId, amount }))
        .sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount)),
    }
  }, [expenses, settlements, groups, currentUserId])
}

export function useActivity(groupId?: string) {
  const activity = useAppStore((state) => state.activity)
  return useMemo(
    () => (groupId ? activity.filter((event) => event.groupId === groupId) : activity),
    [activity, groupId],
  )
}

export function useNotifications() {
  const notifications = useAppStore((state) => state.notifications)
  return useMemo(() => {
    const sorted = [...notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    return { notifications: sorted, unread: sorted.filter((n) => !n.read).length }
  }, [notifications])
}

export function usePreferences() {
  return useAppStore((state) => state.preferences)
}
