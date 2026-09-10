'use client'

import { CheckCircle2, Eye, EyeOff } from 'lucide-react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
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

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [remember, setRemember] = React.useState(true)
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({})
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: typeof errors = {}
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address'
    if (password.length < 8) next.password = 'Passwords are at least 8 characters'
    setErrors(next)
    if (Object.keys(next).length > 0) return

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
    const destination = searchParams.get('next') || '/dashboard'
    router.replace(destination)
    router.refresh()
  }

  return (
    <div className="space-y-6">
      <header className="space-y-1.5">
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back</h1>
        <p className="text-sm text-muted-foreground">Log in to pick up where you left off.</p>
      </header>

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
        <Link href="/signup" className="font-medium text-primary underline-offset-4 hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  )
}

export function SignupForm() {
  const router = useRouter()

  const [name, setName] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [password, setPassword] = React.useState('')
  const [confirm, setConfirm] = React.useState('')
  const [accepted, setAccepted] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})
  const [loading, setLoading] = React.useState(false)

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault()
    const next: Record<string, string> = {}
    if (name.trim().length < 2) next.name = 'Enter your full name'
    if (!EMAIL_PATTERN.test(email.trim())) next.email = 'Enter a valid email address'
    if (password.length < 8) next.password = 'Use at least 8 characters'
    if (confirm !== password) next.confirm = 'Passwords don’t match'
    if (!accepted) next.terms = 'Please accept the terms to continue'
    setErrors(next)
    if (Object.keys(next).length > 0) return

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
      router.push('/login')
      return
    }

    toast.success('Account created', { description: 'Welcome to UpSplit.' })
    router.replace('/dashboard')
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
              <span className="font-medium text-foreground">Terms of Service</span> and{' '}
              <span className="font-medium text-foreground">Privacy Policy</span>.
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
        <Link href="/login" className="font-medium text-primary underline-offset-4 hover:underline">
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
