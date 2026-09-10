import { LoginForm } from '@/components/auth/auth-forms'
import { safeNext } from '@/lib/site'

export const metadata = { title: 'Log in' }

/**
 * `next` is read here, on the server, rather than with useSearchParams in the
 * form. A client hook would opt the whole route out of prerendering and leave
 * a signed-out visitor looking at an empty box until the JavaScript loads.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>
}) {
  const { next } = await searchParams
  return <LoginForm next={safeNext(next)} />
}
