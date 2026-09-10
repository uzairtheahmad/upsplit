import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * A Supabase client for Server Components, Route Handlers and Server Actions.
 *
 * Must be created per request — it closes over that request's cookies, so a
 * module-level singleton would leak one user's session into another's request.
 */
export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient(supabaseUrl(), supabaseAnonKey(), {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session, so this is safe to ignore.
        }
      },
    },
  })
}
