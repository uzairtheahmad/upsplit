import { PageLoader } from '@/components/shared/states'

/**
 * Route-level loading UI for every page inside the app shell.
 *
 * This was a dashboard-shaped skeleton — four stat cards and a list — which
 * rendered on routes that have neither, so a slow navigation looked like a
 * half-loaded page rather than a page that was still loading.
 */
export default function AppLoading() {
  return <PageLoader />
}
