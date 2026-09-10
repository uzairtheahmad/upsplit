import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

import { supabaseAnonKey, supabaseUrl } from './env'

/** Routes reachable without a session. Everything else requires one. */
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth']

function isPublic(pathname: string): boolean {
  return pathname === '/' || PUBLIC_ROUTES.some((route) => pathname.startsWith(route))
}

/**
 * Refreshes the auth session on every request and enforces route access.
 *
 * This replaces a client-side gate: an unauthenticated user is redirected
 * before any protected page renders, rather than after it has already been
 * sent to the browser.
 *
 * Nothing here is allowed to throw. Middleware runs in front of every request,
 * so an uncaught error takes down the entire site — including the landing page
 * and /login — with an opaque platform 500. When the session cannot be
 * resolved the request is instead treated as unauthenticated, which fails
 * closed: public pages still render, protected ones bounce to /login, and the
 * app's own error boundary can show what actually went wrong.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { pathname } = request.nextUrl

  let user: { id: string } | null = null

  try {
    const supabase = createServerClient(supabaseUrl(), supabaseAnonKey(), {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value)
          }
          response = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options)
          }
        },
      },
    })

    // getUser() revalidates the token with Supabase. Do not swap this for
    // getSession(), which trusts a cookie the browser could have forged.
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (cause) {
    // Two things land here: the Supabase environment variables are missing
    // (a deployment that was built without them), or Supabase is unreachable.
    // Neither is worth a site-wide 500.
    console.error(
      '[UpSplit] middleware could not resolve a session; treating the request as signed out.',
      cause,
    )
  }

  if (!user && !isPublic(pathname)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    // Send them back where they were trying to go once they sign in.
    url.searchParams.set('next', pathname)
    return NextResponse.redirect(url)
  }

  if (user && (pathname === '/login' || pathname === '/signup')) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    url.search = ''
    return NextResponse.redirect(url)
  }

  return response
}
