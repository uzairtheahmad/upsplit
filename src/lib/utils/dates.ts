import {
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  formatDistanceToNowStrict,
  isAfter,
  isBefore,
  parseISO,
  startOfMonth,
  startOfWeek,
  startOfYear,
  subDays,
  subMonths,
} from 'date-fns'

export type DateRangeKey =
  | 'this_week'
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'last_6_months'
  | 'this_year'
  | 'all_time'
  | 'custom'

export interface DateRange {
  from: string
  to: string
}

export const DATE_RANGE_LABELS: Record<DateRangeKey, string> = {
  this_week: 'This week',
  this_month: 'This month',
  last_month: 'Last month',
  last_3_months: 'Last 3 months',
  last_6_months: 'Last 6 months',
  this_year: 'This year',
  all_time: 'All time',
  custom: 'Custom range',
}

export function toISODate(date: Date): string {
  return format(date, 'yyyy-MM-dd')
}

export function todayISO(): string {
  return toISODate(new Date())
}

/** Resolve a named range into concrete ISO bounds, relative to `now`. */
export function resolveDateRange(key: DateRangeKey, now: Date = new Date()): DateRange | null {
  switch (key) {
    case 'this_week':
      return {
        from: toISODate(startOfWeek(now, { weekStartsOn: 1 })),
        to: toISODate(endOfWeek(now, { weekStartsOn: 1 })),
      }
    case 'this_month':
      return { from: toISODate(startOfMonth(now)), to: toISODate(endOfMonth(now)) }
    case 'last_month': {
      const previous = subMonths(now, 1)
      return { from: toISODate(startOfMonth(previous)), to: toISODate(endOfMonth(previous)) }
    }
    case 'last_3_months':
      return { from: toISODate(startOfMonth(subMonths(now, 2))), to: toISODate(endOfMonth(now)) }
    case 'last_6_months':
      return { from: toISODate(startOfMonth(subMonths(now, 5))), to: toISODate(endOfMonth(now)) }
    case 'this_year':
      return { from: toISODate(startOfYear(now)), to: toISODate(now) }
    case 'all_time':
    case 'custom':
      return null
  }
}

export function isWithinRange(isoDate: string, range: DateRange | null): boolean {
  if (!range) return true
  const date = parseISO(isoDate)
  return (
    !isBefore(date, parseISO(range.from)) && !isAfter(date, parseISO(`${range.to}`))
  )
}

/** "2 hours ago", "3 days ago" — used across activity and notifications. */
export function relativeTime(iso: string): string {
  try {
    return `${formatDistanceToNowStrict(parseISO(iso))} ago`
  } catch {
    return ''
  }
}

/** "Today" / "Yesterday" / "12 Aug 2026" for expense rows. */
export function friendlyDate(iso: string, now: Date = new Date()): string {
  const date = parseISO(iso)
  const days = differenceInCalendarDays(now, date)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  if (days > 1 && days < 7) return format(date, 'EEEE')
  return format(date, 'd MMM yyyy')
}

export function formatDateLong(iso: string): string {
  return format(parseISO(iso), 'd MMMM yyyy')
}

export function formatMonthLabel(iso: string): string {
  return format(parseISO(iso), 'MMM')
}

export function monthKey(iso: string): string {
  return format(parseISO(iso), 'yyyy-MM')
}

/** Ordered month keys covering the last `count` months, oldest first. */
export function recentMonthKeys(count: number, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, index) =>
    format(subMonths(now, count - 1 - index), 'yyyy-MM'),
  )
}

export function monthKeyLabel(key: string): string {
  return format(parseISO(`${key}-01`), 'MMM yyyy')
}

export function daysAgoISO(days: number, now: Date = new Date()): string {
  return toISODate(subDays(now, days))
}

export function greeting(now: Date = new Date()): string {
  const hour = now.getHours()
  if (hour < 12) return 'Good morning'
  if (hour < 17) return 'Good afternoon'
  return 'Good evening'
}
