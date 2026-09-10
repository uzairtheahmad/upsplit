import type { MetadataRoute } from 'next'

import { siteUrl } from '@/lib/site'

/**
 * Crawler rules.
 *
 * Everything signed-in is disallowed. Not as a security measure, since that is
 * what middleware and RLS are for, but because a crawler following those links
 * only ever reaches a sign-in redirect, which wastes crawl budget and can get
 * a login page indexed under a group's URL.
 *
 * `/invite/` and `/join/` matter more: those URLs carry a token that is the
 * authorisation to join a group. They also send `noindex` themselves, so this
 * is the second of two locks.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/',
        '/invite/',
        '/join/',
        '/dashboard',
        '/groups',
        '/expenses',
        '/balances',
        '/settlements',
        '/members',
        '/activity',
        '/analytics',
        '/settings',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
  }
}
