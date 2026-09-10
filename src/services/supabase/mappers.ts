import type {
  ActivityAction,
  ActivityEvent,
  AppNotification,
  ExpenseComment,
  GroupInviteLink,
  CurrencyCode,
  Expense,
  ExpenseCategory,
  Group,
  GroupMember,
  GroupRole,
  Settlement,
  SplitMethod,
  User,
  UserPreferences,
} from '@/types'

/**
 * Row → domain object translation.
 *
 * The database is snake_case and the client is camelCase. That translation
 * happens here and nowhere else: no component and nothing in `src/lib` ever
 * sees a database column name.
 *
 * Money columns are `bigint`. PostgREST serialises those as JSON numbers, and
 * every amount UpSplit deals with is minor units well inside 2^53, so they
 * arrive as safe integers. `toMoney` asserts that rather than assuming it.
 */

function toMoney(value: unknown): number {
  const amount = typeof value === 'string' ? Number(value) : (value as number)
  if (!Number.isSafeInteger(amount)) {
    throw new Error(`Expected an integer minor-unit amount, got ${String(value)}`)
  }
  return amount
}

/** Initials fallback when a profile has no avatar. Matches the mock's rule. */
export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
}

export interface ProfileRow {
  id: string
  full_name: string
  email: string
  avatar_url: string | null
  default_currency: string
  email_notifications: boolean
  push_notifications: boolean
  weekly_summary: boolean
}

export function toUser(row: ProfileRow): User {
  return {
    id: row.id,
    name: row.full_name,
    email: row.email,
    avatarUrl: row.avatar_url ?? undefined,
    initials: initialsFor(row.full_name),
  }
}

export function toPreferences(row: ProfileRow): UserPreferences {
  return {
    defaultCurrency: row.default_currency as CurrencyCode,
    emailNotifications: row.email_notifications,
    pushNotifications: row.push_notifications,
    weeklySummary: row.weekly_summary,
  }
}

export interface GroupRow {
  id: string
  name: string
  description: string | null
  currency: string
  icon: string
  color: string
  created_by: string
  created_at: string
  archived_at: string | null
}

export function toGroup(row: GroupRow): Group {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? undefined,
    currency: row.currency as CurrencyCode,
    icon: row.icon,
    color: row.color,
    createdBy: row.created_by,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
  }
}

export interface GroupMemberRow {
  group_id: string
  user_id: string
  role: string
  joined_at: string
}

export function toMember(row: GroupMemberRow): GroupMember {
  return {
    groupId: row.group_id,
    userId: row.user_id,
    role: row.role as GroupRole,
    joinedAt: row.joined_at,
  }
}

export interface ExpenseRow {
  id: string
  group_id: string
  description: string
  notes: string | null
  amount: number | string
  currency: string
  category: string
  expense_date: string
  split_method: string
  created_by: string
  created_at: string
  updated_at: string
  deleted_at: string | null
  expense_payments?: Array<{ user_id: string; amount: number | string }> | null
  expense_participants?: Array<{ user_id: string; value: number | string | null }> | null
}

export function toExpense(row: ExpenseRow): Expense {
  return {
    id: row.id,
    groupId: row.group_id,
    description: row.description,
    notes: row.notes ?? undefined,
    amount: toMoney(row.amount),
    currency: row.currency as CurrencyCode,
    category: row.category as ExpenseCategory,
    date: row.expense_date,
    splitMethod: row.split_method as SplitMethod,
    payments: (row.expense_payments ?? []).map((payment) => ({
      userId: payment.user_id,
      amount: toMoney(payment.amount),
    })),
    participants: (row.expense_participants ?? []).map((participant) => ({
      userId: participant.user_id,
      // `equal` splits store null; the split engine treats that as "ignored".
      value: participant.value === null ? undefined : Number(participant.value),
    })),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }
}

export interface SettlementRow {
  id: string
  group_id: string
  from_user_id: string
  to_user_id: string
  amount: number | string
  currency: string
  settled_on: string
  note: string | null
  created_by: string
  created_at: string
  deleted_at: string | null
}

export function toSettlement(row: SettlementRow): Settlement {
  return {
    id: row.id,
    groupId: row.group_id,
    fromUserId: row.from_user_id,
    toUserId: row.to_user_id,
    amount: toMoney(row.amount),
    currency: row.currency as CurrencyCode,
    date: row.settled_on,
    note: row.note ?? undefined,
    createdBy: row.created_by,
    createdAt: row.created_at,
    deletedAt: row.deleted_at,
  }
}

export interface ActivityRow {
  id: string
  group_id: string
  actor_id: string
  action: string
  subject: string
  amount: number | string | null
  currency: string | null
  href: string | null
  created_at: string
}

/**
 * The database's activity_action enum has ten values; the client's
 * ActivityAction union has seven. The three the UI cannot render are dropped
 * rather than coerced into a different action, which would misreport history.
 */
const RENDERABLE_ACTIONS = new Set<ActivityAction>([
  'expense_added',
  'expense_updated',
  'expense_deleted',
  'settlement_recorded',
  'group_created',
  'member_joined',
  'member_removed',
])

export function toActivity(row: ActivityRow): ActivityEvent | null {
  if (!RENDERABLE_ACTIONS.has(row.action as ActivityAction)) return null
  return {
    id: row.id,
    groupId: row.group_id,
    actorId: row.actor_id,
    action: row.action as ActivityAction,
    subject: row.subject,
    amount: row.amount === null ? undefined : toMoney(row.amount),
    currency: (row.currency as CurrencyCode | null) ?? undefined,
    createdAt: row.created_at,
    href: row.href ?? undefined,
  }
}

export interface NotificationRow {
  id: string
  kind: string
  title: string
  body: string
  href: string | null
  read_at: string | null
  created_at: string
}

export function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    kind: row.kind as AppNotification['kind'],
    title: row.title,
    body: row.body,
    createdAt: row.created_at,
    read: row.read_at !== null,
    href: row.href ?? undefined,
  }
}

export interface ExpenseCommentRow {
  id: string
  expense_id: string
  author_id: string
  body: string
  created_at: string
  updated_at: string
}

export function toComment(row: ExpenseCommentRow): ExpenseComment {
  return {
    id: row.id,
    expenseId: row.expense_id,
    authorId: row.author_id,
    body: row.body,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

export interface InviteLinkRow {
  group_id: string
  token: string
  created_by: string
  created_at: string
  expires_at: string | null
  revoked_at: string | null
}

export function toInviteLink(row: InviteLinkRow): GroupInviteLink {
  return {
    groupId: row.group_id,
    token: row.token,
    createdBy: row.created_by,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }
}
