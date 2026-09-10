'use client'

import { Check, Copy, Link2, RefreshCw, Trash2 } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatDateLong } from '@/lib/utils/dates'
import { services } from '@/services'
import type { GroupInviteLink } from '@/types'

/** Builds the join URL from the link's token. */
function joinUrl(token: string): string {
  if (typeof window === 'undefined') return `/join/${token}`
  return `${window.location.origin}/join/${token}`
}

/**
 * Whether a link can still be used. Deliberately not a type predicate: a
 * revoked link is still a link, and the panel needs to say so.
 */
function isLive(link: GroupInviteLink): boolean {
  if (link.revokedAt) return false
  if (link.expiresAt && new Date(link.expiresAt) < new Date()) return false
  return true
}

/**
 * The group's shareable join link.
 *
 * One link per group: creating a new one replaces the old row, so rotating
 * genuinely invalidates the previous token rather than leaving dead links that
 * still work.
 */
export function InviteLinkPanel({
  groupId,
  canManage,
}: {
  groupId: string
  canManage: boolean
}) {
  const [link, setLink] = React.useState<GroupInviteLink | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [working, setWorking] = React.useState(false)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    let active = true

    services.inviteLinks
      .get(groupId)
      .then((row) => {
        if (active) setLink(row)
      })
      .catch(() => {
        // A missing link is the normal case, not an error worth shouting about.
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [groupId])

  const live = link !== null && isLive(link)

  async function handleCreate(rotating: boolean) {
    setWorking(true)
    try {
      const created = await services.inviteLinks.create(groupId)
      setLink(created)
      toast.success(rotating ? 'New link created' : 'Invite link created', {
        description: rotating ? 'The previous link no longer works.' : undefined,
      })
    } catch (error) {
      toast.error('Could not create the link', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setWorking(false)
    }
  }

  async function handleRevoke() {
    setWorking(true)
    try {
      await services.inviteLinks.revoke(groupId)
      setLink((current) =>
        current ? { ...current, revokedAt: new Date().toISOString() } : current,
      )
      toast.success('Invite link revoked')
    } catch (error) {
      toast.error('Could not revoke the link', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setWorking(false)
    }
  }

  async function handleCopy() {
    if (!link) return
    try {
      await navigator.clipboard.writeText(joinUrl(link.token))
      setCopied(true)
      // Revert the confirmation so the button doesn't stay stuck on "Copied".
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error('Could not copy', { description: 'Copy the link from the box instead.' })
    }
  }

  if (!canManage) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Link2 className="size-4 text-muted-foreground" aria-hidden />
          Invite link
        </CardTitle>
        <CardDescription>
          Anyone with this link can join the group. They still need an UpSplit account.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-3">
        {loading ? (
          <p className="text-sm text-muted-foreground" role="status">
            Loading…
          </p>
        ) : link && live ? (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                readOnly
                value={joinUrl(link.token)}
                aria-label="Invite link"
                className="min-w-0 flex-1 font-mono text-xs"
                onFocus={(event) => event.currentTarget.select()}
              />
              <Button type="button" variant="outline" size="sm" onClick={handleCopy}>
                {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                {copied ? 'Copied' : 'Copy'}
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                loading={working}
                onClick={() => handleCreate(true)}
              >
                <RefreshCw aria-hidden />
                Rotate
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={working}
                onClick={handleRevoke}
                className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 aria-hidden />
                Revoke
              </Button>
            </div>

            <p className="text-xs text-muted-foreground">
              {link.expiresAt
                ? `Expires ${formatDateLong(link.expiresAt.slice(0, 10))}.`
                : 'Does not expire.'}{' '}
              Rotating replaces it. The old link stops working immediately.
            </p>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              {link?.revokedAt
                ? 'The previous link was revoked.'
                : 'No invite link yet.'}
            </p>
            <Button type="button" size="sm" loading={working} onClick={() => handleCreate(false)}>
              <Link2 aria-hidden />
              Create invite link
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
