'use client'

import { AlertTriangle } from 'lucide-react'
import * as React from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

/**
 * Explains why an action was refused.
 *
 * A toast is the wrong shape for this. The database refuses some actions on
 * purpose: you cannot remove somebody who still owes money, you cannot delete
 * an account with a balance outstanding. Those are not transient failures to
 * retry, they are rules with a reason, and the reason is what the person needs
 * in order to know what to do next. A message that fades after four seconds,
 * while they are still reading it, is the wrong place to put it.
 *
 * Transient failures stay as toasts. "Could not save, please try again" needs
 * no decision from anyone.
 */
export function BlockedDialog({
  open,
  onOpenChange,
  title,
  reason,
  hint,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  /** The message from the server. Shown verbatim: it is the specific rule. */
  reason: string
  /** What to do about it, when there is something useful to say. */
  hint?: string
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <span
            className="mb-1 flex size-10 items-center justify-center rounded-full bg-warning-muted text-warning"
            aria-hidden
          >
            <AlertTriangle className="size-5" />
          </span>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{reason}</DialogDescription>
        </DialogHeader>

        {hint ? (
          <DialogBody>
            <p className="rounded-lg border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {hint}
            </p>
          </DialogBody>
        ) : null}

        <DialogFooter>
          <Button type="button" onClick={() => onOpenChange(false)}>
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export interface BlockedState {
  title: string
  reason: string
  hint?: string
}

/**
 * Wiring for the common case: catch a refusal, show it, dismiss it.
 *
 * Returns the state plus a ready-made element, so a caller adds one line to
 * its catch block and one to its JSX.
 */
export function useBlockedDialog() {
  const [blocked, setBlocked] = React.useState<BlockedState | null>(null)

  const show = React.useCallback((title: string, error: unknown, hint?: string) => {
    setBlocked({
      title,
      reason: error instanceof Error ? error.message : 'Something went wrong. Please try again.',
      hint,
    })
  }, [])

  const dialog = (
    <BlockedDialog
      open={blocked !== null}
      onOpenChange={(next) => {
        if (!next) setBlocked(null)
      }}
      title={blocked?.title ?? ''}
      reason={blocked?.reason ?? ''}
      hint={blocked?.hint}
    />
  )

  return { show, dialog }
}
