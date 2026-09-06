'use client'

import * as React from 'react'

import { RecentActivity } from '@/components/dashboard/recent-activity'
import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  useActivity,
  useAllGroups,
  useCurrentUserId,
  useMyGroups,
  useUserMap,
} from '@/hooks/use-app-data'

export default function ActivityPage() {
  const activity = useActivity()
  const users = useUserMap()
  const allGroups = useAllGroups()
  const groups = useMyGroups({ includeArchived: true })
  const currentUserId = useCurrentUserId()

  const [groupId, setGroupId] = React.useState('all')

  const filtered =
    groupId === 'all' ? activity : activity.filter((event) => event.groupId === groupId)

  return (
    <PageContainer className="max-w-3xl">
      <PageHeader
        title="Activity"
        description="Everything that has happened across your groups."
        actions={
          <Select value={groupId} onValueChange={setGroupId}>
            <SelectTrigger className="w-auto min-w-40" aria-label="Filter by group">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All groups</SelectItem>
              {groups.map((group) => (
                <SelectItem key={group.id} value={group.id}>
                  {group.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      <Card className="overflow-hidden">
        <RecentActivity
          events={filtered}
          users={users}
          groups={allGroups}
          currentUserId={currentUserId}
          limit={100}
        />
      </Card>
    </PageContainer>
  )
}
