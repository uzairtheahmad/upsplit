# UpSplit — feature specification

What UpSplit does, and which design decisions are deliberately closed. The
schema in [`schema.sql`](schema.sql) is built and live; anything marked "to
build" below is client work only.

Status legend: **✅ working** · **🔨 to build** · **🚫 excluded**

---

## 1. Locked decisions

These were settled deliberately and are expensive to revisit, because each one
changes columns that hold data rather than adding new tables.

| Decision | Choice | Why it was chosen |
|---|---|---|
| **Categories** | Fixed Postgres enum, 11 values | Simplest and fastest. Adding one later is a migration; custom per-group categories are out of scope. |
| **Currency** | One per group, fixed at creation | Every amount is an integer in that currency's minor units with no exchange rate stored. Allowing a change would silently reinterpret every past expense. A trip abroad is a second group. |
| **Split methods** | `equal` and `exact` only | Percentage and by-shares removed. Both remaining methods reduce to one code path: equal weights everyone at 1, exact uses the stated amounts as weights. |
| **Account deletion** | Anonymise, keep history | The expenses a person created are still referenced by groups that need them. Deleting the row would change other people's balances. |
| **Invite links** | Reusable, revocable, optional expiry | One live link per group. Rotating replaces it, so an old token stops working rather than lingering. |
| **Email** | None sent | Outgoing mail needs a verified sending domain. Rather than queue messages nobody receives, the path is removed: an invitation is handed to the inviter as a link to share. |
| **Invitation tokens** | 32 random bytes, 14-day expiry | Holding the token is the authorisation, so it must be unguessable and must not live forever. Separate from the reusable per-group invite link, which is for sharing rather than for one address. |

---

## 2. The accounting model

The one rule the whole system rests on:

```
net = amount paid − amount owed
```

For any single expense the nets of everyone involved sum to **exactly zero**.
The database enforces this with a deferred constraint at commit, so an
unbalanced committed state is impossible.

- Money is `bigint` **minor units** (paisa) everywhere. No floats, ever.
- Balances are **derived**, never stored by a client. No API method accepts a
  balance.
- Rounding uses largest-remainder allocation, identical on client and server,
  so the preview a user saw is exactly what gets stored.
- **Settlements are not spending.** Nothing in analytics ever takes a
  settlement as input.

### Three payer cases, no special-casing

| Case | In payments? | In participants? | net |
|---|---|---|---|
| Participant who didn't pay | no | yes | `−share` |
| Participant who did pay | yes | yes | `paid − share` |
| Payer who isn't a participant | yes | no | `+paid` |

The third case is the one most tools get wrong. A payer never has to appear in
the split.

---

## 3. Working today

| Area | Detail |
|---|---|
| ✅ Auth | Sign up, log in, password reset, change password. Email confirmation on. |
| ✅ Route protection | Middleware, using `getUser()` (not `getSession()`, which trusts a forgeable cookie). |
| ✅ Groups | Create, rename, icon, colour, archive, restore, delete. |
| ✅ Roles | `owner` / `admin` / `member`. Exactly one owner per group. **Any member can invite**; removing people, changing roles and the shareable link stay owner/admin. The RLS insert policy lets a plain member add someone only at role `member`, so nobody can mint an owner. |
| ✅ Members | Add, change role, remove. Removal refuses if the member's net is non-zero. |
| ✅ Email invitations | Invite by **email only**, no name is asked for; the name comes from the account. Someone with an account joins immediately. Someone without produces a 14-day token, and the dialog hands the inviter a `/invite/[token]` link to send: a public page naming the group and who invited them. Signing up with the invited address claims the invitation automatically; anyone else can accept the token explicitly. |
| ✅ Expenses | Equal and exact splits, multiple payers, payer-who-isn't-a-participant, notes, category, date. |
| ✅ Expense delete | The **creator or a group admin** may delete. Soft delete — history is never destroyed. |
| ✅ Settlements | Record a payment between two people; debt simplification suggests at most `n − 1` transfers. |
| ✅ Balances | Net position per member, decomposed into paid / owed / settled; pairwise "you owe Ali X" attributing each share across payers proportionally. |
| ✅ Activity feed | Per group, newest first. |
| ✅ In-app notifications | Written by the write RPCs; unread badge. |
| ✅ Analytics | Spending by category and by month. Settlements excluded. |

---

## 4. New rules from this round

| # | Rule | Status |
|---|---|---|
| **R1** | An expense must involve **at least 2 distinct people**, counted across **payers ∪ participants** — so paying for someone else qualifies even though the split names one. | ✅ built — enforced in `create_expense`, `update_expense`, client validation, and covered by tests |
| **R2** | A group with only **one member** cannot have expenses added at all. | ✅ built — `create_expense` refuses, and the Add-expense action opens the invite dialog instead |
| **R3** | The **author of an expense can delete it**. | ✅ already works — `delete_expense()` permits the creator or an admin, and the UI exposes it. No change needed. |

Both are enforced in the database *and* the client, because the client's check
is a courtesy to the user and the database's is the actual rule.

---

## 5. Built

| Feature | How it works |
|---|---|
| ✅ **Comments on expenses** | A thread on the expense page. Posting goes through `add_expense_comment()` so payers, participants and existing commenters are notified in the same transaction — not the whole group. Fetched per expense rather than with the workspace. |
| ✅ **Shareable invite links** | One live link per group, in group → members. Create, copy, rotate, revoke. Rotating replaces the row, so the old token dies immediately. `/join/[token]` accepts it; middleware bounces anyone without a session to login and returns them to the link. |
| ✅ **Transfer group ownership** | "Make owner" in the member menu, owner-only. One statement, because the single-owner index forbids two owners existing even momentarily — the previous owner becomes an admin. |
| ✅ **Avatar uploads** | Settings → Profile. Writes to `avatars/<user-id>/…`; the storage policy only permits writes inside a folder named after your own id, so the path *is* the check. 2 MB cap, images only. |
| ✅ **Account deletion** | Anonymises: memberships dropped, name and photo scrubbed, expenses and settlements left intact so nobody else's balances move. Refuses while any balance is outstanding or a group you own still has other people in it. Signs you out afterwards. |
| ✅ **One-click demo** | The landing page signs a visitor in anonymously and calls `start_demo()`, which builds them their **own** group seeded with the souvenirs example, an exact split and a two-payer expense. Per-visitor, so nobody can spoil it for anyone else and there is nothing to reset. A dismissible banner offers a real account. Requires Anonymous Sign-Ins enabled in Supabase. |
| ⛔ **Outgoing email** | Removed. Nothing is sent, and `email_outbox` is dropped. Invitations are shared as links, notifications are in-app only. |
| ✅ **Google sign-in** | On both the login and signup forms, sharing one `/auth/callback` with the email links. `handle_new_user()` reads Google's `name` and `picture` keys as well as the form's `full_name` and `avatar_url`. |
| ✅ **Terms and Privacy** | Real pages at `/terms` and `/privacy`, public so the signup checkbox links somewhere. Written to describe what the app actually does. |
| ✅ **Blocked-action dialogs** | A refusal with a reason (removing someone who still owes money, deleting an account with a balance) gets a dialog, not a toast that fades while it is being read. Refusals raised from inside a confirmation dialog appear inline in it instead of stacking a second dialog. |

## 6. Excluded

Not being built. Each is additive, so any of them can be added later without a
data migration.

| | Why |
|---|---|
| 🚫 Receipt attachments | Not wanted for now. |
| 🚫 Recurring expenses | Not wanted for now. |
| 🚫 Realtime updates | Not wanted for now. Refresh-on-write is the model. |
| 🚫 Mixed currencies / FX | Deliberately excluded — see §1. |
| 🚫 Custom categories | Deliberately excluded — see §1. |

---

## 7. Questions — resolved

1. **R1 — who counts toward "2 people"?** → **Payers ∪ participants.** Keeps
   the payer-who-isn't-a-participant case working.
2. **R2 — what a one-member group shows** → The Add-expense action opens the
   invite dialog with an explanation, rather than a form that cannot submit.
3. **Email provider** → **closed: none.** Sending needs a verified domain, so
   the whole path was removed rather than left queuing messages nobody
   receives. Invitations are shared as links instead.
4. **Terms and Privacy** → **closed: written.** Real pages, rather than a
   signup checkbox pointing at nothing.

**The schema is closed.** Everything still outstanding is client work that does
not touch the database.

---

## 8. Still to decide

Add anything else here before the schema is finalised.
