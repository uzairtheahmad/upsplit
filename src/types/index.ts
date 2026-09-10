/**
 * Domain types for UpSplit.
 *
 * These deliberately mirror a normalized relational shape (see the Phase 2
 * plan): an expense owns a list of payments and a list of participant shares,
 * rather than a single `payerId` + `amount`. That makes multiple payers and
 * every split method representable without a later redesign.
 *
 * Identity is *always* by id. Never match people by name.
 */

/** An amount in integer minor units (paisa, cents). Never a float. */
export type Money = number

export type CurrencyCode = 'PKR' | 'USD' | 'EUR' | 'GBP' | 'AED'

export type ExpenseCategory =
  | 'food'
  | 'transport'
  | 'shopping'
  | 'bills'
  | 'entertainment'
  | 'travel'
  | 'accommodation'
  | 'groceries'
  | 'health'
  | 'education'
  | 'other'

export type SplitMethod = 'equal' | 'exact'

export type GroupRole = 'owner' | 'admin' | 'member'

export interface User {
  id: string
  name: string
  email: string
  avatarUrl?: string
  /** Short initials fallback when no avatar is set. */
  initials: string
}

export interface GroupMember {
  userId: string
  groupId: string
  role: GroupRole
  joinedAt: string
}

export interface Group {
  id: string
  name: string
  description?: string
  currency: CurrencyCode
  /** Lucide icon key from GROUP_ICONS. */
  icon: string
  /** Token key from GROUP_COLORS. */
  color: string
  createdBy: string
  createdAt: string
  archivedAt?: string | null
}

/** Who actually put money down. One row per payer — supports multiple payers. */
export interface ExpensePayment {
  userId: string
  amount: Money
}

/**
 * Who is being charged, and the raw input that determines their share.
 *
 * `value` is interpreted by the expense's split method:
 *   equal → ignored
 *   exact → the person's share, in minor units
 */
export interface ExpenseParticipant {
  userId: string
  value?: number
}

export interface Expense {
  id: string
  groupId: string
  description: string
  notes?: string
  /** Total of the expense, in minor units. Must equal sum(payments). */
  amount: Money
  currency: CurrencyCode
  category: ExpenseCategory
  /** ISO date (yyyy-mm-dd). */
  date: string
  splitMethod: SplitMethod
  payments: ExpensePayment[]
  participants: ExpenseParticipant[]
  createdBy: string
  createdAt: string
  updatedAt: string
  /** Soft delete — Phase 2 maps this straight to a `deleted_at` column. */
  deletedAt?: string | null
}

export interface Settlement {
  id: string
  groupId: string
  /** The person handing money over (a debtor paying down what they owe). */
  fromUserId: string
  /** The person receiving it. */
  toUserId: string
  amount: Money
  currency: CurrencyCode
  date: string
  note?: string
  createdBy: string
  createdAt: string
  deletedAt?: string | null
}

/** A signed financial effect on one person. Positive = is owed money. */
export interface LedgerEntry {
  userId: string
  groupId: string
  /** Source of the entry. */
  sourceType: 'expense' | 'settlement'
  sourceId: string
  amount: Money
}

/** Net position of one person, decomposed so the UI can explain the number. */
export interface Balance {
  userId: string
  /** Total this person put down. */
  paid: Money
  /** Total this person was charged. */
  owed: Money
  /** Net effect of settlements they have sent or received. */
  settled: Money
  /** paid - owed + settled. Positive = they are owed money. */
  net: Money
}

/** A directed net obligation between two people. Always a positive amount. */
export interface PairwiseBalance {
  fromUserId: string
  toUserId: string
  amount: Money
}

/** One line in the "You ↔ Ali" explainer. */
export interface PairwiseTransaction {
  sourceType: 'expense' | 'settlement'
  sourceId: string
  description: string
  date: string
  category?: ExpenseCategory
  /** Signed from the viewer's perspective. Positive = the other person owes you. */
  amount: Money
}

export interface SettlementSuggestion {
  fromUserId: string
  toUserId: string
  amount: Money
}

export type ActivityAction =
  | 'expense_added'
  | 'expense_updated'
  | 'expense_deleted'
  | 'settlement_recorded'
  | 'group_created'
  | 'member_joined'
  | 'member_removed'

export interface ActivityEvent {
  id: string
  groupId: string
  actorId: string
  action: ActivityAction
  /** Human-readable subject, e.g. the expense description. */
  subject: string
  amount?: Money
  currency?: CurrencyCode
  createdAt: string
  /** Where clicking the activity should take the user, if anywhere. */
  href?: string
}

/** One message in an expense's thread. */
export interface ExpenseComment {
  id: string
  expenseId: string
  authorId: string
  body: string
  createdAt: string
  updatedAt: string
}

/**
 * The group's shareable join link.
 *
 * `token` is only ever known to people who can already see the group; joining
 * takes the token alone, so a caller cannot name a group they were not given a
 * link to.
 */
export interface GroupInviteLink {
  groupId: string
  token: string
  createdBy: string
  createdAt: string
  expiresAt?: string | null
  revokedAt?: string | null
}

export type NotificationKind = 'expense' | 'settlement' | 'group' | 'reminder'

export interface AppNotification {
  id: string
  kind: NotificationKind
  title: string
  body: string
  createdAt: string
  read: boolean
  href?: string
}

export interface UserPreferences {
  defaultCurrency: CurrencyCode
  emailNotifications: boolean
  pushNotifications: boolean
  weeklySummary: boolean
}
