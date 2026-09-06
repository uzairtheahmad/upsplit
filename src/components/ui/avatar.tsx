'use client'

import * as AvatarPrimitive from '@radix-ui/react-avatar'
import * as React from 'react'

import { cn } from '@/lib/utils/cn'
import type { User } from '@/types'

const sizes = {
  xs: 'size-6 text-[10px]',
  sm: 'size-8 text-xs',
  md: 'size-9 text-xs',
  lg: 'size-11 text-sm',
  xl: 'size-16 text-lg',
} as const

/**
 * Deterministic accent per user id, so a person keeps the same colour
 * everywhere in the app without storing one.
 */
function accentFor(id: string): number {
  let hash = 0
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) >>> 0
  }
  return (hash % 6) + 1
}

interface UserAvatarProps {
  user: Pick<User, 'id' | 'name' | 'initials' | 'avatarUrl'>
  size?: keyof typeof sizes
  className?: string
  /** Adds a ring — used to mark the signed-in user in a stack. */
  highlighted?: boolean
}

function UserAvatar({ user, size = 'md', className, highlighted }: UserAvatarProps) {
  const accent = accentFor(user.id)

  return (
    <AvatarPrimitive.Root
      className={cn(
        'relative inline-flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full font-semibold',
        sizes[size],
        highlighted && 'ring-2 ring-primary ring-offset-2 ring-offset-background',
        className,
      )}
    >
      {user.avatarUrl ? (
        <AvatarPrimitive.Image
          src={user.avatarUrl}
          alt=""
          className="size-full object-cover"
        />
      ) : null}
      <AvatarPrimitive.Fallback
        delayMs={user.avatarUrl ? 300 : 0}
        className="flex size-full items-center justify-center"
        style={{
          backgroundColor: `color-mix(in oklab, var(--chart-${accent}) 16%, transparent)`,
          color: `var(--chart-${accent})`,
        }}
      >
        {user.initials}
      </AvatarPrimitive.Fallback>
    </AvatarPrimitive.Root>
  )
}

interface AvatarStackProps {
  users: Array<Pick<User, 'id' | 'name' | 'initials' | 'avatarUrl'>>
  max?: number
  size?: keyof typeof sizes
  className?: string
}

/** Overlapping avatars with a "+n" chip. Names are exposed to screen readers. */
function AvatarStack({ users, max = 4, size = 'sm', className }: AvatarStackProps) {
  const shown = users.slice(0, max)
  const overflow = users.length - shown.length

  return (
    <div className={cn('flex items-center', className)}>
      <div className="flex -space-x-2">
        {shown.map((user) => (
          <UserAvatar
            key={user.id}
            user={user}
            size={size}
            className="ring-2 ring-card"
          />
        ))}
        {overflow > 0 ? (
          <span
            className={cn(
              'inline-flex items-center justify-center rounded-full bg-muted font-medium text-muted-foreground ring-2 ring-card',
              sizes[size],
            )}
            aria-hidden
          >
            +{overflow}
          </span>
        ) : null}
      </div>
      <span className="sr-only">{users.map((user) => user.name).join(', ')}</span>
    </div>
  )
}

export { AvatarStack, UserAvatar }
