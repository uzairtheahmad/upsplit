'use client'

import {
  calculateBalances,
  calculatePairwiseBalances,
} from '@/lib/balances/calculate-balances'
import { optimizeSettlements } from '@/lib/settlements/optimize-settlements'
import { createId, useAppStore, type AppState } from '@/lib/store/app-store'
import type {
  ActivityAction,
  ActivityEvent,
  Expense,
  Group,
  GroupMember,
  GroupRole,
  User,
} from '@/types'

import type {
  CreateExpenseInput,
  CreateGroupInput,
  CreateSettlementInput,
  DataServices,
  ExpenseQuery,
  UpdateExpenseInput,
  UpdateGroupInput,
} from '../types'

/**
 * Mock implementation of the data services.
 *
 * Every method is async and takes a short artificial delay, so the UI is built
 * against the same latency and loading states a real backend will impose. When
 * Phase 2 lands, only this file is replaced.
 */

const LATENCY_MS = 260

function delay<T>(value: T, ms = LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms))
}

function state(): AppState {
  return useAppStore.getState()
}

function write(recipe: (draft: AppState) => void) {
  useAppStore.getState().apply(recipe)
}

function now(): string {
  return new Date().toISOString()
}

function logActivity(
  draft: AppState,
  event: Omit<ActivityEvent, 'id' | 'createdAt' | 'actorId'> & { actorId?: string },
) {
  const entry: ActivityEvent = {
    id: createId('a'),
    createdAt: now(),
    actorId: event.actorId ?? draft.currentUserId,
    ...event,
  }
  draft.activity = [entry, ...draft.activity].slice(0, 200)
}

function live<T extends { deletedAt?: string | null }>(records: T[]): T[] {
  return records.filter((record) => !record.deletedAt)
}

function groupExpenses(groupId: string): Expense[] {
  return live(state().expenses).filter((expense) => expense.groupId === groupId)
}

function groupSettlements(groupId: string) {
  return live(state().settlements).filter((settlement) => settlement.groupId === groupId)
}

function groupMemberIds(groupId: string): string[] {
  return state()
    .members.filter((member) => member.groupId === groupId)
    .map((member) => member.userId)
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

function requireGroup(id: string): Group {
  const group = state().groups.find((candidate) => candidate.id === id)
  if (!group) throw new Error('That group no longer exists')
  return group
}

function requireExpense(id: string): Expense {
  const expense = state().expenses.find((candidate) => candidate.id === id)
  if (!expense || expense.deletedAt) throw new Error('That expense no longer exists')
  return expense
}

function matchesQuery(expense: Expense, query: ExpenseQuery, users: User[]): boolean {
  if (query.groupId && expense.groupId !== query.groupId) return false

  if (query.categories?.length && !query.categories.includes(expense.category)) return false

  if (query.payerIds?.length) {
    const payers = new Set(expense.payments.map((payment) => payment.userId))
    if (!query.payerIds.some((userId) => payers.has(userId))) return false
  }

  if (query.involvingIds?.length) {
    const involved = new Set([
      ...expense.payments.map((payment) => payment.userId),
      ...expense.participants.map((participant) => participant.userId),
    ])
    if (!query.involvingIds.some((userId) => involved.has(userId))) return false
  }

  if (query.from && expense.date < query.from) return false
  if (query.to && expense.date > query.to) return false
  if (query.minAmount !== undefined && expense.amount < query.minAmount) return false
  if (query.maxAmount !== undefined && expense.amount > query.maxAmount) return false

  if (query.search) {
    const needle = query.search.trim().toLowerCase()
    if (needle) {
      // Search covers the description, notes, category and the *names* of the
      // people involved — but people are still matched by id first, and the
      // name lookup is only ever used for text search, never for identity.
      const involvedIds = new Set([
        ...expense.payments.map((payment) => payment.userId),
        ...expense.participants.map((participant) => participant.userId),
      ])
      const names = users
        .filter((user) => involvedIds.has(user.id))
        .map((user) => user.name.toLowerCase())

      const haystack = [
        expense.description.toLowerCase(),
        expense.notes?.toLowerCase() ?? '',
        expense.category,
        ...names,
      ].join(' ')

      if (!haystack.includes(needle)) return false
    }
  }

  return true
}

function sortExpenses(expenses: Expense[], sort: ExpenseQuery['sort'] = 'date_desc'): Expense[] {
  const sorted = [...expenses]
  switch (sort) {
    case 'date_asc':
      return sorted.sort((a, b) => a.date.localeCompare(b.date) || a.createdAt.localeCompare(b.createdAt))
    case 'amount_desc':
      return sorted.sort((a, b) => b.amount - a.amount)
    case 'amount_asc':
      return sorted.sort((a, b) => a.amount - b.amount)
    case 'date_desc':
    default:
      return sorted.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt))
  }
}

export const mockServices: DataServices = {
  groups: {
    async list() {
      return delay(state().groups)
    },

    async get(id) {
      return delay(state().groups.find((group) => group.id === id) ?? null)
    },

    async create(input: CreateGroupInput) {
      const group: Group = {
        id: createId('g'),
        name: input.name.trim(),
        description: input.description?.trim() || undefined,
        currency: input.currency,
        icon: input.icon,
        color: input.color,
        createdBy: state().currentUserId,
        createdAt: now(),
        archivedAt: null,
      }

      write((draft) => {
        draft.groups = [group, ...draft.groups]

        // The creator is always the owner; anyone else invited joins as member.
        const memberIds = [
          draft.currentUserId,
          ...input.memberIds.filter((id) => id !== draft.currentUserId),
        ]
        draft.members = [
          ...draft.members,
          ...memberIds.map((userId, index) => ({
            userId,
            groupId: group.id,
            role: (index === 0 ? 'owner' : 'member') as GroupRole,
            joinedAt: now(),
          })),
        ]

        logActivity(draft, {
          groupId: group.id,
          action: 'group_created',
          subject: group.name,
          href: `/groups/${group.id}`,
        })
      })

      return delay(group)
    },

    async update(id, input: UpdateGroupInput) {
      requireGroup(id)
      write((draft) => {
        draft.groups = draft.groups.map((group) =>
          group.id === id ? { ...group, ...input } : group,
        )
      })
      return delay(requireGroup(id))
    },

    async archive(id) {
      write((draft) => {
        draft.groups = draft.groups.map((group) =>
          group.id === id ? { ...group, archivedAt: now() } : group,
        )
      })
      return delay(requireGroup(id))
    },

    async restore(id) {
      write((draft) => {
        draft.groups = draft.groups.map((group) =>
          group.id === id ? { ...group, archivedAt: null } : group,
        )
      })
      return delay(requireGroup(id))
    },

    async remove(id) {
      write((draft) => {
        draft.groups = draft.groups.filter((group) => group.id !== id)
        draft.members = draft.members.filter((member) => member.groupId !== id)
        // Expenses and settlements are soft-deleted, matching the Phase 2
        // schema, so the records survive for audit even once the group is gone.
        const stamp = now()
        draft.expenses = draft.expenses.map((expense) =>
          expense.groupId === id ? { ...expense, deletedAt: stamp } : expense,
        )
        draft.settlements = draft.settlements.map((settlement) =>
          settlement.groupId === id ? { ...settlement, deletedAt: stamp } : settlement,
        )
        draft.activity = draft.activity.filter((event) => event.groupId !== id)
      })
      return delay(undefined)
    },
  },

  members: {
    async listForGroup(groupId) {
      const { members, users } = state()
      const rows = members
        .filter((member) => member.groupId === groupId)
        .map((member) => {
          const user = users.find((candidate) => candidate.id === member.userId)
          return user ? { ...member, user } : null
        })
        .filter((row): row is GroupMember & { user: User } => row !== null)

      return delay(rows)
    },

    async add(groupId, userId, role = 'member') {
      const member: GroupMember = { userId, groupId, role, joinedAt: now() }
      write((draft) => {
        const exists = draft.members.some(
          (candidate) => candidate.groupId === groupId && candidate.userId === userId,
        )
        if (exists) return
        draft.members = [...draft.members, member]
        const user = draft.users.find((candidate) => candidate.id === userId)
        logActivity(draft, {
          groupId,
          action: 'member_joined',
          subject: user?.name ?? 'A new member',
          href: `/groups/${groupId}/members`,
        })
      })
      return delay(member)
    },

    async invite(groupId, name, email) {
      const user: User = {
        id: createId('u'),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        initials: initialsFor(name),
      }
      const member: GroupMember = { userId: user.id, groupId, role: 'member', joinedAt: now() }

      write((draft) => {
        const existing = draft.users.find(
          (candidate) => candidate.email.toLowerCase() === user.email,
        )
        const resolved = existing ?? user
        if (!existing) draft.users = [...draft.users, user]

        const alreadyMember = draft.members.some(
          (candidate) => candidate.groupId === groupId && candidate.userId === resolved.id,
        )
        if (!alreadyMember) {
          draft.members = [...draft.members, { ...member, userId: resolved.id }]
        }

        logActivity(draft, {
          groupId,
          action: 'member_joined',
          subject: resolved.name,
          href: `/groups/${groupId}/members`,
        })
      })

      return delay({ member, user })
    },

    async updateRole(groupId, userId, role) {
      write((draft) => {
        draft.members = draft.members.map((member) =>
          member.groupId === groupId && member.userId === userId ? { ...member, role } : member,
        )
      })
      const updated = state().members.find(
        (member) => member.groupId === groupId && member.userId === userId,
      )
      if (!updated) throw new Error('That member is no longer in the group')
      return delay(updated)
    },

    async remove(groupId, userId) {
      // Guard the invariant that matters: someone with money on the line
      // cannot be removed, or the group's ledger stops summing to zero.
      const balances = calculateBalances(
        groupExpenses(groupId),
        groupSettlements(groupId),
        groupMemberIds(groupId),
      )
      const balance = balances.find((candidate) => candidate.userId === userId)
      if (balance && balance.net !== 0) {
        throw new Error('Settle this member’s balance before removing them')
      }

      write((draft) => {
        const user = draft.users.find((candidate) => candidate.id === userId)
        draft.members = draft.members.filter(
          (member) => !(member.groupId === groupId && member.userId === userId),
        )
        logActivity(draft, {
          groupId,
          action: 'member_removed',
          subject: user?.name ?? 'A member',
          href: `/groups/${groupId}/members`,
        })
      })
      return delay(undefined)
    },
  },

  expenses: {
    async list(query = {}) {
      const { expenses, users } = state()
      const matched = live(expenses).filter((expense) => matchesQuery(expense, query, users))
      return delay(sortExpenses(matched, query.sort))
    },

    async get(id) {
      const expense = state().expenses.find((candidate) => candidate.id === id)
      return delay(expense && !expense.deletedAt ? expense : null)
    },

    async create(input: CreateExpenseInput) {
      const timestamp = now()
      const expense: Expense = {
        id: createId('e'),
        ...input,
        description: input.description.trim(),
        notes: input.notes?.trim() || undefined,
        createdBy: state().currentUserId,
        createdAt: timestamp,
        updatedAt: timestamp,
        deletedAt: null,
      }

      write((draft) => {
        draft.expenses = [expense, ...draft.expenses]
        logActivity(draft, {
          groupId: expense.groupId,
          action: 'expense_added',
          subject: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          href: `/groups/${expense.groupId}/expenses/${expense.id}`,
        })
      })

      return delay(expense)
    },

    async update(id, input: UpdateExpenseInput) {
      requireExpense(id)
      write((draft) => {
        draft.expenses = draft.expenses.map((expense) =>
          expense.id === id
            ? {
                ...expense,
                ...input,
                description: input.description?.trim() ?? expense.description,
                updatedAt: now(),
              }
            : expense,
        )
        const updated = draft.expenses.find((expense) => expense.id === id)!
        logActivity(draft, {
          groupId: updated.groupId,
          action: 'expense_updated',
          subject: updated.description,
          amount: updated.amount,
          currency: updated.currency,
          href: `/groups/${updated.groupId}/expenses/${updated.id}`,
        })
      })
      return delay(requireExpense(id))
    },

    async remove(id) {
      const expense = requireExpense(id)
      write((draft) => {
        // Soft delete — the row stays, so Phase 2 can restore or audit it.
        draft.expenses = draft.expenses.map((candidate) =>
          candidate.id === id ? { ...candidate, deletedAt: now() } : candidate,
        )
        draft.activity = draft.activity.filter(
          (event) => event.href !== `/groups/${expense.groupId}/expenses/${expense.id}`,
        )
        logActivity(draft, {
          groupId: expense.groupId,
          action: 'expense_deleted',
          subject: expense.description,
          amount: expense.amount,
          currency: expense.currency,
          href: `/groups/${expense.groupId}/expenses`,
        })
      })
      return delay(undefined)
    },
  },

  balances: {
    async forGroup(groupId) {
      return delay(
        calculateBalances(groupExpenses(groupId), groupSettlements(groupId), groupMemberIds(groupId)),
      )
    },

    async pairwiseForGroup(groupId) {
      return delay(calculatePairwiseBalances(groupExpenses(groupId), groupSettlements(groupId)))
    },

    async suggestionsForGroup(groupId) {
      const balances = calculateBalances(
        groupExpenses(groupId),
        groupSettlements(groupId),
        groupMemberIds(groupId),
      )
      return delay(optimizeSettlements(balances))
    },
  },

  settlements: {
    async list(groupId) {
      const all = live(state().settlements)
      const filtered = groupId
        ? all.filter((settlement) => settlement.groupId === groupId)
        : all
      return delay([...filtered].sort((a, b) => b.date.localeCompare(a.date)))
    },

    async record(input: CreateSettlementInput) {
      const settlement = {
        id: createId('st'),
        ...input,
        note: input.note?.trim() || undefined,
        createdBy: state().currentUserId,
        createdAt: now(),
        deletedAt: null,
      }

      write((draft) => {
        draft.settlements = [settlement, ...draft.settlements]
        logActivity(draft, {
          groupId: settlement.groupId,
          action: 'settlement_recorded',
          subject: 'a settlement',
          amount: settlement.amount,
          currency: settlement.currency,
          href: `/groups/${settlement.groupId}/balances`,
        })
      })

      return delay(settlement)
    },

    async remove(id) {
      write((draft) => {
        draft.settlements = draft.settlements.map((settlement) =>
          settlement.id === id ? { ...settlement, deletedAt: now() } : settlement,
        )
      })
      return delay(undefined)
    },
  },

  notifications: {
    async list() {
      return delay(
        [...state().notifications].sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
        80,
      )
    },

    async markRead(id) {
      write((draft) => {
        draft.notifications = draft.notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        )
      })
      return delay(undefined, 0)
    },

    async markAllRead() {
      write((draft) => {
        draft.notifications = draft.notifications.map((notification) => ({
          ...notification,
          read: true,
        }))
      })
      return delay(undefined, 0)
    },
  },

  profile: {
    async current() {
      const { users, currentUserId } = state()
      const user = users.find((candidate) => candidate.id === currentUserId)
      if (!user) throw new Error('No signed-in user')
      return delay(user, 0)
    },

    async update(input) {
      write((draft) => {
        draft.users = draft.users.map((user) =>
          user.id === draft.currentUserId
            ? {
                ...user,
                ...input,
                initials: input.name ? initialsFor(input.name) : user.initials,
              }
            : user,
        )
      })
      return delay(state().users.find((user) => user.id === state().currentUserId)!)
    },

    async preferences() {
      return delay(state().preferences, 0)
    },

    async updatePreferences(input) {
      write((draft) => {
        draft.preferences = { ...draft.preferences, ...input }
      })
      return delay(state().preferences)
    },
  },
}

export type { ActivityAction }
