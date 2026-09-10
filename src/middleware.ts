import type { NextRequest } from 'next/server'

import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  return updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Everything except:
     *  - build output and optimised images, which never need a session
     *  - the generated metadata routes (opengraph-image, icon, apple-icon)
     *    and the crawler files. These have no file extension, so without
     *    naming them they get treated as app routes and redirected to /login
     *    — which means crawlers fetch a sign-in page instead of the share
     *    image, and browsers get no favicon.
     *  - anything with an image extension
     */
    '/((?!_next/static|_next/image|favicon\.ico|opengraph-image|twitter-image|icon|apple-icon|sitemap\.xml|robots\.txt|manifest\.webmanifest|.*\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
}
