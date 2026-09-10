import { createClient as createSupabaseClient, type SupabaseClient } from '@supabase/supabase-js'

import { supabaseUrl } from './env'

/**
 * A Supabase client that bypasses every RLS policy.
 *
 * This is for server-only code that has to see rows no user owns. Today that
 * means one thing: draining `email_outbox`, which has RLS enabled and no
 * policy at all, so it is invisible to `anon` and `authenticated` alike.
 *
 * Never import this from a client component. `SUPABASE_SERVICE_ROLE_KEY` has
 * no `NEXT_PUBLIC_` prefix, so Next.js will not inline it into the browser
 * bundle and the import would fail at build time rather than leak. That is the
 * intended behaviour, not an obstacle to work around.
 */
export function createAdminClient(): SupabaseClient {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!key || key.trim() === '') {
    throw new Error(
      'Missing SUPABASE_SERVICE_ROLE_KEY. It is needed to drain the email outbox. ' +
        'Find it in Supabase Dashboard -> Project Settings -> API -> service_role. ' +
        'Set it as a server-only variable, never with a NEXT_PUBLIC_ prefix.',
    )
  }

  return createSupabaseClient(supabaseUrl(), key.trim(), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** Whether the service role key is configured, without throwing if it isn't. */
export function hasAdminCredentials(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim())
}
