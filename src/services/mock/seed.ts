import { parseMoney } from '@/lib/money/money'
import { daysAgoISO } from '@/lib/utils/dates'
import type {
  AppNotification,
  Expense,
  ExpenseCategory,
  ExpenseParticipant,
  Group,
  GroupMember,
  Settlement,
  SplitMethod,
  User,
  UserPreferences,
} from '@/types'

/**
 * Seed data for the Phase 1 mock backend.
 *
 * Dates are generated relative to "now" at seed time so the dashboard, the
 * activity feed and the six-month analytics charts always look populated,
 * whenever the app is first opened.
 */

export const CURRENT_USER_ID = 'u_uzair'

export const seedUsers: User[] = [
  {
    id: 'u_uzair',
    name: 'Uzair Ahmed',
    email: 'shared.access@uptek.com',
    initials: 'UA',
  },
  { id: 'u_ali', name: 'Ali Raza', email: 'ali.raza@example.com', initials: 'AR' },
  { id: 'u_shaheer', name: 'Shaheer Khan', email: 'shaheer.khan@example.com', initials: 'SK' },
  { id: 'u_naveed', name: 'Naveed Iqbal', email: 'naveed.iqbal@example.com', initials: 'NI' },
  { id: 'u_hadi', name: 'Hadi Malik', email: 'hadi.malik@example.com', initials: 'HM' },
  { id: 'u_abdullah', name: 'Abdullah Yousaf', email: 'abdullah.y@example.com', initials: 'AY' },
  { id: 'u_maryam', name: 'Maryam Siddiqui', email: 'maryam.s@example.com', initials: 'MS' },
]

const rs = (major: string | number) => parseMoney(major, 'PKR')!

export const seedGroups: Group[] = [
  {
    id: 'g_hunza',
    name: 'Hunza Weekend Trip',
    description: 'Four days in Karimabad — hotel, fuel and far too much food.',
    currency: 'PKR',
    icon: 'plane',
    color: 'violet',
    createdBy: 'u_uzair',
    createdAt: new Date(Date.now() - 62 * 86_400_000).toISOString(),
  },
  {
    id: 'g_apartment',
    name: 'Apartment 4B',
    description: 'Rent, utilities and groceries for the flat.',
    currency: 'PKR',
    icon: 'home',
    color: 'cyan',
    createdBy: 'u_ali',
    createdAt: new Date(Date.now() - 190 * 86_400_000).toISOString(),
  },
  {
    id: 'g_university',
    name: 'University Friends',
    description: 'Coffee runs, birthdays and the occasional biryani.',
    currency: 'PKR',
    icon: 'users',
    color: 'green',
    createdBy: 'u_shaheer',
    createdAt: new Date(Date.now() - 150 * 86_400_000).toISOString(),
  },
  {
    id: 'g_roadtrip',
    name: 'Northern Road Trip',
    description: 'Islamabad to Skardu and back.',
    currency: 'PKR',
    icon: 'car',
    color: 'amber',
    createdBy: 'u_uzair',
    createdAt: new Date(Date.now() - 120 * 86_400_000).toISOString(),
  },
  {
    id: 'g_family',
    name: 'Family',
    description: 'Shared household and celebration costs.',
    currency: 'PKR',
    icon: 'wallet',
    color: 'pink',
    createdBy: 'u_uzair',
    createdAt: new Date(Date.now() - 300 * 86_400_000).toISOString(),
    archivedAt: new Date(Date.now() - 20 * 86_400_000).toISOString(),
  },
]

function members(
  groupId: string,
  entries: Array<[userId: string, role: GroupMember['role']]>,
  daysAgo: number,
): GroupMember[] {
  return entries.map(([userId, role]) => ({
    userId,
    groupId,
    role,
    joinedAt: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
  }))
}

export const seedMembers: GroupMember[] = [
  ...members(
    'g_hunza',
    [
      ['u_uzair', 'owner'],
      ['u_ali', 'admin'],
      ['u_shaheer', 'member'],
      ['u_naveed', 'member'],
    ],
    62,
  ),
  ...members(
    'g_apartment',
    [
      ['u_ali', 'owner'],
      ['u_uzair', 'admin'],
      ['u_hadi', 'member'],
    ],
    190,
  ),
  ...members(
    'g_university',
    [
      ['u_shaheer', 'owner'],
      ['u_uzair', 'member'],
      ['u_abdullah', 'member'],
      ['u_naveed', 'member'],
      ['u_maryam', 'member'],
    ],
    150,
  ),
  ...members(
    'g_roadtrip',
    [
      ['u_uzair', 'owner'],
      ['u_hadi', 'admin'],
      ['u_abdullah', 'member'],
    ],
    120,
  ),
  ...members(
    'g_family',
    [
      ['u_uzair', 'owner'],
      ['u_maryam', 'member'],
    ],
    300,
  ),
]

interface SeedExpense {
  id: string
  groupId: string
  description: string
  notes?: string
  major: string | number
  category: ExpenseCategory
  daysAgo: number
  splitMethod?: SplitMethod
  /** [userId, major amount] — defaults to a single payer covering the total. */
  paidBy: Array<[string, (string | number)?]>
  participants: Array<string | [string, number]>
  createdBy?: string
}

const seedExpenseData: SeedExpense[] = [
  // ── Hunza Weekend Trip ────────────────────────────────────────────────────
  {
    id: 'e_hunza_hotel',
    groupId: 'g_hunza',
    description: 'Eagle’s Nest Hotel — 2 nights',
    notes: 'Two twin rooms, breakfast included.',
    major: 48_000,
    category: 'accommodation',
    daysAgo: 58,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_ali', 'u_shaheer', 'u_naveed'],
  },
  {
    id: 'e_hunza_fuel',
    groupId: 'g_hunza',
    description: 'Fuel — Islamabad to Karimabad',
    major: 22_400,
    category: 'transport',
    daysAgo: 60,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_shaheer', 'u_naveed'],
  },
  {
    id: 'e_hunza_dinner',
    groupId: 'g_hunza',
    description: 'Dinner at Cafe de Hunza',
    major: 8_600,
    category: 'food',
    daysAgo: 58,
    paidBy: [['u_shaheer']],
    participants: ['u_uzair', 'u_ali', 'u_shaheer', 'u_naveed'],
  },
  {
    id: 'e_hunza_jeep',
    groupId: 'g_hunza',
    description: 'Jeep to Khunjerab Pass',
    major: 18_000,
    category: 'travel',
    daysAgo: 57,
    // Split by shares: Naveed took the front seat for the whole trip.
    splitMethod: 'weighted',
    paidBy: [['u_uzair']],
    participants: [
      ['u_uzair', 1],
      ['u_ali', 1],
      ['u_shaheer', 1],
      ['u_naveed', 2],
    ],
  },
  {
    id: 'e_hunza_groceries',
    groupId: 'g_hunza',
    description: 'Snacks and water for the drive',
    major: 3_450,
    category: 'groceries',
    daysAgo: 60,
    paidBy: [['u_naveed']],
    participants: ['u_uzair', 'u_ali', 'u_shaheer', 'u_naveed'],
  },
  {
    id: 'e_hunza_souvenirs',
    groupId: 'g_hunza',
    description: 'Souvenirs from Altit Fort',
    notes: 'Uzair covered this one — he wasn’t buying anything himself.',
    major: 6_000,
    category: 'shopping',
    daysAgo: 56,
    // Rule 3: the payer is deliberately not a participant.
    paidBy: [['u_uzair']],
    participants: ['u_ali', 'u_shaheer', 'u_naveed'],
  },
  {
    id: 'e_hunza_lunch',
    groupId: 'g_hunza',
    description: 'Lunch stop at Besham',
    major: 5_200,
    category: 'food',
    daysAgo: 55,
    paidBy: [
      ['u_ali', 3_000],
      ['u_shaheer', 2_200],
    ],
    participants: ['u_uzair', 'u_ali', 'u_shaheer', 'u_naveed'],
  },

  // ── Apartment 4B ──────────────────────────────────────────────────────────
  {
    id: 'e_apt_rent_aug',
    groupId: 'g_apartment',
    description: 'Rent — August',
    major: 90_000,
    category: 'bills',
    daysAgo: 36,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_electricity',
    groupId: 'g_apartment',
    description: 'Electricity bill',
    notes: 'Higher than usual — the AC ran all month.',
    major: 18_750,
    category: 'bills',
    daysAgo: 24,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_internet',
    groupId: 'g_apartment',
    description: 'Internet — StormFiber',
    major: 4_500,
    category: 'bills',
    daysAgo: 22,
    paidBy: [['u_hadi']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_groceries_1',
    groupId: 'g_apartment',
    description: 'Weekly groceries — Imtiaz',
    major: 12_300,
    category: 'groceries',
    daysAgo: 19,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_groceries_2',
    groupId: 'g_apartment',
    description: 'Weekly groceries — Al-Fatah',
    major: 9_850,
    category: 'groceries',
    daysAgo: 11,
    paidBy: [['u_hadi']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_maid',
    groupId: 'g_apartment',
    description: 'Cleaning help — monthly',
    major: 8_000,
    category: 'other',
    daysAgo: 8,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_gas',
    groupId: 'g_apartment',
    description: 'Gas cylinder refill',
    major: 3_600,
    category: 'bills',
    daysAgo: 4,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_water',
    groupId: 'g_apartment',
    description: 'Water tanker',
    major: 2_500,
    category: 'bills',
    daysAgo: 2,
    paidBy: [['u_hadi']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_rent_jul',
    groupId: 'g_apartment',
    description: 'Rent — July',
    major: 90_000,
    category: 'bills',
    daysAgo: 67,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_rent_jun',
    groupId: 'g_apartment',
    description: 'Rent — June',
    major: 90_000,
    category: 'bills',
    daysAgo: 98,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_rent_may',
    groupId: 'g_apartment',
    description: 'Rent — May',
    major: 85_000,
    category: 'bills',
    daysAgo: 129,
    paidBy: [['u_ali']],
    participants: ['u_uzair', 'u_ali', 'u_hadi'],
  },
  {
    id: 'e_apt_furniture',
    groupId: 'g_apartment',
    description: 'Study desk and chair',
    major: 26_000,
    category: 'shopping',
    daysAgo: 84,
    // Exact split: Hadi wanted the better chair.
    splitMethod: 'exact',
    paidBy: [['u_uzair']],
    participants: [
      ['u_uzair', rs(8_000)],
      ['u_ali', rs(8_000)],
      ['u_hadi', rs(10_000)],
    ],
  },

  // ── University Friends ────────────────────────────────────────────────────
  {
    id: 'e_uni_biryani',
    groupId: 'g_university',
    description: 'Biryani at Student Biryani',
    major: 4_750,
    category: 'food',
    daysAgo: 13,
    paidBy: [['u_shaheer']],
    participants: ['u_uzair', 'u_shaheer', 'u_abdullah', 'u_naveed', 'u_maryam'],
  },
  {
    id: 'e_uni_coffee',
    groupId: 'g_university',
    description: 'Coffee at Chaaye Khana',
    major: 2_400,
    category: 'food',
    daysAgo: 6,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_shaheer', 'u_maryam'],
  },
  {
    id: 'e_uni_movie',
    groupId: 'g_university',
    description: 'Movie tickets — Cinepax',
    major: 6_000,
    category: 'entertainment',
    daysAgo: 27,
    paidBy: [['u_abdullah']],
    participants: ['u_uzair', 'u_shaheer', 'u_abdullah', 'u_naveed'],
  },
  {
    id: 'e_uni_birthday',
    groupId: 'g_university',
    description: 'Maryam’s birthday cake and gift',
    notes: 'Split between everyone except the birthday girl.',
    major: 9_500,
    category: 'shopping',
    daysAgo: 41,
    // Rule 3 again: Maryam is neither payer nor participant.
    paidBy: [['u_shaheer']],
    participants: ['u_uzair', 'u_shaheer', 'u_abdullah', 'u_naveed'],
  },
  {
    id: 'e_uni_uber',
    groupId: 'g_university',
    description: 'Careem to campus',
    major: 1_100,
    category: 'transport',
    daysAgo: 6,
    paidBy: [['u_maryam']],
    participants: ['u_uzair', 'u_maryam', 'u_shaheer'],
  },
  {
    id: 'e_uni_books',
    groupId: 'g_university',
    description: 'Shared textbooks',
    major: 7_800,
    category: 'education',
    daysAgo: 72,
    splitMethod: 'percentage',
    paidBy: [['u_uzair']],
    participants: [
      ['u_uzair', 4000],
      ['u_abdullah', 3000],
      ['u_naveed', 3000],
    ],
  },
  {
    id: 'e_uni_lunch',
    groupId: 'g_university',
    description: 'Lunch at Kababjees',
    major: 5_600,
    category: 'food',
    daysAgo: 47,
    paidBy: [['u_naveed']],
    participants: ['u_uzair', 'u_shaheer', 'u_abdullah', 'u_naveed'],
  },
  {
    id: 'e_uni_arcade',
    groupId: 'g_university',
    description: 'Arcade night',
    major: 3_200,
    category: 'entertainment',
    daysAgo: 103,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_shaheer', 'u_abdullah'],
  },

  // ── Northern Road Trip ────────────────────────────────────────────────────
  {
    id: 'e_road_fuel_1',
    groupId: 'g_roadtrip',
    description: 'Fuel — first leg',
    major: 16_800,
    category: 'transport',
    daysAgo: 112,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },
  {
    id: 'e_road_hotel',
    groupId: 'g_roadtrip',
    description: 'Skardu guesthouse — 3 nights',
    major: 33_000,
    category: 'accommodation',
    daysAgo: 110,
    paidBy: [
      ['u_hadi', 20_000],
      ['u_abdullah', 13_000],
    ],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },
  {
    id: 'e_road_food',
    groupId: 'g_roadtrip',
    description: 'Meals on the road',
    major: 11_450,
    category: 'food',
    daysAgo: 109,
    paidBy: [['u_abdullah']],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },
  {
    id: 'e_road_permits',
    groupId: 'g_roadtrip',
    description: 'Park permits and entry fees',
    major: 4_500,
    category: 'travel',
    daysAgo: 108,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },
  {
    id: 'e_road_repair',
    groupId: 'g_roadtrip',
    description: 'Tyre replacement near Chilas',
    major: 14_500,
    category: 'transport',
    daysAgo: 107,
    paidBy: [['u_hadi']],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },
  {
    id: 'e_road_fuel_2',
    groupId: 'g_roadtrip',
    description: 'Fuel — return leg',
    major: 15_900,
    category: 'transport',
    daysAgo: 106,
    paidBy: [['u_abdullah']],
    participants: ['u_uzair', 'u_hadi', 'u_abdullah'],
  },

  // ── Family (archived) ─────────────────────────────────────────────────────
  {
    id: 'e_family_dinner',
    groupId: 'g_family',
    description: 'Eid dinner',
    major: 18_000,
    category: 'food',
    daysAgo: 140,
    paidBy: [['u_uzair']],
    participants: ['u_uzair', 'u_maryam'],
  },
  {
    id: 'e_family_gifts',
    groupId: 'g_family',
    description: 'Eid gifts',
    major: 12_000,
    category: 'shopping',
    daysAgo: 139,
    paidBy: [['u_maryam']],
    participants: ['u_uzair', 'u_maryam'],
  },
]

function buildExpense(input: SeedExpense): Expense {
  const amount = rs(input.major)
  const date = daysAgoISO(input.daysAgo)
  const createdAt = new Date(Date.now() - input.daysAgo * 86_400_000).toISOString()

  const payments =
    input.paidBy.length === 1 && input.paidBy[0][1] === undefined
      ? [{ userId: input.paidBy[0][0], amount }]
      : input.paidBy.map(([userId, major]) => ({ userId, amount: rs(major ?? 0) }))

  const participants: ExpenseParticipant[] = input.participants.map((participant) =>
    typeof participant === 'string'
      ? { userId: participant }
      : { userId: participant[0], value: participant[1] },
  )

  return {
    id: input.id,
    groupId: input.groupId,
    description: input.description,
    notes: input.notes,
    amount,
    currency: 'PKR',
    category: input.category,
    date,
    splitMethod: input.splitMethod ?? 'equal',
    payments,
    participants,
    createdBy: input.createdBy ?? payments[0].userId,
    createdAt,
    updatedAt: createdAt,
    deletedAt: null,
  }
}

export const seedExpenses: Expense[] = seedExpenseData.map(buildExpense)

export const seedSettlements: Settlement[] = [
  {
    id: 'st_1',
    groupId: 'g_hunza',
    fromUserId: 'u_shaheer',
    toUserId: 'u_uzair',
    amount: rs(8_000),
    currency: 'PKR',
    date: daysAgoISO(40),
    note: 'Partial payment for the trip',
    createdBy: 'u_shaheer',
    createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    deletedAt: null,
  },
  {
    id: 'st_2',
    groupId: 'g_roadtrip',
    fromUserId: 'u_uzair',
    toUserId: 'u_abdullah',
    amount: rs(5_000),
    currency: 'PKR',
    date: daysAgoISO(95),
    createdBy: 'u_uzair',
    createdAt: new Date(Date.now() - 95 * 86_400_000).toISOString(),
    deletedAt: null,
  },
  {
    id: 'st_3',
    groupId: 'g_apartment',
    fromUserId: 'u_hadi',
    toUserId: 'u_ali',
    amount: rs(30_000),
    currency: 'PKR',
    date: daysAgoISO(30),
    note: 'July rent share',
    createdBy: 'u_hadi',
    createdAt: new Date(Date.now() - 30 * 86_400_000).toISOString(),
    deletedAt: null,
  },
  {
    id: 'st_4',
    groupId: 'g_university',
    fromUserId: 'u_uzair',
    toUserId: 'u_shaheer',
    amount: rs(2_000),
    currency: 'PKR',
    date: daysAgoISO(15),
    createdBy: 'u_uzair',
    createdAt: new Date(Date.now() - 15 * 86_400_000).toISOString(),
    deletedAt: null,
  },
]

export const seedNotifications: AppNotification[] = [
  {
    id: 'n_1',
    kind: 'expense',
    title: 'Hadi added an expense',
    body: 'Water tanker · Rs 2,500 in Apartment 4B',
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    read: false,
    href: '/groups/g_apartment/expenses',
  },
  {
    id: 'n_2',
    kind: 'expense',
    title: 'Ali added an expense',
    body: 'Cleaning help · Rs 8,000 in Apartment 4B',
    createdAt: new Date(Date.now() - 8 * 86_400_000).toISOString(),
    read: false,
    href: '/groups/g_apartment/expenses',
  },
  {
    id: 'n_3',
    kind: 'settlement',
    title: 'Shaheer settled up with you',
    body: 'Rs 8,000 towards the Hunza trip',
    createdAt: new Date(Date.now() - 40 * 86_400_000).toISOString(),
    read: false,
    href: '/groups/g_hunza/balances',
  },
  {
    id: 'n_4',
    kind: 'group',
    title: 'You were added to University Friends',
    body: 'Shaheer Khan added you to the group',
    createdAt: new Date(Date.now() - 150 * 86_400_000).toISOString(),
    read: true,
    href: '/groups/g_university',
  },
  {
    id: 'n_5',
    kind: 'reminder',
    title: 'You owe Ali Raza',
    body: 'Rs 30,000 outstanding in Apartment 4B',
    createdAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    read: true,
    href: '/balances',
  },
]

export const seedPreferences: UserPreferences = {
  defaultCurrency: 'PKR',
  emailNotifications: true,
  pushNotifications: false,
  weeklySummary: true,
}
