import {
  Banknote,
  BookOpen,
  Bus,
  Car,
  Clapperboard,
  Dumbbell,
  Heart,
  Home,
  type LucideIcon,
  MoreHorizontal,
  Plane,
  Receipt,
  ShoppingBag,
  ShoppingCart,
  Users,
  UtensilsCrossed,
  Wallet,
  Zap,
} from 'lucide-react'

import type { ExpenseCategory } from '@/types'

export interface CategoryMeta {
  key: ExpenseCategory
  label: string
  icon: LucideIcon
  /** Chart token slot (1-6), so a category keeps its colour everywhere. */
  chart: 1 | 2 | 3 | 4 | 5 | 6
}

export const CATEGORIES: Record<ExpenseCategory, CategoryMeta> = {
  food: { key: 'food', label: 'Food & drink', icon: UtensilsCrossed, chart: 1 },
  transport: { key: 'transport', label: 'Transport', icon: Bus, chart: 2 },
  shopping: { key: 'shopping', label: 'Shopping', icon: ShoppingBag, chart: 3 },
  bills: { key: 'bills', label: 'Bills & utilities', icon: Zap, chart: 4 },
  entertainment: { key: 'entertainment', label: 'Entertainment', icon: Clapperboard, chart: 5 },
  travel: { key: 'travel', label: 'Travel', icon: Plane, chart: 6 },
  accommodation: { key: 'accommodation', label: 'Accommodation', icon: Home, chart: 3 },
  groceries: { key: 'groceries', label: 'Groceries', icon: ShoppingCart, chart: 6 },
  health: { key: 'health', label: 'Health', icon: Heart, chart: 4 },
  education: { key: 'education', label: 'Education', icon: BookOpen, chart: 5 },
  other: { key: 'other', label: 'Other', icon: MoreHorizontal, chart: 2 },
}

export const CATEGORY_LIST = Object.values(CATEGORIES)

export function categoryMeta(key: ExpenseCategory): CategoryMeta {
  return CATEGORIES[key] ?? CATEGORIES.other
}

/**
 * Categorical slot -> token. There are exactly six slots and they are assigned
 * in fixed order, never cycled: anything past the sixth folds into "Other".
 */
export function chartColor(index: number): string {
  return index >= 6 ? 'var(--chart-other)' : `var(--chart-${index + 1})`
}

export function categoryColor(key: ExpenseCategory): string {
  return `var(--chart-${categoryMeta(key).chart})`
}

/** Icons a user can pick for a group. */
export const GROUP_ICONS: Record<string, LucideIcon> = {
  users: Users,
  home: Home,
  plane: Plane,
  car: Car,
  utensils: UtensilsCrossed,
  cart: ShoppingCart,
  receipt: Receipt,
  wallet: Wallet,
  dumbbell: Dumbbell,
  banknote: Banknote,
}

export const GROUP_ICON_KEYS = Object.keys(GROUP_ICONS)

export function groupIcon(key: string): LucideIcon {
  return GROUP_ICONS[key] ?? Users
}

/** Accent colours for group avatars — token-driven so dark mode stays right. */
export const GROUP_COLORS: Record<string, { chip: string; text: string }> = {
  violet: { chip: 'bg-[var(--chart-1)]/12 text-[var(--chart-1)]', text: 'text-[var(--chart-1)]' },
  cyan: { chip: 'bg-[var(--chart-2)]/12 text-[var(--chart-2)]', text: 'text-[var(--chart-2)]' },
  green: { chip: 'bg-[var(--chart-3)]/12 text-[var(--chart-3)]', text: 'text-[var(--chart-3)]' },
  amber: { chip: 'bg-[var(--chart-4)]/15 text-[var(--chart-4)]', text: 'text-[var(--chart-4)]' },
  orange: { chip: 'bg-[var(--chart-5)]/12 text-[var(--chart-5)]', text: 'text-[var(--chart-5)]' },
  pink: { chip: 'bg-[var(--chart-6)]/12 text-[var(--chart-6)]', text: 'text-[var(--chart-6)]' },
}

export const GROUP_COLOR_KEYS = Object.keys(GROUP_COLORS)

export function groupColor(key: string) {
  return GROUP_COLORS[key] ?? GROUP_COLORS.violet
}
