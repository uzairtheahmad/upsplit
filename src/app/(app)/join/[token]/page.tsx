'use client'

import { AlertCircle } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { PageContainer } from '@/components/shared/page-header'
import { PageLoader } from '@/components/shared/states'
import { Button } from '@/components/ui/button'
import { services } from '@/services'

/**
 * Joins the group an invite link belongs to, then goes there.
 *
 * The route sits inside the authenticated shell, so middleware has already
 * bounced anyone without a session to /login with `?next=` pointing back here
 * — they sign in and land straight back on the link.
 */
export default function JoinGroupPage() {
  const { token } = useParams<{ token: string }>()
  const router = useRouter()
  const [error, setError] = React.useState<string>()

  React.useEffect(() => {
    let active = true

    services.inviteLinks
      .accept(token)
      .then((groupId) => {
        if (!active) return
        toast.success('You joined the group')
        router.replace(`/groups/${groupId}`)
      })
      .catch((cause: unknown) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : 'That invite link did not work')
      })

    return () => {
      active = false
    }
  }, [token, router])

  if (!error) {
    return <PageLoader label="Joining the group" />
  }

  return (
    <PageContainer>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
        <span
          className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground"
          aria-hidden
        >
          <AlertCircle className="size-5" />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-lg font-semibold text-foreground">Couldn’t join that group</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
        </div>
        <p className="text-sm text-muted-foreground">
          Ask whoever shared it for a fresh link — invite links can be rotated or revoked.
        </p>
        <Button asChild variant="outline" size="sm">
          <Link href="/groups">Back to your groups</Link>
        </Button>
      </div>
    </PageContainer>
  )
}
