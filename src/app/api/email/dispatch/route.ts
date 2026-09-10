import { NextResponse, type NextRequest } from 'next/server'

import { dispatchOutbox } from '@/lib/email/dispatch'
import { hasAdminCredentials } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'

/**
 * Sends whatever is waiting in the email outbox.
 *
 * Two callers, and both are allowed:
 *
 *   - The app, right after an invite, so the mail arrives in seconds rather
 *     than whenever a schedule next fires. Any signed-in user may trigger it.
 *     The run is idempotent and returns only counts, never message content, so
 *     there is nothing to gain by calling it.
 *
 *   - A scheduler, carrying CRON_SECRET, to retry anything that failed and
 *     catch mail queued by something other than an invite. Vercel Cron sends
 *     that secret as a bearer token automatically.
 */

// The outbox lives in Postgres and changes on every write, so a cached
// response here would be actively wrong.
export const dynamic = 'force-dynamic'

async function isAuthorised(request: NextRequest): Promise<boolean> {
  const secret = process.env.CRON_SECRET?.trim()

  if (secret && request.headers.get('authorization') === `Bearer ${secret}`) {
    return true
  }

  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()
    return Boolean(user)
  } catch {
    return false
  }
}

export async function POST(request: NextRequest) {
  if (!(await isAuthorised(request))) {
    return NextResponse.json({ error: 'Not authorised' }, { status: 401 })
  }

  // Say so plainly rather than throwing a 500. A deployment without the key
  // is a configuration state, not a bug, and the queue is unharmed.
  if (!hasAdminCredentials()) {
    return NextResponse.json(
      {
        error:
          'SUPABASE_SERVICE_ROLE_KEY is not set, so the outbox cannot be read. ' +
          'Mail stays queued until it is.',
      },
      { status: 503 },
    )
  }

  try {
    const summary = await dispatchOutbox()

    if (!summary.configured) {
      return NextResponse.json(
        { ...summary, error: 'RESEND_API_KEY is not set. Mail stays queued until it is.' },
        { status: 503 },
      )
    }

    return NextResponse.json(summary)
  } catch (cause) {
    console.error('[UpSplit] email dispatch failed', cause)
    return NextResponse.json(
      { error: cause instanceof Error ? cause.message : 'Dispatch failed' },
      { status: 500 },
    )
  }
}

// Vercel Cron issues GET requests, so it needs its own entry point.
export async function GET(request: NextRequest) {
  return POST(request)
}
