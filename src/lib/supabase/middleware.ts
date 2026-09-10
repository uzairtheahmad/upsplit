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
 * This replaces the client-side gate in AppShell: an unauthenticated user is
 * redirected before any protected page renders, rather than after it has
 * already been sent to the browser.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request })

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
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

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
