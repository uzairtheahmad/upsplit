import type {
  AppNotification,
  CurrencyCode,
  ExpenseComment,
  GroupInviteLink,
  Balance,
  Expense,
  Group,
  GroupMember,
  GroupRole,
  PairwiseBalance,
  Settlement,
  SettlementSuggestion,
  User,
  UserPreferences,
} from '@/types'

/**
 * The data-access contract.
 *
 * Supabase implements it, and it is the only thing the UI is allowed to know
 * about storage. Every method is async and returns plain domain objects, so a
 * component never sees a database row.
 *
 * Note what is *not* here: no method accepts a balance. Balances are always
 * derived from expenses and settlements, never submitted by the client, which
 * is why the write RPCs are shaped the way they are.
 */

export interface CreateGroupInput {
  name: string
  description?: string
  currency: Group['currency']
  icon: string
  color: string
  memberIds: string[]
}

export type UpdateGroupInput = Partial<Omit<Group, 'id' | 'createdBy' | 'createdAt'>>

export interface CreateExpenseInput {
  groupId: string
  description: string
  notes?: string
  amount: number
  currency: Expense['currency']
  category: Expense['category']
  date: string
  splitMethod: Expense['splitMethod']
  payments: Expense['payments']
  participants: Expense['participants']
}

export type UpdateExpenseInput = Partial<Omit<CreateExpenseInput, 'groupId'>>

export interface CreateSettlementInput {
  groupId: string
  fromUserId: string
  toUserId: string
  amount: number
  currency: Settlement['currency']
  date: string
  note?: string
}

export interface ExpenseQuery {
  groupId?: string
  search?: string
  categories?: Expense['category'][]
  /** Match expenses where any of these users paid. */
  payerIds?: string[]
  /** Match expenses involving any of these users, as payer or participant. */
  involvingIds?: string[]
  from?: string
  to?: string
  minAmount?: number
  maxAmount?: number
  sort?: 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc'
}

export interface GroupService {
  list(): Promise<Group[]>
  get(id: string): Promise<Group | null>
  create(input: CreateGroupInput): Promise<Group>
  update(id: string, input: UpdateGroupInput): Promise<Group>
  archive(id: string): Promise<Group>
  restore(id: string): Promise<Group>
  remove(id: string): Promise<void>
}

/**
 * The outcome of inviting an email address.
 *
 * Invitations are by email only — a name is never asked for, because the name
 * belongs to the account and is read from it. Someone who has not signed up
 * yet cannot be added to a group, so the invitation is stored and claimed
 * automatically when they register.
 */
export type InviteResult =
  | { status: 'added'; member: GroupMember; user: User }
  | { status: 'already_member'; user: User }
  | { status: 'pending'; email: string; token: string }

/**
 * What a stranger holding an invitation token is allowed to see.
 *
 * Deliberately narrow: the group's name, who invited them, and how big it is.
 * No member list, no other addresses, no amounts. The page has to say enough
 * for the recipient to recognise the invitation as real, and nothing more.
 */
export type InvitationPreview =
  | { status: 'invalid' }
  | { status: 'accepted'; group_name: string }
  | { status: 'expired'; group_name: string }
  | {
      status: 'valid'
      group_id: string
      group_name: string
      currency: CurrencyCode
      inviter_name: string
      email: string
      member_count: number
    }

export interface InvitationService {
  /** Readable without a session: the recipient has no account yet. */
  preview(token: string): Promise<InvitationPreview>
  /** Joins the group the token points at. Returns the group id. */
  accept(token: string): Promise<string>
}

export interface MemberService {
  listForGroup(groupId: string): Promise<Array<GroupMember & { user: User }>>
  add(groupId: string, userId: string, role?: GroupRole): Promise<GroupMember>
  invite(groupId: string, email: string): Promise<InviteResult>
  updateRole(groupId: string, userId: string, role: GroupRole): Promise<GroupMember>
  remove(groupId: string, userId: string): Promise<void>
  /**
   * Hand the group to another member.
   *
   * Separate from `updateRole` because a group may have exactly one owner, so
   * promoting a second one is impossible — the handover has to demote and
   * promote in a single statement.
   */
  transferOwnership(groupId: string, userId: string): Promise<void>
}

export interface CommentService {
  listForExpense(expenseId: string): Promise<ExpenseComment[]>
  add(expenseId: string, body: string): Promise<ExpenseComment>
}

export interface InviteLinkService {
  /** The group's current link, or null if none has been created. */
  get(groupId: string): Promise<GroupInviteLink | null>
  /** Creates the link, or rotates it — the previous token stops working. */
  create(groupId: string, expiresAt?: string | null): Promise<GroupInviteLink>
  revoke(groupId: string): Promise<void>
  /** Joins the group the token belongs to. Returns that group's id. */
  accept(token: string): Promise<string>
}

export interface ExpenseService {
  list(query?: ExpenseQuery): Promise<Expense[]>
  get(id: string): Promise<Expense | null>
  create(input: CreateExpenseInput): Promise<Expense>
  update(id: string, input: UpdateExpenseInput): Promise<Expense>
  remove(id: string): Promise<void>
}

export interface BalanceService {
  forGroup(groupId: string): Promise<Balance[]>
  pairwiseForGroup(groupId: string): Promise<PairwiseBalance[]>
  suggestionsForGroup(groupId: string): Promise<SettlementSuggestion[]>
}

export interface SettlementService {
  list(groupId?: string): Promise<Settlement[]>
  record(input: CreateSettlementInput): Promise<Settlement>
  remove(id: string): Promise<void>
}

export interface NotificationService {
  list(): Promise<AppNotification[]>
  markRead(id: string): Promise<void>
  markAllRead(): Promise<void>
}

export interface ProfileService {
  current(): Promise<User>
  update(input: Partial<Pick<User, 'name' | 'email' | 'avatarUrl'>>): Promise<User>
  preferences(): Promise<UserPreferences>
  updatePreferences(input: Partial<UserPreferences>): Promise<UserPreferences>
  /** Uploads to the avatars bucket and stores the URL. Returns the new URL. */
  uploadAvatar(file: File): Promise<string>
  removeAvatar(): Promise<void>
  /**
   * Anonymises the account: memberships dropped, profile scrubbed, financial
   * history left intact so nobody else's balances move. Refuses while any
   * balance is outstanding or a group you own still has other people in it.
   */
  deleteAccount(): Promise<void>
}

export interface DemoService {
  /**
   * Builds this visitor's own demo workspace and returns the group to land on.
   * Idempotent — calling it twice returns the group already built.
   */
  start(): Promise<string>
}

export interface DataServices {
  groups: GroupService
  members: MemberService
  invitations: InvitationService
  inviteLinks: InviteLinkService
  expenses: ExpenseService
  comments: CommentService
  balances: BalanceService
  settlements: SettlementService
  notifications: NotificationService
  profile: ProfileService
  demo: DemoService
}
