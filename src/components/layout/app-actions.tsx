'use client'

import { useParams } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { AddExpenseDialog } from '@/components/expenses/expense-dialogs'
import { CreateGroupDialog, InviteMemberDialog } from '@/components/groups/group-dialogs'
import {
  RecordSettlementDialog,
  type SettlementPrefill,
} from '@/components/settlements/record-settlement-dialog'
import { useMyGroups } from '@/hooks/use-app-data'
import { useAppStore } from '@/lib/store/app-store'

/**
 * One place that owns the app's global dialogs.
 *
 * Any component can open "add expense" or "settle up" through this context
 * without threading dialog state through the tree, and the dialogs themselves
 * are mounted once rather than per trigger.
 */

interface AppActions {
  addExpense: (groupId?: string) => void
  createGroup: () => void
  recordSettlement: (prefill?: SettlementPrefill) => void
  inviteMember: (groupId: string) => void
  /** The group a global action defaults to, from the URL or the first group. */
  defaultGroupId: string | undefined
}

const AppActionsContext = React.createContext<AppActions | null>(null)

export function useAppActions(): AppActions {
  const context = React.useContext(AppActionsContext)
  if (!context) throw new Error('useAppActions must be used inside AppActionsProvider')
  return context
}

export function AppActionsProvider({ children }: { children: React.ReactNode }) {
  const params = useParams<{ groupId?: string }>()
  const groups = useMyGroups()
  const memberships = useAppStore((state) => state.members)

  // Default to the group the user is currently looking at.
  const contextualGroupId = params?.groupId ?? groups[0]?.id

  const [expenseGroupId, setExpenseGroupId] = React.useState<string | undefined>()
  const [expenseOpen, setExpenseOpen] = React.useState(false)
  const [groupOpen, setGroupOpen] = React.useState(false)
  const [settlementOpen, setSettlementOpen] = React.useState(false)
  const [settlementPrefill, setSettlementPrefill] = React.useState<SettlementPrefill | null>(null)
  const [inviteGroupId, setInviteGroupId] = React.useState<string>()
  const [inviteOpen, setInviteOpen] = React.useState(false)

  const value = React.useMemo<AppActions>(
    () => ({
      defaultGroupId: contextualGroupId,
      addExpense: (groupId) => {
        const target = groupId ?? contextualGroupId
        if (!target) return

        // R2: an expense needs two people, so a group of one has nothing to
        // share. Opening the form would only lead to a submit that cannot
        // succeed — offer the thing they actually need instead.
        const size = memberships.filter((member) => member.groupId === target).length
        if (size < 2) {
          toast.info('Invite someone first', {
            description:
              'An expense is split between at least two people, so this group needs another member.',
          })
          setInviteGroupId(target)
          setInviteOpen(true)
          return
        }

        setExpenseGroupId(target)
        setExpenseOpen(true)
      },
      createGroup: () => setGroupOpen(true),
      recordSettlement: (prefill) => {
        setSettlementPrefill(prefill ?? null)
        setSettlementOpen(true)
      },
      inviteMember: (groupId) => {
        setInviteGroupId(groupId)
        setInviteOpen(true)
      },
    }),
    [contextualGroupId, memberships],
  )

  const activeExpenseGroup = expenseGroupId ?? contextualGroupId

  return (
    <AppActionsContext.Provider value={value}>
      {children}

      {activeExpenseGroup ? (
        <AddExpenseDialog
          open={expenseOpen}
          onOpenChange={setExpenseOpen}
          groupId={activeExpenseGroup}
          onGroupChange={setExpenseGroupId}
        />
      ) : null}

      <CreateGroupDialog open={groupOpen} onOpenChange={setGroupOpen} />

      <RecordSettlementDialog
        open={settlementOpen}
        onOpenChange={setSettlementOpen}
        prefill={settlementPrefill}
      />

      {inviteGroupId ? (
        <InviteMemberDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          groupId={inviteGroupId}
        />
      ) : null}
    </AppActionsContext.Provider>
  )
}
