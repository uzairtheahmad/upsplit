import { supabaseServices } from './supabase/supabase-services'
import type { DataServices } from './types'

/**
 * The one place the app chooses a data implementation.
 *
 * The Phase 1 mock lives on in ./mock for reference, but the app now talks to
 * Supabase. Nothing that imports `services` knows which one it got.
 */
export const services: DataServices = supabaseServices

export * from './types'
