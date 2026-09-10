'use client'

import { createClient } from '@/lib/supabase/client'
import { useAppStore } from '@/lib/store/app-store'
import type {
  Balance,
  Expense,
  Group,
  PairwiseBalance,
  Settlement,
  SettlementSuggestion,
  User,
} from '@/types'

import type {
  CreateExpenseInput,
  CreateGroupInput,
  CreateSettlementInput,
  DataServices,
  ExpenseQuery,
  InvitationPreview,
  UpdateExpenseInput,
  UpdateGroupInput,
} from '../types'

import {
  initialsFor,
  toComment,
  toExpense,
  toInviteLink,
  toGroup,
  toMember,
  toNotification,
  toPreferences,
  toSettlement,
  toUser,
  type ExpenseCommentRow,
  type ExpenseRow,
  type GroupMemberRow,
  type InviteLinkRow,
  type GroupRow,
  type NotificationRow,
  type ProfileRow,
  type SettlementRow,
} from './mappers'
import { refreshWorkspace } from './sync'

/**
 * The Supabase implementation of the data services.
 *
 * Two rules shape this file:
 *
 * 1. Every write goes through an RPC rather than a bare insert, because the
 *    RPCs re-validate the input and rebuild the ledger in one transaction.
 * 2. Every write is followed by refreshWorkspace(), so the cache shows what
 *    the database computed rather than what the client guessed.
 *
 * Balances are never sent to the server and never computed here — they are
 * read back from group_balances() and its siblings.
 */

const EXPENSE_SELECT = '*, expense_payments(*), expense_participants(*)'

function db() {
  return createClient()
}

/** PostgREST errors carry the database's message; surface it, not a generic one. */
function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

function currentUserId(): string {
  const id = useAppStore.getState().currentUserId
  if (!id) throw new Error('No signed-in user')
  return id
}

/** The RPCs take payments and participants as JSON arrays of snake_case keys. */
function paymentsJson(payments: Expense['payments']) {
  return payments.map((payment) => ({ user_id: payment.userId, amount: payment.amount }))
}

function participantsJson(participants: Expense['participants']) {
  return participants.map((participant) => ({
    user_id: participant.userId,
    value: participant.value ?? null,
  }))
}

async function fetchExpense(id: string): Promise<Expense | null> {
  const { data, error } = await db()
    .from('expenses')
    .select(EXPENSE_SELECT)
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ? toExpense(data as unknown as ExpenseRow) : null
}

async function fetchGroup(id: string): Promise<Group> {
  const { data, error } = await db().from('groups').select('*').eq('id', id).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('That group no longer exists')
  return toGroup(data as GroupRow)
}

export const supabaseServices: DataServices = {
  groups: {
    async list() {
      const rows = check(await db().from('groups').select('*'))
      return (rows as GroupRow[]).map(toGroup)
    },

    async get(id) {
      const { data, error } = await db().from('groups').select('*').eq('id', id).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? toGroup(data as GroupRow) : null
    },

    async create(input: CreateGroupInput) {
      const me = currentUserId()

      // Goes through an RPC rather than an insert. A plain
      // `insert(...).select()` cannot work here: SELECT policies apply to
      // RETURNING rows, and the caller only becomes a member via an AFTER
      // INSERT trigger that fires once the statement finishes — so the row
      // comes back denied. The RPC also makes the group and its members one
      // transaction instead of two round-trips.
      const { data, error } = await db().rpc('create_group', {
        p_name: input.name.trim(),
        p_currency: input.currency,
        p_icon: input.icon,
        p_color: input.color,
        p_description: input.description?.trim() || null,
        p_member_ids: input.memberIds.filter((id) => id !== me),
      })

      if (error) throw new Error(error.message)

      await refreshWorkspace()
      // The RPC returns the new id; reading the row back now succeeds,
      // because the owner membership is committed by this point.
      return fetchGroup(data as string)
    },

    async update(id, input: UpdateGroupInput) {
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.name = input.name.trim()
      if (input.description !== undefined) patch.description = input.description?.trim() || null
      if (input.currency !== undefined) patch.currency = input.currency
      if (input.icon !== undefined) patch.icon = input.icon
      if (input.color !== undefined) patch.color = input.color
      if (input.archivedAt !== undefined) patch.archived_at = input.archivedAt

      check(await db().from('groups').update(patch).eq('id', id).select('id'))
      await refreshWorkspace()
      return fetchGroup(id)
    },

    async archive(id) {
      check(
        await db()
          .from('groups')
          .update({ archived_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      )
      await refreshWorkspace()
      return fetchGroup(id)
    },

    async restore(id) {
      check(await db().from('groups').update({ archived_at: null }).eq('id', id).select('id'))
      await refreshWorkspace()
      return fetchGroup(id)
    },

    async remove(id) {
      check(await db().from('groups').delete().eq('id', id).select('id'))
      await refreshWorkspace()
    },
  },

  members: {
    async listForGroup(groupId) {
      const rows = check(
        await db().from('group_members').select('*, profiles(*)').eq('group_id', groupId),
      ) as unknown as Array<GroupMemberRow & { profiles: ProfileRow | null }>

      return rows.flatMap((row) =>
        row.profiles ? [{ ...toMember(row), user: toUser(row.profiles) }] : [],
      )
    },

    async add(groupId, userId, role = 'member') {
      const row = check(
        await db()
          .from('group_members')
          .insert({ group_id: groupId, user_id: userId, role })
          .select('*')
          .single(),
      )
      await refreshWorkspace()
      return toMember(row as GroupMemberRow)
    },

    async invite(groupId, email) {
      // Goes through an RPC because RLS on `profiles` hides anyone you do not
      // already share a group with — a client-side lookup by email can never
      // find a new person. The RPC matches on an exact address only, so it
      // cannot be used to enumerate accounts.
      const { data, error } = await db().rpc('invite_to_group', {
        p_group_id: groupId,
        p_email: email.trim(),
      })

      if (error) throw new Error(error.message)

      const result = data as
        | { status: 'already_member'; user_id: string }
        | { status: 'added'; user_id: string; email: string }
        | { status: 'pending'; email: string; token: string; group_name: string }

      // Nobody joined a group, so there is nothing new to load.
      if (result.status === 'pending') {
        return { status: 'pending', email: result.email, token: result.token }
      }

      await refreshWorkspace()

      const profile = check(
        await db().from('profiles').select('*').eq('id', result.user_id).single(),
      ) as ProfileRow
      const user = toUser(profile)

      if (result.status === 'already_member') {
        return { status: 'already_member', user }
      }

      const member = check(
        await db()
          .from('group_members')
          .select('*')
          .eq('group_id', groupId)
          .eq('user_id', result.user_id)
          .single(),
      ) as GroupMemberRow

      return { status: 'added', member: toMember(member), user }
    },

    async updateRole(groupId, userId, role) {
      const row = check(
        await db()
          .from('group_members')
          .update({ role })
          .eq('group_id', groupId)
          .eq('user_id', userId)
          .select('*')
          .single(),
      )
      await refreshWorkspace()
      return toMember(row as GroupMemberRow)
    },

    async remove(groupId, userId) {
      // The RPC refuses if the member still has a non-zero balance.
      const { error } = await db().rpc('remove_group_member', {
        p_group_id: groupId,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
      await refreshWorkspace()
    },

    async transferOwnership(groupId, userId) {
      // One statement, because the single-owner index forbids two owners
      // existing even momentarily.
      const { error } = await db().rpc('transfer_group_ownership', {
        p_group_id: groupId,
        p_user_id: userId,
      })
      if (error) throw new Error(error.message)
      await refreshWorkspace()
    },
  },

  inviteLinks: {
    async get(groupId) {
      const { data, error } = await db()
        .from('group_invite_links')
        .select('*')
        .eq('group_id', groupId)
        .maybeSingle()

      if (error) throw new Error(error.message)
      return data ? toInviteLink(data as InviteLinkRow) : null
    },

    async create(groupId, expiresAt = null) {
      const { error } = await db().rpc('create_invite_link', {
        p_group_id: groupId,
        p_expires_at: expiresAt,
      })
      if (error) throw new Error(error.message)

      // The RPC returns the token, but reading the row back gives the caller
      // the timestamps too, and proves the row is visible to them.
      const row = check(
        await db().from('group_invite_links').select('*').eq('group_id', groupId).single(),
      )
      return toInviteLink(row as InviteLinkRow)
    },

    async revoke(groupId) {
      const { error } = await db().rpc('revoke_invite_link', { p_group_id: groupId })
      if (error) throw new Error(error.message)
    },

    async accept(token) {
      const { data, error } = await db().rpc('accept_invite_link', { p_token: token })
      if (error) throw new Error(error.message)
      await refreshWorkspace()
      return data as string
    },
  },

  comments: {
    async listForExpense(expenseId) {
      const rows = check(
        await db()
          .from('expense_comments')
          .select('*')
          .eq('expense_id', expenseId)
          .is('deleted_at', null)
          .order('created_at'),
      )
      return (rows as ExpenseCommentRow[]).map(toComment)
    },

    async add(expenseId, body) {
      // An RPC, so posting also notifies the other people on the expense in
      // the same transaction.
      const { data, error } = await db().rpc('add_expense_comment', {
        p_expense_id: expenseId,
        p_body: body,
      })
      if (error) throw new Error(error.message)

      const row = check(
        await db().from('expense_comments').select('*').eq('id', data as string).single(),
      )
      return toComment(row as ExpenseCommentRow)
    },
  },

  expenses: {
    async list(query: ExpenseQuery = {}) {
      let builder = db().from('expenses').select(EXPENSE_SELECT).is('deleted_at', null)

      if (query.groupId) builder = builder.eq('group_id', query.groupId)
      if (query.categories?.length) builder = builder.in('category', query.categories)
      if (query.from) builder = builder.gte('expense_date', query.from)
      if (query.to) builder = builder.lte('expense_date', query.to)
      if (query.minAmount !== undefined) builder = builder.gte('amount', query.minAmount)
      if (query.maxAmount !== undefined) builder = builder.lte('amount', query.maxAmount)
      if (query.search?.trim()) {
        const needle = query.search.trim().replace(/[%,()]/g, ' ')
        builder = builder.or(`description.ilike.%${needle}%,notes.ilike.%${needle}%`)
      }

      switch (query.sort ?? 'date_desc') {
        case 'date_asc':
          builder = builder.order('expense_date').order('created_at')
          break
        case 'amount_desc':
          builder = builder.order('amount', { ascending: false })
          break
        case 'amount_asc':
          builder = builder.order('amount')
          break
        default:
          builder = builder
            .order('expense_date', { ascending: false })
            .order('created_at', { ascending: false })
      }

      const rows = check(await builder) as unknown as ExpenseRow[]
      const expenses = rows.map(toExpense)

      // Payer and participant filters run client-side: they test the embedded
      // child rows, which PostgREST cannot filter on without dropping the
      // other children from the result.
      return expenses.filter((expense) => {
        if (query.payerIds?.length) {
          const payers = new Set(expense.payments.map((payment) => payment.userId))
          if (!query.payerIds.some((id) => payers.has(id))) return false
        }
        if (query.involvingIds?.length) {
          const involved = new Set([
            ...expense.payments.map((payment) => payment.userId),
            ...expense.participants.map((participant) => participant.userId),
          ])
          if (!query.involvingIds.some((id) => involved.has(id))) return false
        }
        return true
      })
    },

    async get(id) {
      return fetchExpense(id)
    },

    async create(input: CreateExpenseInput) {
      const { data, error } = await db().rpc('create_expense', {
        p_group_id: input.groupId,
        p_description: input.description.trim(),
        p_amount: input.amount,
        p_currency: input.currency,
        p_category: input.category,
        p_expense_date: input.date,
        p_split_method: input.splitMethod,
        p_payments: paymentsJson(input.payments),
        p_participants: participantsJson(input.participants),
        p_notes: input.notes?.trim() || null,
      })

      if (error) throw new Error(error.message)
      await refreshWorkspace()

      const created = await fetchExpense(data as string)
      if (!created) throw new Error('The expense was created but could not be read back')
      return created
    },

    async update(id, input: UpdateExpenseInput) {
      // update_expense takes a complete expense, so anything the caller left
      // out is filled in from the row as it currently stands.
      const existing = await fetchExpense(id)
      if (!existing) throw new Error('That expense no longer exists')

      const notes = input.notes ?? existing.notes

      const { error } = await db().rpc('update_expense', {
        p_expense_id: id,
        p_description: (input.description ?? existing.description).trim(),
        p_amount: input.amount ?? existing.amount,
        p_category: input.category ?? existing.category,
        p_expense_date: input.date ?? existing.date,
        p_split_method: input.splitMethod ?? existing.splitMethod,
        p_payments: paymentsJson(input.payments ?? existing.payments),
        p_participants: participantsJson(input.participants ?? existing.participants),
        p_notes: notes?.trim() || null,
      })

      if (error) throw new Error(error.message)
      await refreshWorkspace()

      const updated = await fetchExpense(id)
      if (!updated) throw new Error('That expense no longer exists')
      return updated
    },

    async remove(id) {
      const { error } = await db().rpc('delete_expense', { p_expense_id: id })
      if (error) throw new Error(error.message)
      await refreshWorkspace()
    },
  },

  balances: {
    async forGroup(groupId): Promise<Balance[]> {
      const { data, error } = await db().rpc('group_balances', { p_group_id: groupId })
      if (error) throw new Error(error.message)
      return (data as Array<Record<string, unknown>>).map((row) => ({
        userId: row.user_id as string,
        paid: Number(row.paid),
        owed: Number(row.owed),
        settled: Number(row.settled),
        net: Number(row.net),
      }))
    },

    async pairwiseForGroup(groupId): Promise<PairwiseBalance[]> {
      const { data, error } = await db().rpc('group_pairwise_balances', { p_group_id: groupId })
      if (error) throw new Error(error.message)
      return (data as Array<Record<string, unknown>>).map((row) => ({
        fromUserId: row.from_user_id as string,
        toUserId: row.to_user_id as string,
        amount: Number(row.amount),
      }))
    },

    async suggestionsForGroup(groupId): Promise<SettlementSuggestion[]> {
      const { data, error } = await db().rpc('settlement_suggestions', { p_group_id: groupId })
      if (error) throw new Error(error.message)
      return (data as Array<Record<string, unknown>>).map((row) => ({
        fromUserId: row.from_user_id as string,
        toUserId: row.to_user_id as string,
        amount: Number(row.amount),
      }))
    },
  },

  settlements: {
    async list(groupId) {
      let builder = db()
        .from('settlements')
        .select('*')
        .is('deleted_at', null)
        .order('settled_on', { ascending: false })

      if (groupId) builder = builder.eq('group_id', groupId)

      return (check(await builder) as SettlementRow[]).map(toSettlement)
    },

    async record(input: CreateSettlementInput): Promise<Settlement> {
      const { data, error } = await db().rpc('record_settlement', {
        p_group_id: input.groupId,
        p_from_user_id: input.fromUserId,
        p_to_user_id: input.toUserId,
        p_amount: input.amount,
        p_currency: input.currency,
        p_settled_on: input.date,
        p_note: input.note?.trim() || null,
      })

      if (error) throw new Error(error.message)
      await refreshWorkspace()

      const row = check(
        await db()
          .from('settlements')
          .select('*')
          .eq('id', data as string)
          .single(),
      )
      return toSettlement(row as SettlementRow)
    },

    async remove(id) {
      // Settlements are soft-deleted; the trigger rebuilds the ledger.
      check(
        await db()
          .from('settlements')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      )
      await refreshWorkspace()
    },
  },

  notifications: {
    async list() {
      const rows = check(
        await db()
          .from('notifications')
          .select('*')
          .order('created_at', { ascending: false })
          .limit(100),
      )
      return (rows as NotificationRow[]).map(toNotification)
    },

    async markRead(id) {
      check(
        await db()
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('id', id)
          .select('id'),
      )
      useAppStore.getState().apply((draft) => {
        draft.notifications = draft.notifications.map((notification) =>
          notification.id === id ? { ...notification, read: true } : notification,
        )
      })
    },

    async markAllRead() {
      check(
        await db()
          .from('notifications')
          .update({ read_at: new Date().toISOString() })
          .eq('user_id', currentUserId())
          .is('read_at', null)
          .select('id'),
      )
      useAppStore.getState().apply((draft) => {
        draft.notifications = draft.notifications.map((notification) => ({
          ...notification,
          read: true,
        }))
      })
    },
  },

  profile: {
    async current(): Promise<User> {
      const row = check(
        await db().from('profiles').select('*').eq('id', currentUserId()).single(),
      )
      return toUser(row as ProfileRow)
    },

    async update(input) {
      const patch: Record<string, unknown> = {}
      if (input.name !== undefined) patch.full_name = input.name.trim()
      if (input.email !== undefined) patch.email = input.email.trim().toLowerCase()
      if (input.avatarUrl !== undefined) patch.avatar_url = input.avatarUrl || null

      const row = check(
        await db().from('profiles').update(patch).eq('id', currentUserId()).select('*').single(),
      )

      const user = toUser(row as ProfileRow)
      useAppStore.getState().apply((draft) => {
        draft.users = draft.users.map((candidate) =>
          candidate.id === user.id ? { ...user, initials: initialsFor(user.name) } : candidate,
        )
      })
      return user
    },

    async preferences() {
      const row = check(
        await db().from('profiles').select('*').eq('id', currentUserId()).single(),
      )
      return toPreferences(row as ProfileRow)
    },

    async updatePreferences(input) {
      const patch: Record<string, unknown> = {}
      if (input.defaultCurrency !== undefined) patch.default_currency = input.defaultCurrency

      const row = check(
        await db().from('profiles').update(patch).eq('id', currentUserId()).select('*').single(),
      )

      const preferences = toPreferences(row as ProfileRow)
      useAppStore.getState().apply((draft) => {
        draft.preferences = preferences
      })
      return preferences
    },

    async uploadAvatar(file) {
      const userId = currentUserId()
      const client = db()

      // The storage policy only permits writes inside a folder named after
      // your own user id, so the path is not cosmetic — it is the check.
      const extension = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const path = `${userId}/avatar-${Date.now()}.${extension}`

      const { error: uploadError } = await client.storage
        .from('avatars')
        .upload(path, file, { upsert: true, contentType: file.type })

      if (uploadError) throw new Error(uploadError.message)

      const {
        data: { publicUrl },
      } = client.storage.from('avatars').getPublicUrl(path)

      await supabaseServices.profile.update({ avatarUrl: publicUrl })
      return publicUrl
    },

    async removeAvatar() {
      await supabaseServices.profile.update({ avatarUrl: '' })
    },

    async deleteAccount() {
      const { error } = await db().rpc('delete_my_account')
      if (error) throw new Error(error.message)
    },
  },

  invitations: {
    async preview(token) {
      const { data, error } = await db().rpc('invitation_preview', { p_token: token })
      if (error) throw new Error(error.message)
      return data as InvitationPreview
    },

    async accept(token) {
      const { data, error } = await db().rpc('accept_invitation', { p_token: token })
      if (error) throw new Error(error.message)
      await refreshWorkspace()
      return data as string
    },
  },

  demo: {
    async start() {
      // Each visitor gets their own group, so exploring the demo cannot
      // disturb anyone else's and nothing needs resetting on a schedule.
      const { data, error } = await db().rpc('start_demo')
      if (error) throw new Error(error.message)
      await refreshWorkspace()
      return data as string
    },
  },
}
