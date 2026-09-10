import 'server-only'

import { siteUrl } from '@/lib/site'

import type { OutgoingEmail } from './provider'

/**
 * Email templates.
 *
 * Deliberately plain HTML with inline styles and a table-free single column.
 * Email clients are twenty years behind browsers: no flexbox in Outlook, no
 * external stylesheets, no custom properties, and Gmail strips <style> blocks
 * in some contexts. Anything clever here degrades into a mess somewhere.
 *
 * Every message carries a text/plain alternative. Some people read mail that
 * way, some filters score HTML-only mail as spam, and it costs four lines.
 */

/** Escapes text interpolated into HTML. Group names are user input. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

interface ShellOptions {
  heading: string
  body: string
  ctaLabel: string
  ctaHref: string
  footnote?: string
}

function shell({ heading, body, ctaLabel, ctaHref, footnote }: ShellOptions): string {
  return `<!doctype html>
<html lang="en">
<body style="margin:0;padding:24px;background:#f6f7f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1c1c1f;">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border:1px solid #e6e7ea;border-radius:14px;padding:32px;">
    <p style="margin:0 0 24px;font-size:18px;font-weight:600;letter-spacing:-0.01em;">UpSplit</p>
    <h1 style="margin:0 0 12px;font-size:20px;line-height:1.35;font-weight:600;letter-spacing:-0.01em;">${heading}</h1>
    <p style="margin:0 0 24px;font-size:15px;line-height:1.6;color:#55565c;">${body}</p>
    <a href="${ctaHref}" style="display:inline-block;background:#4f39f6;color:#ffffff;text-decoration:none;font-size:15px;font-weight:600;padding:12px 22px;border-radius:9px;">${ctaLabel}</a>
    ${
      footnote
        ? `<p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#8a8b92;">${footnote}</p>`
        : ''
    }
    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #eeeff1;font-size:12px;line-height:1.6;color:#8a8b92;">
      If the button does not work, copy this link into your browser:<br>
      <span style="color:#55565c;word-break:break-all;">${ctaHref}</span>
    </p>
  </div>
  <p style="max-width:520px;margin:16px auto 0;font-size:12px;line-height:1.6;color:#8a8b92;text-align:center;">
    UpSplit, shared expenses that actually settle.
  </p>
</body>
</html>`
}

/** An outbox row, as far as the templates care. */
export interface OutboxMessage {
  to_email: string
  subject: string
  body: string
  template: string | null
  payload: Record<string, unknown> | null
}

/**
 * Turns an outbox row into a sendable message.
 *
 * The row already carries a subject and body written by the database, so an
 * unrecognised template still produces a correct, if plain, email. Templates
 * add the right call to action, they are not required for the message to make
 * sense.
 */
export function render(message: OutboxMessage): OutgoingEmail {
  const payload = message.payload ?? {}
  const origin = siteUrl()

  const href =
    typeof payload.href === 'string' ? `${origin}${payload.href}` : `${origin}/dashboard`

  const groupName = typeof payload.group_name === 'string' ? payload.group_name : null

  if (message.template === 'invitation') {
    const inviter =
      typeof payload.inviter_name === 'string' ? payload.inviter_name : 'Someone'

    return {
      to: message.to_email,
      subject: message.subject,
      text:
        `${message.body}\n\n${href}\n\n` +
        'This invitation expires in 14 days. If you were not expecting it, ignore this email.',
      html: shell({
        heading: groupName
          ? `${escapeHtml(inviter)} invited you to ${escapeHtml(groupName)}`
          : escapeHtml(message.subject),
        body: escapeHtml(message.body),
        ctaLabel: 'Create your account',
        ctaHref: href,
        footnote:
          'This invitation expires in 14 days. If you were not expecting it, you can ignore this email.',
      }),
    }
  }

  return {
    to: message.to_email,
    subject: message.subject,
    text: `${message.body}\n\n${href}`,
    html: shell({
      heading: escapeHtml(message.subject),
      body: escapeHtml(message.body),
      ctaLabel: 'Open UpSplit',
      ctaHref: href,
      footnote: 'You can turn these emails off in Settings, under Notifications.',
    }),
  }
}
