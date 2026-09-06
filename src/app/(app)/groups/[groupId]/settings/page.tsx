'use client'

import { Archive, ArchiveRestore, Check, Trash2 } from 'lucide-react'
import { useParams, useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Field, Input, Label, Textarea } from '@/components/ui/input'
import { Separator } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  GROUP_COLOR_KEYS,
  GROUP_ICON_KEYS,
  groupColor,
  groupIcon,
} from '@/constants/categories'
import { useGroup, useGroupLedger, useMyRole } from '@/hooks/use-app-data'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import { services } from '@/services'
import type { CurrencyCode } from '@/types'

export default function GroupSettingsPage() {
  const { groupId } = useParams<{ groupId: string }>()
  const router = useRouter()
  const group = useGroup(groupId)
  const ledger = useGroupLedger(groupId)
  const permissions = useMyRole(groupId)

  const [name, setName] = React.useState(group?.name ?? '')
  const [description, setDescription] = React.useState(group?.description ?? '')
  const [currency, setCurrency] = React.useState<CurrencyCode>(group?.currency ?? 'PKR')
  const [icon, setIcon] = React.useState(group?.icon ?? GROUP_ICON_KEYS[0])
  const [color, setColor] = React.useState(group?.color ?? GROUP_COLOR_KEYS[0])
  const [saving, setSaving] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState(false)

  React.useEffect(() => {
    if (!group) return
    setName(group.name)
    setDescription(group.description ?? '')
    setCurrency(group.currency)
    setIcon(group.icon)
    setColor(group.color)
  }, [group])

  if (!group) return null

  const dirty =
    name !== group.name ||
    description !== (group.description ?? '') ||
    currency !== group.currency ||
    icon !== group.icon ||
    color !== group.color

  const unsettled = ledger.balances.filter((balance) => balance.net !== 0).length

  async function handleSave(event: React.FormEvent) {
    event.preventDefault()
    if (name.trim().length < 2) {
      toast.error('Give the group a name')
      return
    }
    setSaving(true)
    try {
      await services.groups.update(groupId, {
        name: name.trim(),
        description: description.trim() || undefined,
        currency,
        icon,
        color,
      })
      toast.success('Group updated')
    } finally {
      setSaving(false)
    }
  }

  const Icon = groupIcon(icon)

  return (
    <div className="max-w-2xl space-y-5">
      <Card>
        <CardHeader>
          <CardTitle>Group details</CardTitle>
          <CardDescription>
            {permissions.canManageGroup
              ? 'Only the group owner can change these.'
              : 'Only the group owner can change these settings.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <fieldset disabled={!permissions.canManageGroup} className="contents">
            <form onSubmit={handleSave} className="space-y-5" noValidate>
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    'flex size-12 shrink-0 items-center justify-center rounded-xl',
                    groupColor(color).chip,
                  )}
                  aria-hidden
                >
                  <Icon className="size-5" />
                </span>
                <Field label="Group name" htmlFor="group-settings-name" className="flex-1">
                  <Input
                    id="group-settings-name"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    disabled={!permissions.canManageGroup}
                  />
                </Field>
              </div>

              <Field label="Description" htmlFor="group-settings-description">
                <Textarea
                  id="group-settings-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={2}
                  disabled={!permissions.canManageGroup}
                />
              </Field>

              <Field
                label="Currency"
                htmlFor="group-settings-currency"
                hint={
                  ledger.expenses.length > 0
                    ? 'Existing expenses keep the amounts they were recorded with.'
                    : undefined
                }
              >
                <Select
                  value={currency}
                  onValueChange={(value) => setCurrency(value as CurrencyCode)}
                  disabled={!permissions.canManageGroup}
                >
                  <SelectTrigger id="group-settings-currency">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CURRENCY_CODES.map((code) => (
                      <SelectItem key={code} value={code}>
                        {code} · {CURRENCIES[code].symbol}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>

              <div className="space-y-1.5">
                <Label>Icon</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_ICON_KEYS.map((key) => {
                    const KeyIcon = groupIcon(key)
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setIcon(key)}
                        aria-label={`${key} icon`}
                        aria-pressed={icon === key}
                        disabled={!permissions.canManageGroup}
                        className={cn(
                          'flex size-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                          icon === key
                            ? 'border-primary bg-primary-muted text-primary'
                            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
                        )}
                      >
                        <KeyIcon className="size-4" />
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Colour</Label>
                <div className="flex flex-wrap gap-1.5">
                  {GROUP_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setColor(key)}
                      aria-label={`${key} accent`}
                      aria-pressed={color === key}
                      disabled={!permissions.canManageGroup}
                      className={cn(
                        'flex size-8 items-center justify-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
                        groupColor(key).chip,
                        color === key && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                      )}
                    >
                      {color === key ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </button>
                  ))}
                </div>
              </div>

              {permissions.canManageGroup ? (
                <div className="flex justify-end">
                  <Button type="submit" loading={saving} disabled={!dirty}>
                    Save changes
                  </Button>
                </div>
              ) : null}
            </form>
          </fieldset>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Archive</CardTitle>
          <CardDescription>
            Archived groups keep their full history but drop out of your active lists.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {group.archivedAt ? (
            <Button
              variant="outline"
              onClick={async () => {
                await services.groups.restore(groupId)
                toast.success('Group restored')
              }}
              disabled={!permissions.canManageGroup}
            >
              <ArchiveRestore aria-hidden />
              Restore group
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                await services.groups.archive(groupId)
                toast.success('Group archived')
              }}
              disabled={!permissions.canManageGroup}
            >
              <Archive aria-hidden />
              Archive group
            </Button>
          )}
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete group</CardTitle>
          <CardDescription>
            Removes the group for everyone. Expenses are soft-deleted, so the records survive for
            audit.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {unsettled > 0 ? (
            <p className="rounded-lg bg-warning-muted px-3 py-2 text-xs text-warning">
              {unsettled} {unsettled === 1 ? 'member has' : 'members have'} an outstanding balance.
              Settle up before deleting so nobody loses track of what they’re owed.
            </p>
          ) : null}
          <Button
            variant="destructive"
            onClick={() => setConfirmDelete(true)}
            disabled={!permissions.canManageGroup}
          >
            <Trash2 aria-hidden />
            Delete group
          </Button>
          {!permissions.canManageGroup ? (
            <p className="text-xs text-muted-foreground">Only the owner can delete this group.</p>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete {group.name}?</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              This removes the group and its {ledger.expenses.length} expenses from everyone’s
              lists. It can’t be undone from here.
            </p>
            {unsettled > 0 ? (
              <>
                <Separator />
                <p className="text-sm text-warning">
                  {unsettled} {unsettled === 1 ? 'person still has' : 'people still have'} money on
                  the line in this group.
                </p>
              </>
            ) : null}
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={async () => {
                await services.groups.remove(groupId)
                setConfirmDelete(false)
                toast.success('Group deleted')
                router.push('/groups')
              }}
            >
              Delete group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
