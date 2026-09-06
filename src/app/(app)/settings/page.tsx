'use client'

import { LogOut, Monitor, Moon, RotateCcw, Sun, Trash2 } from 'lucide-react'
import { useTheme } from 'next-themes'
import { useRouter } from 'next/navigation'
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
import { useCurrentUser, usePreferences } from '@/hooks/use-app-data'
import { CURRENCIES, CURRENCY_CODES } from '@/lib/money/money'
import { useAppStore } from '@/lib/store/app-store'
import { services } from '@/services'
import type { CurrencyCode } from '@/types'

function ProfileSection() {
  const user = useCurrentUser()
  const [name, setName] = React.useState(user?.name ?? '')
  const [email, setEmail] = React.useState(user?.email ?? '')
  const [saving, setSaving] = React.useState(false)
  const [errors, setErrors] = React.useState<{ name?: string; email?: string }>({})

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
            <div className="space-y-1">
              <Button type="button" variant="outline" size="sm" disabled>
                Upload a photo
              </Button>
              <p className="text-xs text-muted-foreground">
                Avatar uploads arrive with the backend. Your initials are used until then.
              </p>
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
  const router = useRouter()
  const signOut = useAppStore((state) => state.signOut)
  const resetToSeed = useAppStore((state) => state.resetToSeed)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

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
                Available once authentication is connected.
              </p>
            </div>
            <Button variant="outline" size="sm" disabled>
              Change password
            </Button>
          </div>

          <Separator />

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium">Reset demo data</p>
              <p className="text-xs text-muted-foreground">
                Restore the sample groups and expenses, discarding your changes.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                resetToSeed()
                toast.success('Demo data restored')
              }}
            >
              <RotateCcw aria-hidden />
              Reset
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                signOut()
                router.push('/login')
              }}
            >
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
            Permanently removes your profile. Balances you’re part of must be settled first.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
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
          <DialogBody>
            <p className="text-sm text-muted-foreground">
              This is a demo, so nothing is actually deleted. In the real product this would remove
              your profile and require every outstanding balance to be settled first.
            </p>
          </DialogBody>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false)
                toast.info('Nothing was deleted', {
                  description: 'Account deletion arrives with the backend.',
                })
              }}
            >
              Delete account
            </Button>
          </DialogFooter>
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
