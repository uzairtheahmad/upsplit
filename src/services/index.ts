import { supabaseServices } from './supabase/supabase-services'
import type { DataServices } from './types'

/**
 * The one place the app chooses a data implementation.
 *
 * There is only one, and Supabase is it. The indirection stays because the
 * `DataServices` interface is what keeps storage out of the components: a
 * component imports `services`, never a Supabase client.
 */
export const services: DataServices = supabaseServices

export * from './types'
