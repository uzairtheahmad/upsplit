import { SignupForm } from '@/components/auth/auth-forms'
import { safeNext } from '@/lib/site'

export const metadata = { title: 'Create your account' }

/** See the note in the login page about why the query is read here. */
export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; email?: string }>
}) {
  const { next, email } = await searchParams
  return <SignupForm next={safeNext(next)} invitedEmail={email ?? ''} />
}
