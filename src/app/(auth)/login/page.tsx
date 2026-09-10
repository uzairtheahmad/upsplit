import { Suspense } from 'react'

import { LoginForm } from '@/components/auth/auth-forms'

export const metadata = { title: 'Log in' }

/**
 * LoginForm reads `?next` via useSearchParams, which opts the route into
 * client-side rendering. The Suspense boundary is what lets the rest of the
 * page prerender instead of failing the build.
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-busy />}>
      <LoginForm />
    </Suspense>
  )
}
