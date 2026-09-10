/**
 * The public origin of this deployment.
 *
 * One definition, because two would eventually disagree: page metadata and
 * emailed links have to resolve to the same place, and an email cannot fall
 * back to a relative URL the way a page can.
 *
 * Precedence:
 *
 *   1. NEXT_PUBLIC_SITE_URL, when you want to be explicit. Set it to
 *      http://localhost:3000 in .env.local so local invitation emails link
 *      somewhere you can actually open.
 *   2. VERCEL_PROJECT_PRODUCTION_URL, which Vercel sets on every deployment.
 *      It names the production domain even from a preview build, so a preview
 *      does not email people links into itself.
 *   3. The production domain, so a build with no environment at all still
 *      produces correct share metadata rather than pointing at localhost.
 */
const PRODUCTION_URL = 'https://upsplit.vercel.app'

export function siteUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim()
  if (explicit) return explicit.replace(/\/$/, '')

  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim()
  if (vercel) return `https://${vercel}`

  return PRODUCTION_URL
}

/**
 * Validates a `?next=` destination.
 *
 * Middleware sets it when it bounces someone, and an invitation link sets it
 * so the recipient lands back on the invitation rather than a bare dashboard.
 * Only a same-site absolute path is accepted: a full URL, or the
 * protocol-relative "//evil.com", would turn a sign-in into an open redirect.
 *
 * Lives here rather than beside the auth forms because a `'use client'` module
 * cannot export a function the server is allowed to call, and the auth pages
 * read the query on the server so their routes still prerender.
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return '/dashboard'
  return next
}
