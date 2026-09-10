import { Suspense } from 'react'

import { SignupForm } from '@/components/auth/auth-forms'

export const metadata = { title: 'Create your account' }

/**
 * SignupForm reads `?next` and `?email` via useSearchParams, which opts the
 * route into client-side rendering. The Suspense boundary is what lets the
 * rest of the page prerender instead of failing the build.
 */
export default function SignupPage() {
  return (
    <Suspense fallback={<div className="h-96" aria-busy />}>
      <SignupForm />
    </Suspense>
  )
}
