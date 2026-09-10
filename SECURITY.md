# Security Policy

## Reporting a vulnerability

**Please don't open a public issue for a security problem.**

Use GitHub's private reporting instead: go to the
[Security tab](https://github.com/uzairtheahmad/upsplit/security/advisories/new)
and choose **Report a vulnerability**. Only the maintainers can see it, and you
can be credited when it's fixed.

Useful things to include: what an attacker can do, the steps to reproduce it,
and which files are involved if you know.

We'll acknowledge your report within a few days and keep you updated while it's
being fixed.

## Scope

UpSplit stores what people spend and owe each other, so the things we care most
about are:

- Reading or modifying data belonging to a group you are not a member of. Row
  Level Security is what prevents this, so an RLS gap is the most serious class
  of bug in this project.
- Writing to `ledger_entries` directly. Clients must never be able to submit a
  balance.
- Session or authentication bypass, including anything that lets `getUser()` be
  satisfied by a forged cookie.
- Escalating your own role within a group.

## Not vulnerabilities

- **The anon key being visible in the browser.** It is designed to be public.
  Every table has RLS enabled, and the key grants nothing beyond what your
  session is allowed to see. Verified: an anonymous caller reads no rows from
  any table and every write is rejected.
- Anything that requires `SUPABASE_SERVICE_ROLE_KEY`. That key bypasses every
  policy by design. It is server-only, and it is never sent to the browser.
