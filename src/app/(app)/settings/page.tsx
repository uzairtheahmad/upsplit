'use client'

import {
  AlertTriangle,
  KeyRound,
  LogOut,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react'
import { useTheme } from 'next-themes'
import * as React from 'react'
import { toast } from 'sonner'

import { PageContainer, PageHeader } from '@/components/shared/page-header'
import { UserAvatar } from '@/components/ui/avatar'
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
import { Field, Input, Label } from '@/components/ui/input'
import { Separator, Switch } from '@/components/ui/misc'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useCurrentUser, useGlobalLedger, usePreferences } from '@/hooks/use-app-data'
import { useRefreshWorkspace, useSignOut } from '@/hooks/use-session'
import { CURRENCIES, CURRENCY_CODES, formatMoney } from '@/lib/money/money'
import { createClient } from '@/lib/supabase/client'
import { services } from '@/services'
import type { CurrencyCode } from '@/types'

/** Avatars are shown at 96px at most; 2 MB is generous for that. */
const MAX_AVATAR_BYTES = 2 * 1024 * 1024

function ProfileSection() {
  const user = useCurrentUser()
  const [name, setName] = React.useState(user?.name ?? '')
  const [email, setEmail] = React.useState(user?.email ?? '')
  const [saving, setSaving] = React.useState(false)
  const [uploading, setUploading] = React.useState(false)
  const [errors, setErrors] = React.useState<{ name?: string; email?: string }>({})
  const fileInput = React.useRef<HTMLInputElement>(null)

  async function handleAvatar(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    // Reset immediately so picking the same file twice still fires onChange.
    event.target.value = ''
    if (!file) return

    if (!file.type.startsWith('image/')) {
      toast.error('That file is not an image')
      return
    }
    if (file.size > MAX_AVATAR_BYTES) {
      toast.error('That image is too large', { description: 'Pick one under 2 MB.' })
      return
    }

    setUploading(true)
    try {
      await services.profile.uploadAvatar(file)
      toast.success('Photo updated')
    } catch (error) {
      toast.error('Could not upload that photo', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setUploading(false)
    }
  }

  async function handleRemoveAvatar() {
    setUploading(true)
    try {
      await services.profile.removeAvatar()
      toast.success('Photo removed')
    } catch (error) {
      toast.error('Could not remove that photo', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    } finally {
      setUploading(false)
    }
  }

  React.useEffect(() => {
    setName(user?.name ?? '')
    setEmail(user?.email ?? '')
  }, [user?.name, user?.email])

  const dirty = user ? name !== user.name || email !== user.email : false

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (name.trim().length < 2) next.name = 'Enter your name'
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) next.email = 'Enter a valid email address'
    setErrors(next)
    if (Object.keys(next).length > 0) return

    setSaving(true)
    try {
      await services.profile.update({ name: name.trim(), email: email.trim() })
      toast.success('Profile updated')
    } finally {
      setSaving(false)
    }
  }

  if (!user) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>How you appear to everyone in your groups.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5" noValidate>
          <div className="flex items-center gap-4">
            <UserAvatar user={user} size="xl" />
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  loading={uploading}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload aria-hidden />
                  {user.avatarUrl ? 'Change photo' : 'Upload a photo'}
                </Button>
                {user.avatarUrl ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={uploading}
                    onClick={handleRemoveAvatar}
                  >
                    Remove
                  </Button>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground">
                JPG, PNG or WebP, up to 2 MB. Your initials are used until you add one.
              </p>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleAvatar}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Full name" htmlFor="profile-name" error={errors.name}>
              <Input
                id="profile-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email" htmlFor="profile-email" error={errors.email}>
              <Input
                id="profile-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
              />
            </Field>
          </div>

          <div className="flex justify-end">
            <Button type="submit" loading={saving} disabled={!dirty}>
              Save changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function PreferencesSection() {
  const preferences = usePreferences()
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = React.useState(false)

  React.useEffect(() => setMounted(true), [])

  const toggles = [
    {
      key: 'emailNotifications' as const,
      label: 'Email notifications',
      description: 'Get an email when someone adds an expense or settles with you.',
    },
    {
      key: 'pushNotifications' as const,
      label: 'Push notifications',
      description: 'Real-time alerts on your devices.',
    },
    {
      key: 'weeklySummary' as const,
      label: 'Weekly summary',
      description: 'A digest of what your groups spent, every Monday.',
    },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preferences</CardTitle>
        <CardDescription>Defaults for new groups, and how we reach you.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Default currency"
            htmlFor="pref-currency"
            hint="Used when you create a new group."
          >
            <Select
              value={preferences.defaultCurrency}
              onValueChange={(value) =>
                services.profile.updatePreferences({ defaultCurrency: value as CurrencyCode })
              }
            >
              <SelectTrigger id="pref-currency">
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

          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium leading-none">Theme</legend>
            <div className="flex gap-1.5 pt-1">
              {[
                { value: 'light', label: 'Light', icon: Sun },
                { value: 'dark', label: 'Dark', icon: Moon },
                { value: 'system', label: 'System', icon: Monitor },
              ].map(({ value, label, icon: Icon }) => (
                <Button
                  key={value}
                  type="button"
                  variant={mounted && theme === value ? 'subtle' : 'outline'}
                  size="sm"
                  onClick={() => setTheme(value)}
                  aria-pressed={mounted && theme === value}
                >
                  <Icon aria-hidden />
                  {label}
                </Button>
              ))}
            </div>
          </fieldset>
        </div>

        <Separator />

        <ul className="space-y-4">
          {toggles.map((toggle) => (
            <li key={toggle.key} className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <Label htmlFor={`pref-${toggle.key}`}>{toggle.label}</Label>
                <p className="mt-0.5 text-xs text-muted-foreground">{toggle.description}</p>
              </div>
              <Switch
                id={`pref-${toggle.key}`}
                checked={preferences[toggle.key]}
                onCheckedChange={(checked) =>
                  services.profile.updatePreferences({ [toggle.key]: checked })
                }
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

function AccountSection() {
  const signOut = useSignOut()
  const refresh = useRefreshWorkspace()
  const ledger = useGlobalLedger()

  // Groups where this person still has money on the line, in either
  // direction. Deleting an account with a live balance would strand the other
  // side of that debt: the group's books would stop summing to zero and nobody
  // could settle up.
  //
  // Counted in groups rather than summed into a single figure, because each
  // group has its own currency and adding them together would be meaningless.
  const unsettledGroups = ledger.perGroup.filter((entry) => entry.myNet !== 0)
  const hasOutstanding = unsettledGroups.length > 0
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [passwordOpen, setPasswordOpen] = React.useState(false)
  const [refreshing, setRefreshing] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const [password, setPassword] = React.useState('')
  const [confirmPassword, setConfirmPassword] = React.useState('')
  const [passwordError, setPasswordError] = React.useState<string>()
  const [savingPassword, setSavingPassword] = React.useState(false)

  async function handleDeleteAccount() {
    setDeleting(true)
    try {
      await services.profile.deleteAccount()
      // The auth row still exists, so end the session explicitly — otherwise
      // the next request would load a profile that no longer has a name.
      await signOut()
      toast.success('Your account has been deleted')
    } catch (error) {
      setDeleting(false)
      toast.error('Could not delete your account', {
        description: error instanceof Error ? error.message : 'Please try again.',
      })
    }
  }

  async function handleChangePassword(event: React.FormEvent) {
    event.preventDefault()
    if (password.length < 8) {
      setPasswordError('Use at least 8 characters')
      return
    }
    if (password !== confirmPassword) {
      setPasswordError('Passwords don’t match')
      return
    }

    setPasswordError(undefined)
    setSavingPassword(true)

    const { error } = await createClient().auth.updateUser({ password })
    setSavingPassword(false)

    if (error) {
      setPasswordError(error.message)
      return
    }

    setPasswordOpen(false)
    setPassword('')
    setConfirmPassword('')
    toast.success('Password changed')
  }

  async function handleRefresh() {
    setRefreshing(true)
    try {
      await refresh()
      toast.success('Data refreshed')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not refresh')
    } finally {
      setRefreshing(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>Session and demo data.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Change password</p>
              <p className="text-xs text-muted-foreground">
                Set a new password for this account.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setPasswordOpen(true)}>
              <KeyRound aria-hidden />
              Change password
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Refresh data</p>
              <p className="text-xs text-muted-foreground">
                Re-read your groups, expenses and balances from the server.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={handleRefresh} loading={refreshing}>
              <RefreshCw aria-hidden />
              Refresh
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Log out</p>
              <p className="text-xs text-muted-foreground">
                End this session on the current device.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void signOut()}>
              <LogOut aria-hidden />
              Log out
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="text-destructive">Delete account</CardTitle>
          <CardDescription>
            Permanently removes your profile. Every balance you’re part of must be settled
            first.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {hasOutstanding ? (
            <div
              role="status"
              className="flex gap-2.5 rounded-lg border border-border bg-muted/40 p-3"
            >
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="space-y-1.5 text-sm">
                <p className="font-medium text-foreground">
                  You still have money outstanding
                </p>
                <p className="text-xs text-muted-foreground">
                  Settle up in{' '}
                  {unsettledGroups.length === 1
                    ? 'this group'
                    : `these ${unsettledGroups.length} groups`}{' '}
                  before deleting your account:
                </p>
                <ul className="space-y-0.5 text-xs">
                  {unsettledGroups.map((entry) => (
                    <li key={entry.group.id} className="flex items-center gap-1.5">
                      <span className="text-foreground">{entry.group.name}</span>
                      <span className="text-muted-foreground">
                        · you {entry.myNet > 0 ? 'are owed' : 'owe'}{' '}
                        {formatMoney(Math.abs(entry.myNet), entry.group.currency)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          <Button
            variant="destructive"
            size="sm"
            disabled={hasOutstanding}
            onClick={() => setConfirmOpen(true)}
          >
            <Trash2 aria-hidden />
            Delete my account
          </Button>
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
          </DialogHeader>
          <DialogBody className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your balances are all settled, so deleting your account strands nobody.
            </p>
            <p className="text-sm text-muted-foreground">
              You’ll be removed from every group and your name and photo will be erased.
              The expenses and settlements you recorded stay, because other people’s
              balances depend on them. They’ll show as <em>Deleted user</em>.
            </p>
            <p className="text-sm text-muted-foreground">This cannot be undone.</p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} disabled={deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              loading={deleting}
              disabled={hasOutstanding}
              onClick={handleDeleteAccount}
            >
              Delete account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={passwordOpen} onOpenChange={setPasswordOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Change your password</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleChangePassword}>
            <DialogBody className="space-y-4">
              <Field
                label="New password"
                htmlFor="new-password"
                error={passwordError}
                hint="At least 8 characters."
              >
                <Input
                  id="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  aria-invalid={passwordError ? true : undefined}
                />
              </Field>
              <Field label="Confirm new password" htmlFor="confirm-password">
                <Input
                  id="confirm-password"
                  type="password"
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  autoComplete="new-password"
                />
              </Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setPasswordOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={savingPassword}>
                Change password
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}

export default function SettingsPage() {
  return (
    <PageContainer className="max-w-3xl">
      <PageHeader title="Settings" description="Your profile, preferences and account." />
      <ProfileSection />
      <PreferencesSection />
      <AccountSection />
    </PageContainer>
  )
}
