'use client'

import { Search, UserPlus, Users } from 'lucide-react'
import * as React from 'react'

import { useAppActions } from '@/components/layout/app-actions'
import { Amount } from '@/components/shared/money'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { UserAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useAppStore } from '@/lib/store/app-store'
import {
  useCurrentUserId,
  useGlobalLedger,
  useUserMap,
} from '@/hooks/use-app-data'

/**
 * Everyone the signed-in user shares a group with, with their combined
 * position and the groups they have in common.
 */
export default function MembersPage() {
  const ledger = useGlobalLedger()
  const users = useUserMap()
  const members = useAppStore((state) => state.members)
  const currentUserId = useCurrentUserId()
  const actions = useAppActions()
  const [search, setSearch] = React.useState('')

  const myGroupIds = new Set(ledger.perGroup.map((entry) => entry.group.id))

  const people = React.useMemo(() => {
    const shared = new Map<string, { groups: string[] }>()

    for (const member of members) {
      if (!myGroupIds.has(member.groupId)) continue
      if (member.userId === currentUserId) continue
      const entry = shared.get(member.userId) ?? { groups: [] }
      const group = ledger.perGroup.find((candidate) => candidate.group.id === member.groupId)
      if (group) entry.groups.push(group.group.name)
      shared.set(member.userId, entry)
    }

    const netByPerson = new Map(ledger.people.map((entry) => [entry.userId, entry.amount]))

    return [...shared.entries()]
      .flatMap(([userId, entry]) => {
        const user = users.get(userId)
        return user ? [{ user, groups: entry.groups, net: netByPerson.get(userId) ?? 0 }] : []
      })
      .sort((a, b) => Math.abs(b.net) - Math.abs(a.net) || a.user.name.localeCompare(b.user.name))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [members, ledger, users, currentUserId])

  const needle = search.trim().toLowerCase()
  const filtered = people.filter(
    (entry) =>
      !needle ||
      entry.user.name.toLowerCase().includes(needle) ||
      entry.user.email.toLowerCase().includes(needle),
  )

  const currency = ledger.perGroup[0]?.group.currency ?? 'PKR'

  return (
    <PageContainer>
      <PageHeader
        title="People"
        description="Everyone you share expenses with, and where you stand with each of them."
        actions={
          actions.defaultGroupId ? (
            <Button onClick={() => actions.inviteMember(actions.defaultGroupId!)}>
              <UserPlus aria-hidden />
              Invite someone
            </Button>
          ) : null
        }
      />

      <div className="relative max-w-sm">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search people"
          aria-label="Search people"
          className="pl-8"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={Users}
          title={needle ? 'Nobody matches that' : 'No one to show yet'}
          description={
            needle
              ? 'Try a different name or email.'
              : 'Invite people to a group and they’ll appear here.'
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((entry) => (
            <li
              key={entry.user.id}
              className="rounded-xl border border-border bg-card p-4 card-shadow"
            >
              <div className="flex items-start gap-3">
                <UserAvatar user={entry.user} size="lg" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{entry.user.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{entry.user.email}</p>
                </div>
              </div>

              <div className="mt-3.5 flex items-end justify-between gap-2">
                <div>
                  <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                    {entry.net > 0 ? 'Owes you' : entry.net < 0 ? 'You owe' : 'Balance'}
                  </p>
                  {entry.net === 0 ? (
                    <p className="text-sm text-muted-foreground">All settled up</p>
                  ) : (
                    <Amount value={entry.net} currency={currency} size="lg" tone="auto" absolute />
                  )}
                </div>
              </div>

              <div className="mt-3 flex flex-wrap gap-1 border-t border-border pt-3">
                {entry.groups.slice(0, 3).map((groupName) => (
                  <Badge key={groupName} variant="outline">
                    {groupName}
                  </Badge>
                ))}
                {entry.groups.length > 3 ? (
                  <Badge variant="outline">+{entry.groups.length - 3}</Badge>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  )
}
