import 'server-only'

/**
 * The one place that talks to an email provider.
 *
 * Resend, over plain fetch rather than their SDK: the API is a single POST, so
 * a dependency would buy nothing and the CSP-free server runtime makes it
 * trivial. Swapping providers means rewriting `deliver()` and nothing else.
 *
 * Everything here is server-only. `RESEND_API_KEY` has no NEXT_PUBLIC_ prefix,
 * so importing this from a client component fails the build instead of leaking
 * the key.
 */

export interface OutgoingEmail {
  to: string
  subject: string
  html: string
  text: string
}

export type DeliveryResult =
  | { ok: true; id: string }
  | { ok: false; error: string; retryable: boolean }

/** Whether sending is configured at all. Never throws. */
export function isEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY?.trim())
}

/**
 * The From address.
 *
 * Resend's shared `onboarding@resend.dev` sender works with no domain set up,
 * but it can only send to the address that owns the Resend account. That is
 * fine for a first smoke test and useless in production, so real deployments
 * set EMAIL_FROM to an address on a domain verified with the provider.
 */
function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || 'UpSplit <onboarding@resend.dev>'
}

export async function deliver(email: OutgoingEmail): Promise<DeliveryResult> {
  const key = process.env.RESEND_API_KEY?.trim()

  if (!key) {
    return {
      ok: false,
      error: 'RESEND_API_KEY is not set, so nothing can be sent.',
      // Retryable: the message stays queued and goes out once a key exists.
      retryable: true,
    }
  }

  let response: Response

  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromAddress(),
        to: [email.to],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    })
  } catch (cause) {
    // Network-level failure. Worth another attempt later.
    return {
      ok: false,
      error: cause instanceof Error ? cause.message : 'Network error',
      retryable: true,
    }
  }

  if (response.ok) {
    const body = (await response.json().catch(() => ({}))) as { id?: string }
    return { ok: true, id: body.id ?? 'unknown' }
  }

  const detail = await response.text().catch(() => '')

  return {
    ok: false,
    error: `${response.status} ${response.statusText} ${detail}`.trim().slice(0, 500),
    // 4xx means the request itself is wrong (bad key, unverified domain,
    // malformed address). Retrying sends the same broken request again, so
    // only 429 and 5xx are worth another attempt.
    retryable: response.status === 429 || response.status >= 500,
  }
}
