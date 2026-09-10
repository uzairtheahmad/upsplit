'use client'

import { Crown, MoreHorizontal, ShieldCheck, UserMinus, UserPlus } from 'lucide-react'
import { useParams } from 'next/navigation'
import { toast } from 'sonner'

import { InviteLinkPanel } from '@/components/groups/invite-link-panel'
import { useAppActions } from '@/components/layout/app-actions'
import { Amount } from '@/components/shared/money'
import { SectionHeader } from '@/components/shared/page-header'
import { UserAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  useCurrentUserId,
  useGroup,
  useGroupLedger,
  useMyRole,
} from '@/hooks/use-app-data'
import { services } from '@/services'
import type { GroupRole } from '@/types'

const ROLE_LABELS: Record<GroupRole, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
}

const ROLE_DESCRIPTIONS: Record<GroupRole, string> = {
  owner: 'Full control, including group settings and deletion.',
  admin: 'Can manage members and every expense.',
  member: 'Can add expenses and record settlements.',
}

export default function GroupMembersPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const currentUserId = useCurrentUserId()
  const permissions = useMyRole(groupId)
  const actions = useAppActions()

  if (!group) return null

  async function changeRole(userId: string, role: GroupRole) {
    try {
      await services.members.updateRole(groupId, userId, role)
      toast.success('Role updated')
    } catch (error) {
      toast.error('Could not update the role', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  async function handOver(userId: string, name: string) {
    try {
      await services.members.transferOwnership(groupId, userId)
      toast.success('Group handed over', {
        description: `${name} is now the owner. You are an admin.`,
      })
    } catch (error) {
      toast.error('Could not hand over the group', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  async function removeMember(userId: string, name: string) {
    try {
      await services.members.remove(groupId, userId)
      toast.success('Member removed', { description: `${name} is no longer in this group.` })
    } catch (error) {
      // The service refuses to remove anyone carrying a non-zero balance —
      // doing so would break the group's zero-sum invariant.
      toast.error('Could not remove them', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader
        title={`${ledger.members.length} members`}
        description={
          permissions.canManageMembers
            ? 'You can invite people and change roles in this group.'
            : 'Only owners and admins can manage members.'
        }
        action={
          <Button size="sm" onClick={() => actions.inviteMember(groupId)}>
            <UserPlus aria-hidden />
            Invite
          </Button>
        }
      />

      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card card-shadow">
        {ledger.members.map((member) => {
          const balance = ledger.balances.find(
            (candidate) => candidate.userId === member.userId,
          )
          const isMe = member.userId === currentUserId
          const canManageThis =
            permissions.canManageMembers && !isMe && member.role !== 'owner'

          return (
            <li key={member.userId} className="flex items-center gap-3 px-4 py-3">
              <UserAvatar user={member.user} size="lg" highlighted={isMe} />

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {isMe ? 'You' : member.user.name}
                  </p>
                  <Badge variant={member.role === 'owner' ? 'primary' : 'outline'}>
                    {member.role === 'owner' ? <ShieldCheck aria-hidden /> : null}
                    {ROLE_LABELS[member.role]}
                  </Badge>
                </div>
                <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
              </div>

              <div className="shrink-0 text-right">
                {balance && balance.net !== 0 ? (
                  <>
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {balance.net > 0 ? 'is owed' : 'owes'}
                    </p>
                    <Amount
                      value={balance.net}
                      currency={group.currency}
                      size="sm"
                      tone="auto"
                      absolute
                    />
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground">Settled up</p>
                )}
              </div>

              {canManageThis ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={`Manage ${member.user.name}`}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Change role</DropdownMenuLabel>
                    {(['admin', 'member'] as GroupRole[]).map((role) => (
                      <DropdownMenuItem
                        key={role}
                        onSelect={() => changeRole(member.userId, role)}
                        disabled={member.role === role}
                      >
                        <span className="min-w-0">
                          <span className="block">{ROLE_LABELS[role]}</span>
                          <span className="block text-xs text-muted-foreground">
                            {ROLE_DESCRIPTIONS[role]}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    ))}
                    {permissions.isOwner ? (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuLabel>Ownership</DropdownMenuLabel>
                        <DropdownMenuItem
                          onSelect={() => handOver(member.userId, member.user.name)}
                        >
                          <Crown aria-hidden />
                          <span className="min-w-0">
                            <span className="block">Make owner</span>
                            <span className="block text-xs text-muted-foreground">
                              You become an admin. A group has one owner.
                            </span>
                          </span>
                        </DropdownMenuItem>
                      </>
                    ) : null}

                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      destructive
                      onSelect={() => removeMember(member.userId, member.user.name)}
                    >
                      <UserMinus aria-hidden />
                      Remove from group
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : (
                <span className="w-8 shrink-0" aria-hidden />
              )}
            </li>
          )
        })}
      </ul>

      <p className="text-xs text-muted-foreground">
        Someone with an outstanding balance can’t be removed — settle up with them first, so the
        group’s books stay balanced.
      </p>

      <InviteLinkPanel groupId={groupId} canManage={permissions.canManageMembers} />
    </div>
  )
}
