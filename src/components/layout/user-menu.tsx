'use client'

import { ChevronsUpDown, LogOut, Monitor, Moon, Settings, Sun } from 'lucide-react'
import { useTheme } from 'next-themes'
import Link from 'next/link'
import * as React from 'react'

import { UserAvatar } from '@/components/ui/avatar'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useCurrentUser } from '@/hooks/use-app-data'
import { useSignOut } from '@/hooks/use-session'
import { cn } from '@/lib/utils/cn'

const THEMES = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
] as const

export function UserMenu({ compact }: { compact?: boolean }) {
  const user = useCurrentUser()
  const signOut = useSignOut()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  // The resolved theme is only known on the client; render a stable trigger
  // until then so the markup matches on hydration.
  React.useEffect(() => setMounted(true), [])

  if (!user) return null

  function handleSignOut() {
    void signOut()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          'flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          compact && 'w-auto',
        )}
      >
        <UserAvatar user={user} size="md" />
        {!compact ? (
          <>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
              <span className="block truncate text-xs text-muted-foreground">{user.email}</span>
            </span>
            <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          </>
        ) : (
          <span className="sr-only">Account menu</span>
        )}
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" side={compact ? 'bottom' : 'top'} className="w-60">
        <DropdownMenuLabel className="flex items-center gap-2.5 py-2">
          <UserAvatar user={user} size="sm" />
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium text-foreground">{user.name}</span>
            <span className="block truncate text-xs font-normal">{user.email}</span>
          </span>
        </DropdownMenuLabel>

        <DropdownMenuSeparator />

        <DropdownMenuItem asChild>
          <Link href="/settings">
            <Settings aria-hidden />
            Settings
          </Link>
        </DropdownMenuItem>

        <DropdownMenuSeparator />

        <DropdownMenuLabel>Theme</DropdownMenuLabel>
        {THEMES.map(({ value, label, icon: Icon }) => (
          <DropdownMenuItem
            key={value}
            onSelect={() => setTheme(value)}
            className={cn(mounted && theme === value && 'bg-accent/60 font-medium')}
          >
            <Icon aria-hidden />
            {label}
            {mounted && theme === value ? <span className="sr-only"> (selected)</span> : null}
          </DropdownMenuItem>
        ))}

        <DropdownMenuSeparator />

        <DropdownMenuItem destructive onSelect={handleSignOut}>
          <LogOut aria-hidden />
          Log out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
