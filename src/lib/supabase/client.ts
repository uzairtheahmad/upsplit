'use client'

import { createBrowserClient } from '@supabase/ssr'

import { supabaseAnonKey, supabaseUrl } from './env'

/**
 * The browser Supabase client.
 *
 * `createBrowserClient` memoises internally, so calling this from many
 * components is cheap and they all share one auth session.
 */
export function createClient() {
  return createBrowserClient(supabaseUrl(), supabaseAnonKey())
}
