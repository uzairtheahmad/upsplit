import { mockServices } from './mock/mock-services'
import type { DataServices } from './types'

/**
 * The one place the app chooses a data implementation.
 *
 * Phase 2 changes exactly this line:
 *
 *     export const services: DataServices = supabaseServices
 *
 * Nothing that imports `services` needs to know which one it got.
 */
export const services: DataServices = mockServices

export * from './types'
