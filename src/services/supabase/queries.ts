import type { SupabaseClient } from '@supabase/supabase-js'

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

import {
  toActivity,
  toExpense,
  toGroup,
  toMember,
  toNotification,
  toPreferences,
  toSettlement,
  toUser,
  type ActivityRow,
  type ExpenseRow,
  type GroupMemberRow,
  type GroupRow,
  type NotificationRow,
  type ProfileRow,
  type SettlementRow,
} from './mappers'

/** Everything the client cache holds, for one signed-in user. */
export interface WorkspaceSnapshot {
  currentUserId: string
  users: User[]
  groups: Group[]
  members: GroupMember[]
  expenses: Expense[]
  settlements: Settlement[]
  activity: ActivityEvent[]
  notifications: AppNotification[]
  preferences: UserPreferences
}

/** How much history to pull. Both feeds are "recent activity", not archives. */
const ACTIVITY_LIMIT = 200
const NOTIFICATION_LIMIT = 100

function unwrap<T>(result: { data: T[] | null; error: { message: string } | null }): T[] {
  if (result.error) throw new Error(result.error.message)
  return result.data ?? []
}

/**
 * Loads the whole workspace for the signed-in user in one parallel pass.
 *
 * Every query here is unfiltered by group or user on purpose: RLS already
 * narrows each table to rows the caller may see, so adding client-side filters
 * would duplicate the policy and risk the two disagreeing. What comes back is
 * exactly "everything this person is allowed to know about".
 *
 * Returns null when nobody is signed in.
 */
export async function loadWorkspace(
  supabase: SupabaseClient,
): Promise<WorkspaceSnapshot | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return null

  const [profiles, groups, members, expenses, settlements, activity, notifications] =
    await Promise.all([
      supabase.from('profiles').select('*'),
      supabase.from('groups').select('*'),
      supabase.from('group_members').select('*'),
      // The two child tables are embedded, so an expense arrives whole rather
      // than needing a follow-up round trip per row.
      supabase
        .from('expenses')
        .select('*, expense_payments(*), expense_participants(*)')
        .is('deleted_at', null),
      supabase.from('settlements').select('*').is('deleted_at', null),
      supabase
        .from('activity_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(ACTIVITY_LIMIT),
      supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(NOTIFICATION_LIMIT),
    ])

  const profileRows = unwrap<ProfileRow>(profiles)
  const me = profileRows.find((row) => row.id === user.id)

  if (!me) {
    // The profile trigger fires on signup, so this means the row was removed
    // or the account predates the schema. Either way the app cannot render.
    throw new Error(
      'Your profile row is missing. Run the backfill query in docs/phase-2/setup.sql (Part 9).',
    )
  }

  return {
    currentUserId: user.id,
    users: profileRows.map(toUser),
    groups: unwrap<GroupRow>(groups).map(toGroup),
    members: unwrap<GroupMemberRow>(members).map(toMember),
    expenses: unwrap<ExpenseRow>(expenses).map(toExpense),
    settlements: unwrap<SettlementRow>(settlements).map(toSettlement),
    activity: unwrap<ActivityRow>(activity)
      .map(toActivity)
      .filter((event): event is ActivityEvent => event !== null),
    notifications: unwrap<NotificationRow>(notifications).map(toNotification),
    preferences: toPreferences(me),
  }
}
