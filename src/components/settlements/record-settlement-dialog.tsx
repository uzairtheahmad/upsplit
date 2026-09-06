'use client'

import { ArrowRight } from 'lucide-react'
import * as React from 'react'
import { toast } from 'sonner'

import { AmountInput } from '@/components/expenses/form/amount-input'
import { UserAvatar } from '@/components/ui/avatar'
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
import { Field, Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentUserId, useGroupMembers, useMyGroups } from '@/hooks/use-app-data'
import { netBetween } from '@/lib/balances/calculate-balances'
import { useGroupLedger } from '@/hooks/use-app-data'
import { formatMoney, parseMoney, toMajorString } from '@/lib/money/money'
import { todayISO } from '@/lib/utils/dates'
import { settlementDraftSchema } from '@/lib/validation/expense-schema'
import { services } from '@/services'
import type { CurrencyCode, Money } from '@/types'

export interface SettlementPrefill {
  groupId: string
  /** Omitted when the caller only wants to preselect the group. */
  fromUserId?: string
  toUserId?: string
  amount?: Money
}

interface RecordSettlementDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  prefill?: SettlementPrefill | null
  /** Restrict to one group and hide the group picker. */
  lockedGroupId?: string
}

/**
 * Record a payment between two people.
 *
 * A settlement is not spending — it never reaches the analytics module. All it
 * does is move both parties' balances toward zero.
 */
export function RecordSettlementDialog({
  open,
  onOpenChange,
  prefill,
  lockedGroupId,
}: RecordSettlementDialogProps) {
  const groups = useMyGroups()
  const currentUserId = useCurrentUserId()

  const [groupId, setGroupId] = React.useState(
    prefill?.groupId ?? lockedGroupId ?? groups[0]?.id ?? '',
  )
  const [fromUserId, setFromUserId] = React.useState(prefill?.fromUserId || currentUserId)
  const [toUserId, setToUserId] = React.useState(prefill?.toUserId ?? '')
  const [amountText, setAmountText] = React.useState('')
  const [date, setDate] = React.useState(todayISO())
  const [note, setNote] = React.useState('')
  const [error, setError] = React.useState<string>()
  const [saving, setSaving] = React.useState(false)

  const members = useGroupMembers(groupId)
  const group = groups.find((candidate) => candidate.id === groupId)
  const currency: CurrencyCode = group?.currency ?? 'PKR'
  const ledger = useGroupLedger(groupId)

  // Re-seed whenever the dialog is opened with a new suggestion behind it.
  React.useEffect(() => {
    if (!open) return
    const nextGroup = prefill?.groupId ?? lockedGroupId ?? groups[0]?.id ?? ''
    setGroupId(nextGroup)
    setFromUserId(prefill?.fromUserId || currentUserId)
    setToUserId(prefill?.toUserId ?? '')
    setAmountText(prefill?.amount ? toMajorString(prefill.amount, currency) : '')
    setDate(todayISO())
    setNote('')
    setError(undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prefill])

  const amount = parseMoney(amountText, currency) ?? 0

  /** What is actually outstanding between the two chosen people. */
  const outstanding =
    fromUserId && toUserId ? netBetween(ledger.pairwise, toUserId, fromUserId) : 0

  const memberUsers = members.map((member) => member.user)
  const fromUser = memberUsers.find((user) => user.id === fromUserId)
  const toUser = memberUsers.find((user) => user.id === toUserId)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = settlementDraftSchema.safeParse({
      groupId,
      fromUserId,
      toUserId,
      amount,
      currency,
      date,
      note,
    })

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }
    setError(undefined)

    setSaving(true)
    try {
      await services.settlements.record({ ...parsed.data, currency })
      toast.success('Settlement recorded', { description: 'Balances have been updated.' })
      onOpenChange(false)
    } catch (caught) {
      toast.error('Could not record the settlement', {
        description: caught instanceof Error ? caught.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Record a settlement</DialogTitle>
            <DialogDescription>
              Log a payment that has already happened. This won’t count as spending.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">
            {!lockedGroupId ? (
              <Field label="Group" htmlFor="settlement-group">
                <Select value={groupId} onValueChange={setGroupId}>
                  <SelectTrigger id="settlement-group">
                    <SelectValue placeholder="Choose a group" />
                  </SelectTrigger>
                  <SelectContent>
                    {groups.map((candidate) => (
                      <SelectItem key={candidate.id} value={candidate.id}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            ) : null}

            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <Field label="From" htmlFor="settlement-from">
                <Select value={fromUserId} onValueChange={setFromUserId}>
                  <SelectTrigger id="settlement-from">
                    <SelectValue placeholder="Who paid" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberUsers.map((user) => (
                      <SelectItem key={user.id} value={user.id}>
                        {user.id === currentUserId ? 'You' : user.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <span className="hidden pb-2.5 text-muted-foreground sm:block" aria-hidden>
                <ArrowRight className="size-4" />
              </span>

              <Field label="To" htmlFor="settlement-to">
                <Select value={toUserId} onValueChange={setToUserId}>
                  <SelectTrigger id="settlement-to">
                    <SelectValue placeholder="Who received it" />
                  </SelectTrigger>
                  <SelectContent>
                    {memberUsers
                      .filter((user) => user.id !== fromUserId)
                      .map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.id === currentUserId ? 'You' : user.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>

            {fromUser && toUser ? (
              <div className="flex items-center gap-2 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                <UserAvatar user={fromUser} size="xs" />
                <ArrowRight className="size-3.5" aria-hidden />
                <UserAvatar user={toUser} size="xs" />
                <span className="flex-1">
                  {outstanding > 0
                    ? `Outstanding: ${formatMoney(outstanding, currency)}`
                    : outstanding < 0
                      ? `Note: ${toUser.name.split(' ')[0]} currently owes ${fromUser.name.split(' ')[0]} ${formatMoney(-outstanding, currency)}`
                      : 'These two are already settled up'}
                </span>
                {outstanding > 0 ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-xs"
                    onClick={() => setAmountText(toMajorString(outstanding, currency))}
                  >
                    Use full
                  </Button>
                ) : null}
              </div>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <AmountInput
                value={amountText}
                onChange={setAmountText}
                currency={currency}
                id="settlement-amount"
              />
              <Field label="Date" htmlFor="settlement-date">
                <Input
                  id="settlement-date"
                  type="date"
                  value={date}
                  max={todayISO()}
                  onChange={(event) => setDate(event.target.value)}
                />
              </Field>
            </div>

            <Field label="Note" htmlFor="settlement-note" hint="Optional." error={error}>
              <Input
                id="settlement-note"
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Sent via bank transfer"
                autoComplete="off"
              />
            </Field>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Record settlement
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
