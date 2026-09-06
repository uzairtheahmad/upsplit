'use client'

import {
  ArrowLeftRight,
  Bell,
  BellOff,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import Link from 'next/link'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/misc'
import { EmptyState } from '@/components/shared/states'
import { useNotifications } from '@/hooks/use-app-data'
import { relativeTime } from '@/lib/utils/dates'
import { cn } from '@/lib/utils/cn'
import { services } from '@/services'
import type { AppNotification, NotificationKind } from '@/types'

const KIND_ICONS: Record<NotificationKind, LucideIcon> = {
  expense: Receipt,
  settlement: ArrowLeftRight,
  group: Users,
  reminder: Bell,
}

function NotificationItem({
  notification,
  onSelect,
}: {
  notification: AppNotification
  onSelect: () => void
}) {
  const Icon = KIND_ICONS[notification.kind]

  const body = (
    <span className="flex w-full items-start gap-3 text-left">
      <span
        className={cn(
          'mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg',
          notification.read ? 'bg-muted text-muted-foreground' : 'bg-primary-muted text-primary',
        )}
        aria-hidden
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span
            className={cn(
              'flex-1 text-sm leading-snug',
              notification.read ? 'text-muted-foreground' : 'font-medium text-foreground',
            )}
          >
            {notification.title}
          </span>
          {!notification.read ? (
            <>
              <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" aria-hidden />
              <span className="sr-only">Unread</span>
            </>
          ) : null}
        </span>
        <span className="mt-0.5 block text-xs text-muted-foreground">{notification.body}</span>
        <span className="mt-1 block text-[11px] text-muted-foreground">
          {relativeTime(notification.createdAt)}
        </span>
      </span>
    </span>
  )

  const className =
    'block w-full rounded-lg p-2 transition-colors hover:bg-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

  if (notification.href) {
    return (
      <Link href={notification.href} onClick={onSelect} className={className}>
        {body}
      </Link>
    )
  }

  return (
    <button type="button" onClick={onSelect} className={className}>
      {body}
    </button>
  )
}

export function NotificationBell() {
  const { notifications, unread } = useNotifications()
  const [open, setOpen] = React.useState(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative"
          aria-label={
            unread > 0 ? `Notifications, ${unread} unread` : 'Notifications, none unread'
          }
        >
          <Bell aria-hidden />
          {unread > 0 ? (
            <span
              className="absolute right-1.5 top-1.5 flex min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold leading-4 text-primary-foreground"
              aria-hidden
            >
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-[22rem] p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <h2 className="text-sm font-semibold">Notifications</h2>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs"
              onClick={() => services.notifications.markAllRead()}
            >
              Mark all read
            </Button>
          ) : null}
        </div>

        {notifications.length === 0 ? (
          <EmptyState
            icon={BellOff}
            title="You’re all caught up"
            description="New activity in your groups will show up here."
            compact
            className="m-2 border-0 bg-transparent"
          />
        ) : (
          <div className="max-h-[24rem] overflow-y-auto p-1.5">
            {notifications.map((notification) => (
              <NotificationItem
                key={notification.id}
                notification={notification}
                onSelect={() => {
                  services.notifications.markRead(notification.id)
                  setOpen(false)
                }}
              />
            ))}
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
