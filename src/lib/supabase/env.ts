/**
 * Supabase environment, validated at the point of use.
 *
 * These are read inside functions rather than at module scope on purpose. A
 * throw during module evaluation happens before React has mounted anything,
 * so no error boundary can catch it and the App Router reports "missing
 * required error components" instead of the real problem. Reading them lazily
 * means a missing key surfaces as an ordinary, catchable error.
 *
 * `process.env.NEXT_PUBLIC_*` is still referenced statically, so Next.js
 * inlines the value into the browser bundle exactly as before.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing ${name}. Copy .env.local.example to .env.local, fill in the values from ` +
        'Supabase Dashboard -> Project Settings -> API, then restart `npm run dev`.',
    )
  }
  return value.trim()
}

export function supabaseUrl(): string {
  return required('NEXT_PUBLIC_SUPABASE_URL', process.env.NEXT_PUBLIC_SUPABASE_URL)
}

export function supabaseAnonKey(): string {
  return required('NEXT_PUBLIC_SUPABASE_ANON_KEY', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
}
