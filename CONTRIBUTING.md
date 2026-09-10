# Contributing to UpSplit

Thanks for wanting to help. This document is the full version of the checklist
in the [README](README.md).

Everything here applies equally to a one-line typo fix and a large feature. The
only difference is how much of it you'll actually need.

## Before you start

**Open an issue first if the change is non-trivial.** A quick conversation
before you write code saves you from building something that gets rejected on
approach rather than on quality. Bug fixes and typos don't need this.

**Claim the issue.** Comment on it so two people don't do the same work.

## 1. Fork and clone

Click **Fork** at the top right of
[the repo](https://github.com/uzairtheahmad/upsplit). That gives you your own
copy at `github.com/YOUR-USERNAME/upsplit`.

Then clone *your fork*, not the original:

```bash
git clone https://github.com/YOUR-USERNAME/upsplit.git
cd upsplit
```

Add the original repo as a second remote called `upstream`, so you can pull in
other people's changes later:

```bash
git remote add upstream https://github.com/uzairtheahmad/upsplit.git
```

You now have two remotes: `origin` is your fork (you can push to it) and
`upstream` is the main repo (you can only pull from it).

## 2. Set the project up

Follow [Quick start](README.md#quick-start) in the README. You need your own
free Supabase project. There is no shared development database, and you should
not ask for credentials to one.

Confirm it works before you change anything:

```bash
npm install
npm test
npm run dev
```

## 3. Make your change

Start from an up-to-date `main` and branch off it:

```bash
git checkout main
git pull upstream main
git checkout -b fix/settlement-rounding
```

Name the branch after what it does: `fix/…`, `feat/…`, `docs/…`, `chore/…`.

### What we look for

- **Match the code around you.** Naming, comment density, file structure. The
  codebase is consistent on purpose.
- **Comments explain *why*, not *what*.** The code already says what it does.
  If you worked around something subtle, say so, because the next person will
  hit it too.
- **No accounting logic in JSX.** Calculations live in `src/lib`, data access
  lives in `src/services`, components compose.
- **Never store a balance.** Balances are derived from expenses and
  settlements, always. This is the invariant the whole design protects.
- **Money is integer minor units.** Never a float. See
  [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md#money).
- **Every table has RLS.** If you add one, add its policies in the same PR.
- **Keep it accessible.** Financial meaning is never carried by colour alone,
  interactive elements are real buttons and links, and everything works from a
  keyboard.

### Tests

Add tests for anything that calculates. The suite lives beside the code it
tests, as `*.test.ts`.

```bash
npm run test:watch
```

If you change `allocate()` in `src/lib/money`, you must also change
`allocate_amount()` in `docs/schema.sql` to match, and vice versa. They are the
same algorithm in two languages, and the app is only correct while they agree.

### Database changes

Edit [`docs/schema.sql`](docs/schema.sql) directly. It is the single source of
truth, not a record of past migrations.

If your change needs to be applied to a database that already has data, also
add a numbered patch in `docs/patches/` that can run safely against a live
project, following the style of the existing ones.

## 4. Commit

Write commit messages in the imperative mood, saying what the commit does:

```
fix: settlement rounding lost a paisa on odd totals
feat: export a group's expenses as CSV
docs: explain the two-remote fork setup
```

Prefixes we use: `feat`, `fix`, `docs`, `refactor`, `test`, `chore`.

## 5. Check it before you push

All three must pass. CI runs them on your PR anyway, so you may as well find
out now:

```bash
npm test
npm run typecheck
npm run build
```

> Stop the dev server before running `npm run build`. They share the `.next`
> directory and will corrupt each other.

## 6. Open the pull request

```bash
git push origin fix/settlement-rounding
```

GitHub will show a **Compare & pull request** button. Open the PR against
`uzairtheahmad/upsplit`'s `main` branch.

The PR template will ask you to fill in a few things. Please actually fill them
in.

### The recording is required

**Every PR that changes behaviour must include a screen recording.**
[Loom](https://www.loom.com) is free and easy, but any link or an uploaded MP4
or GIF works just as well.

Keep it short, under two minutes. Show the thing working. If you fixed a bug,
show the broken behaviour first, then the fix.

This isn't bureaucracy. Reviewing a diff tells us whether the code is
reasonable; watching the feature tells us whether it actually works and whether
it feels right. That second part is very hard to get from reading a patch.

Documentation-only PRs don't need a recording.

### What happens next

We'll review it and probably leave comments. Comments are about the code, never
about you. Push more commits to the same branch and the PR updates itself.

If the PR sits for a week without a response, feel free to bump it with a
comment.

## Reporting bugs

Open an [issue](https://github.com/uzairtheahmad/upsplit/issues) using the bug
template. The single most useful thing you can include is the exact steps to
reproduce it, along with the amounts and the number of people involved if it is
a calculation bug.

**Do not report security vulnerabilities as public issues.** See
[SECURITY.md](SECURITY.md).

## A note on scope

Some decisions in this project are deliberately closed, and
[docs/FEATURES.md](docs/FEATURES.md) records which. The clearest example: splits
are `equal` and `exact` only. Percentage and share-based splitting were
considered and removed on purpose, because they reduce to exact amounts anyway
and every extra mode is another way for a total to fail to add up.

If you want to reopen one of those, that's a conversation worth having in an
issue. It just isn't worth writing the code before having it.
