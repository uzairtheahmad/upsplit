'use client'

import { Info } from 'lucide-react'

import { UserAvatar } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/input'
import { Checkbox, Tooltip } from '@/components/ui/misc'
import { cn } from '@/lib/utils/cn'
import type { User } from '@/types'

interface ParticipantSelectorProps {
  members: User[]
  currentUserId: string
  selectedIds: string[]
  payerIds: string[]
  onToggle: (userId: string) => void
  onSelectAll: () => void
  onClear: () => void
  error?: string
}

/**
 * Who the expense is split between.
 *
 * Deliberately independent of who paid: a payer can be left out entirely
 * (they covered the bill without consuming anything), which is the accounting
 * case most tools get wrong. When that happens we say so inline rather than
 * letting it look like a mistake.
 */
export function ParticipantSelector({
  members,
  currentUserId,
  selectedIds,
  payerIds,
  onToggle,
  onSelectAll,
  onClear,
  error,
}: ParticipantSelectorProps) {
  const allSelected = selectedIds.length === members.length
  const nonParticipatingPayers = payerIds.filter((id) => !selectedIds.includes(id))

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <Label>
          Split between{' '}
          <span className="font-normal text-muted-foreground">({selectedIds.length})</span>
        </Label>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs"
          onClick={allSelected ? onClear : onSelectAll}
        >
          {allSelected ? 'Clear all' : 'Select everyone'}
        </Button>
      </div>

      <div className="grid grid-cols-1 gap-1 rounded-lg border border-border p-1.5 sm:grid-cols-2">
        {members.map((member) => {
          const checked = selectedIds.includes(member.id)
          const inputId = `participant-${member.id}`
          return (
            <label
              key={member.id}
              htmlFor={inputId}
              className={cn(
                'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-accent/60',
                checked && 'bg-accent/50',
              )}
            >
              <Checkbox
                id={inputId}
                checked={checked}
                onCheckedChange={() => onToggle(member.id)}
              />
              <UserAvatar user={member} size="xs" />
              <span className="min-w-0 flex-1 truncate text-sm">
                {member.id === currentUserId ? 'You' : member.name}
              </span>
              {payerIds.includes(member.id) ? (
                <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  paid
                </span>
              ) : null}
            </label>
          )
        })}
      </div>

      {nonParticipatingPayers.length > 0 ? (
        <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>
            {nonParticipatingPayers.length === 1
              ? `${nameFor(members, nonParticipatingPayers[0], currentUserId)} paid but isn’t in the split — they’ll be owed the full amount.`
              : 'Some payers aren’t in the split — they’ll be owed the full amount.'}
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function nameFor(members: User[], userId: string, currentUserId: string): string {
  if (userId === currentUserId) return 'You'
  return members.find((member) => member.id === userId)?.name ?? 'Someone'
}

export { Tooltip }
