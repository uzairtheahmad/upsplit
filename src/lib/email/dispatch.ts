import 'server-only'

import { createAdminClient } from '@/lib/supabase/admin'

import { deliver, isEmailConfigured } from './provider'
import { render, type OutboxMessage } from './templates'

/**
 * Drains `email_outbox`.
 *
 * The outbox exists because a write RPC cannot hold its transaction open
 * across an HTTP call. The RPC queues, this sends, and a send that fails stays
 * queued with the reason recorded rather than disappearing.
 *
 * It needs the service role key: `email_outbox` has RLS enabled and no policy
 * at all, so it is invisible to `anon` and `authenticated` by design. Queued
 * mail is other people's private notification text, and nothing signed in
 * should be able to read it.
 */

/** Give up after this many attempts, so one bad address is not retried forever. */
const MAX_ATTEMPTS = 5

/** Per-run cap, to stay inside a serverless function's time budget. */
const BATCH_SIZE = 25

interface OutboxRow extends OutboxMessage {
  id: number
  attempts: number
}

export interface DispatchSummary {
  sent: number
  failed: number
  skipped: number
  configured: boolean
}

export async function dispatchOutbox(limit = BATCH_SIZE): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    sent: 0,
    failed: 0,
    skipped: 0,
    configured: isEmailConfigured(),
  }

  // Without a provider key there is nothing to do. Returning rather than
  // failing keeps the queue intact: the mail goes out on the next run after a
  // key is set, instead of burning an attempt against every row now.
  if (!summary.configured) return summary

  const supabase = createAdminClient()

  const { data, error } = await supabase
    .from('email_outbox')
    .select('id, to_email, subject, body, template, payload, attempts')
    .is('sent_at', null)
    .lt('attempts', MAX_ATTEMPTS)
    .order('id', { ascending: true })
    .limit(limit)

  if (error) throw new Error(`Could not read the email outbox: ${error.message}`)

  const rows = (data ?? []) as OutboxRow[]

  for (const row of rows) {
    // Count the attempt before trying, not after. If this function is killed
    // mid-send (a serverless timeout), the row must not look untouched, or a
    // message that is slow to send gets delivered on every subsequent run.
    await supabase
      .from('email_outbox')
      .update({ attempts: row.attempts + 1 })
      .eq('id', row.id)

    const result = await deliver(render(row))

    if (result.ok) {
      await supabase
        .from('email_outbox')
        .update({ sent_at: new Date().toISOString(), last_error: null })
        .eq('id', row.id)
      summary.sent += 1
      continue
    }

    await supabase
      .from('email_outbox')
      .update({ last_error: result.error })
      .eq('id', row.id)

    if (result.retryable) {
      summary.failed += 1
    } else {
      // Not worth retrying, so burn the remaining attempts and leave the
      // reason on the row. Nothing is deleted: an address that bounced is
      // something you want to be able to look up later.
      await supabase
        .from('email_outbox')
        .update({ attempts: MAX_ATTEMPTS })
        .eq('id', row.id)
      summary.skipped += 1
    }
  }

  return summary
}
