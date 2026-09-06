'use client'

import { ArrowLeftRight, Plus, UserPlus, Users } from 'lucide-react'

import { useAppActions } from '@/components/layout/app-actions'
import { cn } from '@/lib/utils/cn'

export function QuickActions({ className }: { className?: string }) {
  const actions = useAppActions()

  const items = [
    {
      label: 'Add expense',
      description: 'Log something the group spent',
      icon: Plus,
      onClick: () => actions.addExpense(),
      primary: true,
    },
    {
      label: 'Settle up',
      description: 'Record a payment',
      icon: ArrowLeftRight,
      onClick: () => actions.recordSettlement(),
    },
    {
      label: 'Create group',
      description: 'Start something new',
      icon: Users,
      onClick: actions.createGroup,
    },
    {
      label: 'Invite member',
      description: 'Add someone to a group',
      icon: UserPlus,
      onClick: () => actions.defaultGroupId && actions.inviteMember(actions.defaultGroupId),
      disabled: !actions.defaultGroupId,
      disabledReason: 'Create a group first',
    },
  ]

  return (
    <section aria-label="Quick actions" className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item) => {
        const Icon = item.icon
        return (
          <button
            key={item.label}
            type="button"
            onClick={item.onClick}
            disabled={item.disabled}
            title={item.disabled ? item.disabledReason : undefined}
            className={cn(
              'group flex items-center gap-3 rounded-xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
              item.disabled
                ? 'cursor-not-allowed border-border bg-card opacity-60'
                : 'border-border bg-card card-shadow hover:-translate-y-0.5 hover:card-shadow-lg',
              item.primary && !item.disabled && 'border-primary/30 bg-primary-muted/40',
            )}
          >
            <span
              className={cn(
                'flex size-9 shrink-0 items-center justify-center rounded-lg transition-colors',
                item.primary
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground group-hover:bg-primary-muted group-hover:text-primary',
              )}
              aria-hidden
            >
              <Icon className="size-[18px]" />
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-foreground">{item.label}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {item.disabled ? item.disabledReason : item.description}
              </span>
            </span>
          </button>
        )
      })}
    </section>
  )
}
