'use client'

import { Plus, Search, Users } from 'lucide-react'
import * as React from 'react'

import { GroupCard } from '@/components/groups/group-card'
import { useAppActions } from '@/components/layout/app-actions'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/misc'
import { useAppStore } from '@/lib/store/app-store'
import { useGlobalLedger, useUserMap } from '@/hooks/use-app-data'

export default function GroupsPage() {
  const ledger = useGlobalLedger()
  const users = useUserMap()
  const members = useAppStore((state) => state.members)
  const actions = useAppActions()
  const [search, setSearch] = React.useState('')

  const needle = search.trim().toLowerCase()
  const matching = ledger.perGroup.filter(
    (entry) =>
      !needle ||
      entry.group.name.toLowerCase().includes(needle) ||
      (entry.group.description ?? '').toLowerCase().includes(needle),
  )

  const active = matching.filter((entry) => !entry.group.archivedAt)
  const archived = matching.filter((entry) => entry.group.archivedAt)

  function renderGrid(entries: typeof matching, emptyDescription: string) {
    if (entries.length === 0) {
      return (
        <EmptyState
          icon={needle ? Search : Users}
          title={needle ? 'No groups match that search' : 'No groups here yet'}
          description={needle ? 'Try a different name or clear the search.' : emptyDescription}
          action={
            needle ? (
              <Button variant="outline" onClick={() => setSearch('')}>
                Clear search
              </Button>
            ) : (
              <Button onClick={actions.createGroup}>
                <Plus aria-hidden />
                Create a group
              </Button>
            )
          }
        />
      )
    }

    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {entries.map((entry) => (
          <GroupCard
            key={entry.group.id}
            group={entry.group}
            members={members
              .filter((member) => member.groupId === entry.group.id)
              .flatMap((member) => {
                const user = users.get(member.userId)
                return user ? [user] : []
              })}
            myNet={entry.myNet}
            totalSpend={entry.totalSpend}
            expenseCount={entry.expenses.length}
            lastExpense={entry.expenses[0]}
          />
        ))}
      </div>
    )
  }

  return (
    <PageContainer>
      <PageHeader
        title="Groups"
        description="Every set of people you share expenses with."
        actions={
          <Button onClick={actions.createGroup}>
            <Plus aria-hidden />
            Create group
          </Button>
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
          placeholder="Search groups"
          aria-label="Search groups"
          className="pl-8"
        />
      </div>

      <Tabs defaultValue="active">
        <TabsList>
          <TabsTrigger value="active">Active ({active.length})</TabsTrigger>
          <TabsTrigger value="archived">Archived ({archived.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          {renderGrid(active, 'Create a group for a trip, a flat or a friend circle.')}
        </TabsContent>

        <TabsContent value="archived">
          {renderGrid(archived, 'Groups you archive are kept here with their history intact.')}
        </TabsContent>
      </Tabs>
    </PageContainer>
  )
}
