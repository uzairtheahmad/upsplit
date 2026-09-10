'use client'

import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import * as React from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Field, Input, Label } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/misc'
import { createClient } from '@/lib/supabase/client'

/**
 * Supabase authentication.
 *
 * The client-side validation here is a courtesy to the user; Supabase is the
 * thing that actually decides. Errors from it are surfaced verbatim rather
 * than replaced with a generic message, because "Email not confirmed" and
 * "Invalid login credentials" need different actions from the user.
 */

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

function PasswordInput({
  id,
  value,
  onChange,
  autoComplete,
  placeholder = '••••••••',
  invalid,
}: {
  id: string
  value: string
  onChange: (value: string) => void
  autoComplete: string
  placeholder?: string
  invalid?: boolean
}) {
  const [visible, setVisible] = React.useState(false)

  return (
    <div className="relative">
      <Input
        id={id}
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={invalid || undefined}
        className="pr-10"
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={visible ? 'Hide password' : 'Show password'}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

/**
 * Google sign-in.
 *
 * Shared by both forms, because "log in" and "sign up" are the same operation
 * to an OAuth provider: Google decides whether the account exists, and
 * Supabase creates a profile the first time either way.
 *
 * The redirect goes to /auth/callback, which exchanges the one-time code for a
 * session and then honours `next`. That route already validates `next` as a
 * relative path, so an invitation link survives the round trip without opening
 * a redirect hole.
 */
function GoogleButton({ next, label }: { next: string; label: string }) {
  const [loading, setLoading] = React.useState(false)

  async function handleClick() {
    setLoading(true)
    const supabase = createClient()
    const callback = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`

    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: callback },
    })

    // On success the browser is already navigating to Google, so the spinner
    // is only ever cleared on failure.
    if (error) {
      setLoading(false)
      toast.error('Could not continue with Google', { description: error.message })
    }
  }

  return (
    <Button
      type="button"
      variant="outline"
      size="lg"
      className="w-full"
      loading={loading}
      onClick={handleClick}
    >
      {loading ? null : <GoogleIcon />}
      {label}
    </Button>
  )
}

/** Google's mark. Inline because the CSP blocks external images. */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 18 18" className="size-4" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.02-3.7H.96v2.34A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.98 10.72a5.4 5.4 0 0 1 0-3.44V4.94H.96a9 9 0 0 0 0 8.12l3.02-2.34Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l3.02 2.34C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  )
}

/** A labelled rule, so the two ways in read as alternatives. */
function OrDivider() {
  return (
    <div className="flex items-center gap-3">
      <span className="h-px flex-1 bg-border" />
      <span className="text-xs text-muted-foreground">or</span>
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}

export function LoginForm({ next = '/dashboard' }: { next?: string }) {
  const router = useRouter()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [remember, setRemember] = React.useState(true)
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found: typeof errors = {}
    if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Enter a valid email address'
    if (password.length < 8) found.password = 'Passwords are at least 8 characters'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    })

    if (error) {
      setLoading(false)
      setErrors({ password: error.message })
      return
    }

    toast.success('Welcome back')
    // Middleware set ?next when it bounced an unauthenticated visitor, so
    // signing in returns them to the page they actually asked for.
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Log in to pick up where you left off.</p>
      </header>

      <GoogleButton next={next} label="Continue with Google" />

      <OrDivider />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="login-email" error={errors.email}>
          <Input
            id="login-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="login-password">Password</Label>
            <Link
              href="/forgot-password"
              className="text-xs font-medium text-primary underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={setPassword}
            autoComplete="current-password"
            invalid={Boolean(errors.password)}
          />
          {errors.password ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.password}
            </p>
          ) : null}
        </div>

        <label htmlFor="remember" className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox
            id="remember"
            checked={remember}
            onCheckedChange={(checked) => setRemember(checked === true)}
          />
          Remember me for 30 days
        </label>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Log in
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        New here?{' '}
        <Link
          href={`/signup?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Create an account
        </Link>
      </p>
    </div>
  )
}

export function SignupForm({
  next = '/dashboard',
  invitedEmail = '',
}: {
  next?: string
  /**
   * The address an invitation was sent to. Prefilled so the person does not
   * retype it, and so they sign up with the address the pending invitation is
   * filed under.
   */
  invitedEmail?: string
}) {
  const router = useRouter()

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState(invitedEmail)
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const found: Record<string, string> = {}
    if (name.trim().length < 2) found.name = 'Enter your full name'
    if (!EMAIL_PATTERN.test(email.trim())) found.email = 'Enter a valid email address'
    if (password.length < 8) found.password = 'Use at least 8 characters'
    if (confirm !== password) found.confirm = 'Passwords don’t match'
    if (!accepted) found.terms = 'Please accept the terms to continue'
    setErrors(found)
    if (Object.keys(found).length > 0) return

    setLoading(true)
    const supabase = createClient()
    // full_name is read by the on_auth_user_created trigger to populate the
    // profiles row, so the name has to travel with the signup.
    const { data, error } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    })

    if (error) {
      setLoading(false)
      setErrors({ email: error.message })
      return
    }

    // With email confirmation on, signUp returns a user but no session.
    if (!data.session) {
      setLoading(false)
      toast.success('Check your inbox', {
        description: 'Confirm your email address to finish signing up.',
      })
      // Carry the destination through, so confirming and then logging in still
      // ends on the invitation they were following.
      router.push(`/login?next=${encodeURIComponent(next)}`)
      return
    }

    toast.success('Account created', { description: 'Welcome to UpSplit.' })
    router.replace(next)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Create your account</h1>
        <p className="text-sm text-muted-foreground">
          Start tracking shared expenses in under a minute.
        </p>
      </header>

      <GoogleButton next={next} label="Sign up with Google" />

      <OrDivider />

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Full name" htmlFor="signup-name" error={errors.name}>
          <Input
            id="signup-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoComplete="name"
            placeholder="Uzair Ahmed"
            autoFocus
            aria-invalid={errors.name ? true : undefined}
          />
        </Field>

        <Field label="Email" htmlFor="signup-email" error={errors.email}>
          <Input
            id="signup-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={errors.email ? true : undefined}
          />
        </Field>

        <Field
          label="Password"
          htmlFor="signup-password"
          error={errors.password}
          hint="At least 8 characters."
        >
          <PasswordInput
            id="signup-password"
            value={password}
            onChange={setPassword}
            autoComplete="new-password"
            invalid={Boolean(errors.password)}
          />
        </Field>

        <Field label="Confirm password" htmlFor="signup-confirm" error={errors.confirm}>
          <PasswordInput
            id="signup-confirm"
            value={confirm}
            onChange={setConfirm}
            autoComplete="new-password"
            invalid={Boolean(errors.confirm)}
          />
        </Field>

        <div className="space-y-1">
          <label htmlFor="terms" className="flex cursor-pointer items-start gap-2 text-sm">
            <Checkbox
              id="terms"
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
              className="mt-0.5"
            />
            <span className="text-muted-foreground">
              I agree to the{' '}
              <Link
                href="/terms"
                target="_blank"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Terms of Service
              </Link>{' '}
              and{' '}
              <Link
                href="/privacy"
                target="_blank"
                className="font-medium text-foreground underline underline-offset-4"
              >
                Privacy Policy
              </Link>
              .
            </span>
          </label>
          {errors.terms ? (
            <p role="alert" className="text-xs font-medium text-destructive">
              {errors.terms}
            </p>
          ) : null}
        </div>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Create account
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href={`/login?next=${encodeURIComponent(next)}`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Log in
        </Link>
      </p>
    </div>
  )
}

export function ForgotPasswordForm() {
  const [email, setEmail] = React.useState('')
  const [error, setError] = React.useState<string>()
  const [loading, setLoading] = React.useState(false)
  const [sent, setSent] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('Enter a valid email address')
      return
    }
    setError(undefined)
    setLoading(true)

    const supabase = createClient()
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    })

    setLoading(false)

    if (resetError) {
      setError(resetError.message)
      return
    }

    // Shown whether or not the address exists, so this cannot be used to
    // discover which emails have accounts.
    setSent(true)
  }

  if (sent) {
    return (
      <div className="space-y-6 text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-positive-muted text-positive">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Check your inbox</h1>
          <p className="text-sm text-muted-foreground">
            If an account exists for <span className="font-medium text-foreground">{email}</span>,
            we’ve sent a link to reset your password.
          </p>
        </div>
        <div className="space-y-2">
          <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
            Use a different email
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to log in</Link>
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Reset your password</h1>
        <p className="text-sm text-muted-foreground">
          Enter your email and we’ll send you a link to set a new one.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email" htmlFor="reset-email" error={error}>
          <Input
            id="reset-email"
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
            autoFocus
            aria-invalid={error ? true : undefined}
          />
        </Field>

        <Button type="submit" className="w-full" size="lg" loading={loading}>
          Send reset link
        </Button>
      </form>

      <p className="text-center text-sm text-muted-foreground">
        Remembered it?{' '}
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
          Log in
        </Link>
      </p>
    </div>
  )
}
