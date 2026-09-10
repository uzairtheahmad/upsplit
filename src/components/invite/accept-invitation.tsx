'use client'

import { ArrowRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { services } from '@/services'

/**
 * The accept step, for a visitor who already has a session.
 *
 * Deliberately a button rather than an effect that joins on load. Joining a
 * group is a change to someone's account, and a link in an email can be
 * followed by accident, prefetched by a mail client, or opened by whoever
 * happens to be at the keyboard. One click is the consent.
 *
 * Somebody who signs up with the invited address never reaches this: the
 * signup trigger claims every pending invitation for that address, so they are
 * already a member by the time the page reloads.
 */
export function AcceptInvitation({ token, groupName }: { token: string; groupName: string }) {
  const router = useRouter()
  const [joining, setJoining] = React.useState(false)

  async function handleAccept() {
    setJoining(true)
    try {
      const groupId = await services.invitations.accept(token)
      toast.success(`You joined ${groupName}`)
      router.replace(`/groups/${groupId}`)
      router.refresh()
    } catch (error) {
      setJoining(false)
      toast.error('Could not join the group', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  return (
    <Button size="lg" className="w-full" loading={joining} onClick={handleAccept}>
      Join {groupName}
      <ArrowRight aria-hidden />
    </Button>
  )
}
