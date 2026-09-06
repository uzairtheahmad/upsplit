import {
  ArrowLeftRight,
  ChartPie,
  LayoutDashboard,
  type LucideIcon,
  Scale,
  Settings,
  Users,
  Wallet,
} from 'lucide-react'

export interface NavItem {
  href: string
  label: string
  icon: LucideIcon
  /** Short label for the mobile tab bar. */
  short?: string
}

export const PRIMARY_NAV: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, short: 'Home' },
  { href: '/groups', label: 'Groups', icon: Wallet },
  { href: '/balances', label: 'Balances', icon: Scale },
  { href: '/settlements', label: 'Settlements', icon: ArrowLeftRight, short: 'Settle' },
  { href: '/analytics', label: 'Analytics', icon: ChartPie, short: 'Stats' },
  { href: '/members', label: 'People', icon: Users },
]

export const SECONDARY_NAV: NavItem[] = [
  { href: '/settings', label: 'Settings', icon: Settings },
]

/** The four destinations that fit a mobile tab bar. */
export const MOBILE_NAV: NavItem[] = [
  PRIMARY_NAV[0],
  PRIMARY_NAV[1],
  PRIMARY_NAV[2],
  PRIMARY_NAV[4],
]
