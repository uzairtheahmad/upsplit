'use client'

import {
  ArrowLeftRight,
  Inbox,
  PencilLine,
  Receipt,
  Trash2,
  UserMinus,
  UserPlus,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'

import { EmptyState } from '@/components/shared/states'
import { Amount } from '@/components/shared/money'
import { UserAvatar } from '@/components/ui/avatar'
import { relativeTime } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import type { ActivityAction, ActivityEvent, Group, User } from '@/types'

const ACTION_ICONS: Record<ActivityAction, LucideIcon> = {
  expense_added: Receipt,
  expense_updated: PencilLine,
  expense_deleted: Trash2,
  settlement_recorded: ArrowLeftRight,
  group_created: Users,
  member_joined: UserPlus,
  member_removed: UserMinus,
}

function describe(event: ActivityEvent, actorName: string): string {
  switch (event.action) {
    case 'expense_added':
      return `${actorName} added ${event.subject}`
    case 'expense_updated':
      return `${actorName} edited ${event.subject}`
    case 'expense_deleted':
      return `${actorName} deleted ${event.subject}`
    case 'settlement_recorded':
      return `${actorName} recorded a settlement`
    case 'group_created':
      return `${actorName} created ${event.subject}`
    case 'member_joined':
      return `${event.subject} joined the group`
    case 'member_removed':
      return `${actorName} removed ${event.subject}`
  }
}

function ActivityItem({
  event,
  actor,
  group,
  currentUserId,
}: {
  event: ActivityEvent
  actor?: User
  group?: Group
  currentUserId: string
}) {
  const Icon = ACTION_ICONS[event.action]
  const actorName = actor
    ? actor.id === currentUserId
      ? 'You'
      : actor.name.split(' ')[0]
    : 'Someone'

  const content = (
    <>
      {actor ? (
        <span className="relative shrink-0">
          <UserAvatar user={actor} size="md" />
          <span
            className="absolute -bottom-1 -right-1 flex size-4 items-center justify-center rounded-full border-2 border-card bg-muted text-muted-foreground"
            aria-hidden
          >
            <Icon className="size-2.5" />
          </span>
        </span>
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground" aria-hidden>
          <Icon className="size-4" />
        </span>
      )}

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-foreground">
          {describe(event, actorName)}
        </span>
        <span className="block truncate text-xs text-muted-foreground">
          {group?.name ?? 'A group'} · {relativeTime(event.createdAt)}
        </span>
      </span>

      {event.amount !== undefined ? (
        <Amount
          value={event.amount}
          currency={event.currency ?? 'PKR'}
          size="sm"
          className="shrink-0"
        />
      ) : null}
    </>
  )

  const className =
    'flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring'

  return (
    <li>
      {event.href ? (
        <Link href={event.href} className={className}>
          {content}
        </Link>
      ) : (
        <div className={cn(className, 'hover:bg-transparent')}>{content}</div>
      )}
    </li>
  )
}

export function RecentActivity({
  events,
  users,
  groups,
  currentUserId,
  limit = 8,
}: {
  events: ActivityEvent[]
  users: Map<string, User>
  groups: Group[]
  currentUserId: string
  limit?: number
}) {
  if (events.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="No activity yet"
        description="Once you and your groups start adding expenses, everything shows up here."
        compact
      />
    )
  }

  const groupMap = new Map(groups.map((group) => [group.id, group]))

  return (
    <ul className="divide-y divide-border">
      {events.slice(0, limit).map((event) => (
        <ActivityItem
          key={event.id}
          event={event}
          actor={users.get(event.actorId)}
          group={groupMap.get(event.groupId)}
          currentUserId={currentUserId}
        />
      ))}
    </ul>
  )
}
