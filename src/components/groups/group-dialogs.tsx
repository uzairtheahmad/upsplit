'use client'

import { Check } from 'lucide-react'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

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
import { Field, Input, Label, Textarea } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/misc'
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
import { useCurrentUserId, useGroupMembers, useUsers } from '@/hooks/use-app-data'
import { CURRENCY_CODES, CURRENCIES } from '@/lib/money/money'
import { cn } from '@/lib/utils/cn'
import { groupDraftSchema } from '@/lib/validation/expense-schema'
import { services } from '@/services'
import type { CurrencyCode } from '@/types'

export function CreateGroupDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const router = useRouter()
  const users = useUsers()
  const currentUserId = useCurrentUserId()

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [currency, setCurrency] = React.useState<CurrencyCode>('PKR')
  const [icon, setIcon] = React.useState(GROUP_ICON_KEYS[0])
  const [color, setColor] = React.useState(GROUP_COLOR_KEYS[0])
  const [memberIds, setMemberIds] = React.useState<string[]>([])
  const [error, setError] = React.useState<string>()
  const [saving, setSaving] = React.useState(false)

  const candidates = users.filter((user) => user.id !== currentUserId)

  function reset() {
    setName('')
    setDescription('')
    setCurrency('PKR')
    setIcon(GROUP_ICON_KEYS[0])
    setColor(GROUP_COLOR_KEYS[0])
    setMemberIds([])
    setError(undefined)
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const parsed = groupDraftSchema.safeParse({ name, description, currency, icon, color, memberIds })
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message)
      return
    }

    setSaving(true)
    try {
      const group = await services.groups.create({
        ...parsed.data,
        currency: parsed.data.currency as CurrencyCode,
      })
      toast.success('Group created', { description: `${group.name} is ready.` })
      onOpenChange(false)
      reset()
      router.push(`/groups/${group.id}`)
    } catch (caught) {
      toast.error('Could not create the group', {
        description: caught instanceof Error ? caught.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  const Icon = groupIcon(icon)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) reset()
      }}
    >
      <DialogContent size="lg">
        <form onSubmit={handleSubmit} className="contents" noValidate>
          <DialogHeader>
            <DialogTitle>Create a group</DialogTitle>
            <DialogDescription>
              Groups keep expenses and balances for one set of people together.
            </DialogDescription>
          </DialogHeader>

          <DialogBody className="space-y-5">
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
              <Field label="Group name" htmlFor="group-name" error={error} className="flex-1">
                <Input
                  id="group-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="Hunza Weekend Trip"
                  autoFocus
                  autoComplete="off"
                />
              </Field>
            </div>

            <Field label="Description" htmlFor="group-description" hint="Optional.">
              <Textarea
                id="group-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Four days in Karimabad — hotel, fuel and food."
                rows={2}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Currency" htmlFor="group-currency">
                <Select value={currency} onValueChange={(next) => setCurrency(next as CurrencyCode)}>
                  <SelectTrigger id="group-currency">
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
                <Label>Colour</Label>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {GROUP_COLOR_KEYS.map((key) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setColor(key)}
                      aria-label={`${key} accent`}
                      aria-pressed={color === key}
                      className={cn(
                        'flex size-7 items-center justify-center rounded-lg transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
                        groupColor(key).chip,
                        color === key && 'ring-2 ring-ring ring-offset-2 ring-offset-background',
                      )}
                    >
                      {color === key ? <Check className="size-3.5" strokeWidth={3} /> : null}
                    </button>
                  ))}
                </div>
              </div>
            </div>

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
                      className={cn(
                        'flex size-9 items-center justify-center rounded-lg border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
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
              <Label>Add people</Label>
              <p className="text-xs text-muted-foreground">
                You’ll be the group owner. You can invite more people later.
              </p>
              <div className="grid gap-1 rounded-lg border border-border p-1.5 sm:grid-cols-2">
                {candidates.map((user) => {
                  const inputId = `new-group-member-${user.id}`
                  const checked = memberIds.includes(user.id)
                  return (
                    <label
                      key={user.id}
                      htmlFor={inputId}
                      className={cn(
                        'flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 transition-colors hover:bg-accent/60',
                        checked && 'bg-accent/50',
                      )}
                    >
                      <Checkbox
                        id={inputId}
                        checked={checked}
                        onCheckedChange={() =>
                          setMemberIds((current) =>
                            current.includes(user.id)
                              ? current.filter((id) => id !== user.id)
                              : [...current, user.id],
                          )
                        }
                      />
                      <UserAvatar user={user} size="xs" />
                      <span className="min-w-0 flex-1 truncate text-sm">{user.name}</span>
                    </label>
                  )
                })}
              </div>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Create group
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export function InviteMemberDialog({
  open,
  onOpenChange,
  groupId,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  groupId: string
}) {
  const users = useUsers()
  const members = useGroupMembers(groupId)
  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [errors, setErrors] = React.useState<{ name?: string; email?: string }>({})
  const [saving, setSaving] = React.useState(false)

  const memberIds = new Set(members.map((member) => member.userId))
  const suggestions = users.filter((user) => !memberIds.has(user.id))

  async function addExisting(userId: string) {
    try {
      await services.members.add(groupId, userId)
      const user = users.find((candidate) => candidate.id === userId)
      toast.success('Member added', { description: `${user?.name} joined the group.` })
    } catch (error) {
      toast.error('Could not add them', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  async function handleInvite(event: React.FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Enter their name'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      await services.members.invite(groupId, name, email)
      toast.success('Invitation sent', { description: `${name.trim()} was added to the group.` })
      setName('')
      setEmail('')
      onOpenChange(false)
    } catch (error) {
      toast.error('Could not send the invitation', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite someone</DialogTitle>
          <DialogDescription>
            Add a person by email, or pick someone you already share a group with.
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <form onSubmit={handleInvite} id="invite-form" className="space-y-4" noValidate>
            <Field label="Full name" htmlFor="invite-name" error={errors.name}>
              <Input
                id="invite-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Hadi Malik"
                autoFocus
                autoComplete="off"
              />
            </Field>
            <Field label="Email" htmlFor="invite-email" error={errors.email}>
              <Input
                id="invite-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="hadi@example.com"
                autoComplete="off"
              />
            </Field>
          </form>

          {suggestions.length > 0 ? (
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">Or add someone you know</p>
              <ul className="divide-y divide-border rounded-lg border border-border">
                {suggestions.slice(0, 5).map((user) => (
                  <li key={user.id} className="flex items-center gap-2.5 px-3 py-2">
                    <UserAvatar user={user} size="sm" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{user.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" onClick={() => addExisting(user.id)}>
                      Add
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </DialogBody>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form="invite-form" loading={saving}>
            Send invitation
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
