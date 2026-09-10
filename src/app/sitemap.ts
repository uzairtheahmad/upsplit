import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

/**
 * The sitemap.
 *
 * Only the three pages a signed-out visitor can actually reach. Everything
 * else in the app requires a session, so listing it would advertise URLs that
 * answer every crawler with a redirect to /login.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const origin = siteUrl()
  const lastModified = new Date()

  return [
    { url: origin, lastModified, changeFrequency: 'monthly', priority: 1 },
    { url: `${origin}/signup`, lastModified, changeFrequency: 'yearly', priority: 0.8 },
    { url: `${origin}/login`, lastModified, changeFrequency: 'yearly', priority: 0.5 },
  ]
}
