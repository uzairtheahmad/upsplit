import type {
  AppNotification,
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
 * Phase 1 ships a mock implementation backed by local state; Phase 2 will ship
 * a Supabase implementation of the exact same interface. Every method is async
 * and returns plain domain objects, so nothing in the UI has to change when
 * the implementation is swapped.
 *
 * Note what is *not* here: no method accepts a balance. Balances are always
 * derived from expenses and settlements, never submitted by the client — which
 * is also how the Phase 2 RPCs will be shaped.
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

export interface MemberService {
  listForGroup(groupId: string): Promise<Array<GroupMember & { user: User }>>
  add(groupId: string, userId: string, role?: GroupRole): Promise<GroupMember>
  invite(groupId: string, name: string, email: string): Promise<{ member: GroupMember; user: User }>
  updateRole(groupId: string, userId: string, role: GroupRole): Promise<GroupMember>
  remove(groupId: string, userId: string): Promise<void>
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
}

export interface DataServices {
  groups: GroupService
  members: MemberService
  expenses: ExpenseService
  balances: BalanceService
  settlements: SettlementService
  notifications: NotificationService
  profile: ProfileService
}
