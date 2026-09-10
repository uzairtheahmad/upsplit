<div align="center">

# UpSplit

**Track what everyone paid, see exactly who owes whom, and settle up in the
fewest possible payments.**

[Live app](https://upsplit.vercel.app) ·
[Contributing](CONTRIBUTING.md) ·
[Architecture](docs/ARCHITECTURE.md) ·
[Features](docs/FEATURES.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![PRs welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

</div>

## Why this exists

At [UPTEK](https://uptek.com) we used to settle money between colleagues the
hard way: scattered messages, half-remembered amounts, and somebody eventually
doing the maths from memory.

Then one of our colleagues, the GOAT, built an end-to-end Google Sheet where we
recorded every expense and every settlement. It worked. It genuinely solved the
problem, and we ran on it for a long time.

But a spreadsheet has limits. It doesn't follow you to your phone, it has no
concept of who is allowed to see what, it can't tell you the shortest way to
clear four people's debts, and one careless edit can quietly break a formula
that nobody notices for a month.

UpSplit is that sheet, rebuilt as a real application, with those limitations
fixed.

## What it does

- **Groups** for trips, flats, dinners, or anything else, each in its own
  currency.
- **Equal and exact splits**, with support for more than one payer on a single
  expense.
- **A payer who isn't in the split.** If you buy souvenirs for three friends
  and nothing for yourself, you are owed the whole amount. Most tools get this
  wrong.
- **Balances derived, never stored.** They are recomputed from the underlying
  expenses every time, so they cannot silently drift out of sync.
- **Debt simplification.** Four people with tangled debts settle in three
  transfers, not six.
- **Exact money.** Integer minor units end to end, so rounding never loses or
  invents a paisa. Splitting `Rs 100` three ways gives `33.34 / 33.33 / 33.33`,
  and the parts always add back to the total.
- **Invitations.** Invite by email address. Someone who already has an account
  joins immediately; for anyone else you get a link to send them, which lands
  on a page naming the group and who invited them, and joins them on signup.
- **Sign in with Google**, or with an email and password.

Try it without signing up: the **Try the demo** button on the landing page
gives you your own seeded group.

## Tech

Next.js 15 (App Router) and React 19 on the front. Supabase (Postgres, Auth,
Storage) on the back. TypeScript throughout, Tailwind v4 and Radix for the UI,
Zustand as a client cache, Vitest for tests.

**Supabase is the only database.** There is no mock layer and no local store of
record.

## Quick start

You need [Node.js 20 or newer](https://nodejs.org) and a free
[Supabase](https://supabase.com) project.

```bash
git clone https://github.com/uzairtheahmad/upsplit.git
cd upsplit
npm install
cp .env.local.example .env.local
```

Fill in `.env.local` with two values from your Supabase project, under
**Project Settings → API**:

| Variable | Where to find it |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project API keys → `anon` / public |

Then set up the database. Open the **SQL Editor** in your Supabase dashboard,
paste the entire contents of [`docs/schema.sql`](docs/schema.sql), and run it.

> [!WARNING]
> `schema.sql` drops and rebuilds the `public` schema. It is safe to re-run on
> a scratch project and **destructive on one with real data**.

It ends with a verification query returning four rows. Every `failures` value
must be `0`. If any is non-zero the books do not balance, so stop and open an
issue rather than building on that database.

### Patching a database that already has data

`schema.sql` is for a fresh project. If yours already holds real data, run the
files in [`docs/patches/`](docs/patches) **in numeric order** instead. Each is
safe on a live database: they add and replace, they never drop.

Everything in `docs/patches/` is already folded into `schema.sql`, so a fresh
run needs none of them.

Two settings in the Supabase dashboard finish the setup:

- **Authentication → Sign In / Providers → Anonymous Sign-Ins**: enable it, or
  the demo button fails.
- **Authentication → Sign In / Providers → Google**: enable it and paste a
  client ID and secret from the Google Cloud console, or the Google buttons
  fail. Email and password sign-in works without this.
- **Authentication → URL Configuration**: set the Site URL to
  `http://localhost:3000` for local development.

Now run it:

```bash
npm run dev        # http://localhost:3000
```

### Everyday commands

```bash
npm run dev        # dev server
npm run lint       # eslint
npm run lint:fix   # eslint, fixing what it can
npm test           # the accounting test suite (63 tests)
npm run typecheck  # tsc --noEmit
npm run build      # production build
```

> [!NOTE]
> Don't run `npm run build` while `npm run dev` is running. They share `.next`
> and will corrupt each other's output. Stop the dev server first.

## Contributing

This is an open-source project and contributions are welcome, whether that is a
bug fix, a feature, or a typo in this file.

**Read [CONTRIBUTING.md](CONTRIBUTING.md) before you start.** The short version:

1. **Fork** the repo and clone your fork.
2. **Branch** off `main`: `git checkout -b fix/duplicate-settlement`.
3. **Check it**: `npm run lint && npm test && npm run typecheck && npm run build`.
4. **Open a pull request** against `main`.
5. **Include a Loom** (or any screen recording) showing your change working.
   This is required. A recording tells us in thirty seconds what a paragraph
   can't.

New to the codebase? Look for issues labelled
[`good first issue`](https://github.com/uzairtheahmad/upsplit/labels/good%20first%20issue).

If you are touching money, balances or the schema, read
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) first. Those parts have invariants
that are easy to break by accident.

## Documentation

| Document | What's in it |
| --- | --- |
| [CONTRIBUTING.md](CONTRIBUTING.md) | Full contributor workflow |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | The accounting model, code layout, data flow, security |
| [docs/FEATURES.md](docs/FEATURES.md) | What the product does and which decisions are closed |
| [docs/schema.sql](docs/schema.sql) | The database, single source of truth |
| [SECURITY.md](SECURITY.md) | Reporting a vulnerability |
| [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) | How we expect people to treat each other |

## Not built yet

Tracked in [docs/FEATURES.md](docs/FEATURES.md).

- **Outgoing email.** UpSplit sends no mail of its own. Invitations are handed
  to the inviter as a link to share, and notifications are in-app only. Adding
  email needs a verified sending domain, and is a good contribution if you want
  one with real scope.
- **Push notifications and digests.** Neither exists. There are deliberately no
  settings toggles for them, rather than switches that control nothing.

## License

[MIT](LICENSE).
