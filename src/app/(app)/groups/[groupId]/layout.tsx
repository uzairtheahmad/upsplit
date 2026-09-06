'use client'

import { FolderX } from 'lucide-react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

import { GroupHeader } from '@/components/groups/group-header'
import { PageContainer } from '@/components/shared/page-header'
import { EmptyState } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { useGroup, useGroupLedger } from '@/hooks/use-app-data'

export default function GroupLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ groupId: string }>()
  const groupId = params.groupId
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)

  if (!group) {
    return (
      <PageContainer>
        <EmptyState
          icon={FolderX}
          title="Group not found"
          description="This group may have been deleted, or the link is wrong."
          action={
            <Button asChild>
              <Link href="/groups">Back to groups</Link>
            </Button>
          }
        />
      </PageContainer>
    )
  }

  return (
    <PageContainer>
      <GroupHeader
        group={group}
        members={ledger.members.map((member) => member.user)}
        myNet={ledger.myBalance.net}
        totalSpend={ledger.totalSpend}
        expenseCount={ledger.expenses.length}
      />
      {children}
    </PageContainer>
  )
}
