import { ArrowRight, ChartPie, Scale, Split, Wallet, type LucideIcon } from 'lucide-react'

/**
 * Landing page copy.
 *
 * Everything the marketing page claims lives here, in one file, for two
 * reasons: the headline can be swapped for an alternative without touching
 * layout, and the FAQ is rendered *and* serialised to JSON-LD from the same
 * array — structured data that disagrees with the visible page is a search
 * penalty, so there is deliberately only one copy of it.
 *
 * Every claim on this page is verifiable in the codebase. Nothing here asserts
 * a user count, a rating, a testimonial or a logo.
 */

/** The hero headline. Swap for one of ALTERNATIVES to test a variant. */
export const HEADLINE = 'Shared expenses, actually settled.'

/** Tested alternatives — assign one to HEADLINE to try it. */
export const HEADLINE_ALTERNATIVES = [
  'Split bills with friends. Settle in the fewest payments.',
  'Know exactly who owes whom, and why.',
  'Trips, flats, dinners: split it fairly, settle it fast.',
] as const

export const SUBHEADLINE =
  'Track what everyone paid, see exactly who owes whom, and clear the whole group in the fewest possible payments.'

/**
 * The eyebrow above the headline.
 *
 * "Free" is accurate: there is no billing code, no paid tier and no pricing
 * anywhere in the product.
 */
export const EYEBROW = 'Free for trips, flats and dinners'

/**
 * The line under the hero CTAs.
 *
 * Deliberately does NOT say "friends don't need an account" — group_members
 * references profiles, which references auth.users, so every member is a real
 * account. You can invite someone before they sign up, but they only become a
 * member once they do.
 */
export const HERO_ASSURANCES = ['No daily limits', 'No ads', 'Works in your browser'] as const

export const GITHUB_URL = 'https://github.com/uzairtheahmad/upsplit'

export interface HowStep {
  title: string
  body: string
}

export const HOW_IT_WORKS: HowStep[] = [
  { title: 'Create a group', body: 'For a trip, a flat or a friend group.' },
  { title: 'Add expenses', body: 'Whoever paid, however you split it.' },
  { title: 'Settle up', body: 'UpSplit works out the fewest payments.' },
]

export interface Feature {
  icon: LucideIcon
  title: string
  body: string
  /** The technical detail behind the benefit, shown smaller. */
  detail?: string
}

/**
 * Note "Two ways to split", not four. The split_method enum is
 * ('equal', 'exact') — percentage and shares were deliberately removed.
 */
export const FEATURES: Feature[] = [
  {
    icon: Split,
    title: 'Two ways to split',
    body: 'Equal or exact amounts, and it always adds up to the total.',
    detail: 'Rounding is distributed fairly, never 33.33 three times.',
  },
  {
    icon: Wallet,
    title: 'Whoever actually paid',
    body: 'One payer, several payers, or someone covering a bill they had no part in.',
    detail: 'The payer never has to appear in the split.',
  },
  {
    icon: Scale,
    title: 'Balances that explain themselves',
    body: 'Tap any balance to see exactly which expenses produced it. No more “why do I owe this?”',
    detail: 'Every figure is broken down into paid, owed and settled.',
  },
  {
    icon: ArrowRight,
    title: 'The shortest way to square up',
    body: 'Debts are simplified across the whole group, so everyone settles in as few transfers as possible.',
    detail: 'Four people settle in three payments, not six.',
  },
  {
    icon: ChartPie,
    title: 'Spending, not shuffling',
    body: 'Your totals count what the group actually spent. Paying a friend back is not a new expense, so it never inflates the numbers.',
    detail: 'Settlements are excluded from every analytics figure.',
  },
]

export interface FaqItem {
  question: string
  answer: string
}

/**
 * The FAQ, rendered on the page and emitted as FAQPage JSON-LD from this same
 * array. Every answer is verifiable:
 *
 *  - free: no billing code exists anywhere in the product
 *  - accounts: group_members -> profiles -> auth.users
 *  - currencies: the five rows seeded into public.currencies
 *  - multiple payers: expense_payments is one row per payer
 *  - privacy: RLS restricts every table to groups you belong to
 *  - real money: there is no payment integration of any kind
 */
export const FAQ: FaqItem[] = [
  {
    question: 'Is UpSplit free?',
    answer:
      'Yes. There is no paid plan, no trial and no card required. There are no limits on how many groups or expenses you can add.',
  },
  {
    question: 'Do my friends need an account?',
    answer:
      'Yes. Everyone in a group has their own account, which is what lets each person see their own balances. You can invite someone by email before they have signed up, and they join the group automatically as soon as they register.',
  },
  {
    question: 'Which currencies can I use?',
    answer:
      'Pakistani rupee, US dollar, euro, pound sterling and UAE dirham. Each group uses a single currency, chosen when the group is created and fixed after that, so every amount in a group stays directly comparable.',
  },
  {
    question: 'Can more than one person pay for an expense?',
    answer:
      'Yes. An expense can have any number of payers, each contributing a different amount. The person who paid also does not have to be part of the split. If you cover a bill you had no share in, you are simply owed the whole amount.',
  },
  {
    question: 'Can I use it on my phone?',
    answer:
      'Yes. UpSplit runs in your browser and is built for phone screens as well as desktop. There is nothing to install.',
  },
  {
    question: 'Is my data private?',
    answer:
      'You can only see groups you belong to. That is enforced by the database itself rather than by the app, so a request for someone else’s group returns nothing even if it is made directly to the API.',
  },
  {
    question: 'Is real money involved?',
    answer:
      'No. UpSplit records who owes whom and works out the simplest way to settle. The actual payments happen however you already pay each other: cash, bank transfer, anything. No money moves through the app.',
  },
]

/** Verified signals only. No testimonials, ratings, user counts or logos. */
export const TRUST_SIGNALS = [
  'Free',
  'No ads',
  'Open source on GitHub',
  'Works in your browser',
] as const
