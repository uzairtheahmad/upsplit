# Phase 2 — Supabase database plan

This is the schema to build **before** any integration code is written. Nothing
in it exists yet; `migration.sql` in this folder is the script to paste into the
Supabase SQL Editor, and `seed.sql` fills a development project with realistic
data.

Read this document first — it explains *why* the schema is shaped this way, and
in particular how the ledger keeps the books balanced.

---

## 1. The tables

| # | Table | What it holds | Rows per… |
|---|---|---|---|
| 1 | `currencies` | Lookup: code, symbol, decimal places | one per supported currency |
| 2 | `profiles` | Public user data, 1:1 with `auth.users` | one per user |
| 3 | `groups` | An expense-sharing group | one per group |
| 4 | `group_members` | Who is in a group, and their role | user × group |
| 5 | `expenses` | Expense metadata | one per expense |
| 6 | `expense_payments` | Who actually paid, and how much | one per payer per expense |
| 7 | `expense_participants` | Who is charged, and the raw split input | one per participant per expense |
| 8 | `settlements` | A payment from one member to another | one per settlement |
| 9 | `ledger_entries` | Derived signed financial effects | one per affected person per source |
| 10 | `activity_logs` | Group activity feed | one per event |
| 11 | `notifications` | Per-user notifications | one per user per event |

### Two decisions worth defending

**Settlements are their own table, not an `expense_type` on `expenses`.** The
spec offered both. A settlement has a direction (`from`/`to`), no split, no
category and no participants — folding it into `expenses` would mean half the
columns are always null and every analytics query would need
`WHERE expense_type = 'expense'`, which is exactly the filter someone eventually
forgets. Keeping them apart makes "settlements are not spending" structural
rather than a rule people have to remember.

**`ledger_entries` is a real table, not a view.** It could be derived on every
read. Storing it buys three things: a single `SUM` over one indexed table for
balances instead of recomputing splits, a natural place to hang the zero-sum
constraint the database enforces at commit, and an audit trail of what the books
said at the time. It is maintained by triggers and is never client-writable, so
it cannot drift from the expenses that produced it.

---

## 2. Relationships

```
                     auth.users
                         │ 1:1 (trigger)
                         ▼
                     profiles
                    ╱    │    ╲
       created_by  ╱     │     ╲  user_id
                  ▼      │      ▼
              groups     │   group_members
                  │  ◄───┴────────┘  (group_id)
                  │
     ┌────────────┼────────────┬──────────────┬───────────────┐
     ▼            ▼            ▼              ▼               ▼
  expenses   settlements  activity_logs  notifications  ledger_entries
     │            │                                          ▲
     ├── expense_payments ──────────────────────────┐        │
     │      (who paid)                              ├────────┤
     └── expense_participants ──────────────────────┘   derived by
            (who owes)                                   triggers
```

**Dependency order for creation** (`migration.sql` already follows it):

```
1. currencies
2. profiles            → auth.users
3. groups              → profiles, currencies
4. group_members       → groups, profiles
5. expenses            → groups, profiles, currencies
6. expense_payments    → expenses, profiles
7. expense_participants→ expenses, profiles
8. settlements         → groups, profiles, currencies
9. ledger_entries      → groups, profiles
10. activity_logs      → groups, profiles
11. notifications      → profiles, groups
```

---

## 3. Schema, table by table

Money columns are **`bigint`, in minor units** (paisa, cents). There is no
`numeric`, no `money`, and no float anywhere in the schema.

### Table: `currencies`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `code` | `text` **PK** | Yes | — | ISO 4217, e.g. `PKR`. Checked against `^[A-Z]{3}$` |
| `symbol` | `text` | Yes | — | Display symbol, e.g. `Rs` |
| `decimals` | `smallint` | Yes | `2` | Minor units per major unit, as a power of ten |
| `name` | `text` | Yes | — | Human name |

A table rather than an enum: adding a currency stays a data change.

### Table: `profiles`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | — | FK → `auth.users(id)` `ON DELETE CASCADE` |
| `full_name` | `text` | Yes | — | 1–120 chars after trimming |
| `email` | `text` | Yes | — | Unique on `lower(email)` |
| `avatar_url` | `text` | No | `null` | Storage URL |
| `default_currency` | `text` | Yes | `'PKR'` | FK → `currencies(code)` |
| `email_notifications` | `boolean` | Yes | `true` | Preference |
| `push_notifications` | `boolean` | Yes | `false` | Preference |
| `weekly_summary` | `boolean` | Yes | `true` | Preference |
| `created_at` | `timestamptz` | Yes | `now()` | |
| `updated_at` | `timestamptz` | Yes | `now()` | Maintained by trigger |

Created automatically by the `on_auth_user_created` trigger — the app never
inserts a profile itself.

### Table: `groups`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | `gen_random_uuid()` | |
| `name` | `text` | Yes | — | 2–60 chars |
| `description` | `text` | No | `null` | ≤ 200 chars |
| `currency` | `text` | Yes | `'PKR'` | FK → `currencies(code)` |
| `icon` | `text` | Yes | `'users'` | Icon key from `GROUP_ICONS` |
| `color` | `text` | Yes | `'violet'` | Accent key from `GROUP_COLORS` |
| `created_by` | `uuid` | Yes | — | FK → `profiles(id)` `ON DELETE RESTRICT` |
| `created_at` | `timestamptz` | Yes | `now()` | |
| `updated_at` | `timestamptz` | Yes | `now()` | Trigger-maintained |
| `archived_at` | `timestamptz` | No | `null` | Non-null = archived |

`created_by` is `RESTRICT`, not `CASCADE`: deleting a user must not silently
take a whole group's financial history with it.

### Table: `group_members`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `group_id` | `uuid` **PK** | Yes | — | FK → `groups(id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` **PK** | Yes | — | FK → `profiles(id)` `ON DELETE CASCADE` |
| `role` | `group_role` | Yes | `'member'` | `owner` \| `admin` \| `member` |
| `joined_at` | `timestamptz` | Yes | `now()` | |

Composite PK `(group_id, user_id)` is the unique-membership constraint — a
person cannot be in a group twice. A partial unique index enforces exactly one
`owner` per group.

### Table: `expenses`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | `gen_random_uuid()` | |
| `group_id` | `uuid` | Yes | — | FK → `groups(id)` `ON DELETE CASCADE` |
| `description` | `text` | Yes | — | 2–120 chars |
| `notes` | `text` | No | `null` | ≤ 500 chars |
| `amount` | `bigint` | Yes | — | Minor units, `CHECK (amount > 0)` |
| `currency` | `text` | Yes | — | FK → `currencies(code)` |
| `category` | `expense_category` | Yes | `'other'` | 11-value enum |
| `expense_date` | `date` | Yes | — | The day it happened |
| `split_method` | `split_method` | Yes | `'equal'` | `equal`/`exact`/`percentage`/`weighted` |
| `created_by` | `uuid` | Yes | — | FK → `profiles(id)` `ON DELETE RESTRICT` |
| `created_at` | `timestamptz` | Yes | `now()` | |
| `updated_at` | `timestamptz` | Yes | `now()` | Trigger-maintained |
| `deleted_at` | `timestamptz` | No | `null` | **Soft delete** |

There is deliberately **no DELETE policy** on this table. Removal goes through
`delete_expense()`, which sets `deleted_at` and rebuilds the ledger, so
financial history is never destroyed.

### Table: `expense_payments`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `expense_id` | `uuid` **PK** | Yes | — | FK → `expenses(id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` **PK** | Yes | — | FK → `profiles(id)` `ON DELETE RESTRICT` |
| `amount` | `bigint` | Yes | — | `CHECK (amount > 0)` |

One row per payer. This is the table that makes multiple payers a data question
instead of a schema migration. `SUM(amount) = expenses.amount` is enforced by
`create_expense()` / `update_expense()`.

### Table: `expense_participants`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `expense_id` | `uuid` **PK** | Yes | — | FK → `expenses(id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` **PK** | Yes | — | FK → `profiles(id)` `ON DELETE RESTRICT` |
| `value` | `bigint` | No | `null` | Meaning depends on `split_method` |

`value` is interpreted by the parent expense's split method:

| `split_method` | `value` means |
|---|---|
| `equal` | ignored (may be null) |
| `exact` | that person's share, in minor units |
| `percentage` | **basis points** — `5000` = 50%, so percentages stay integers |
| `weighted` | a non-negative weight; 2 pays double 1 |

A person appearing here but not in `expense_payments` simply owes their share. A
person in `expense_payments` but **not** here is the payer-who-isn't-a-
participant case: they are owed the full amount. No flag, no sentinel value, no
`"NP"` string — just absence from a table.

### Table: `settlements`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | `gen_random_uuid()` | |
| `group_id` | `uuid` | Yes | — | FK → `groups(id)` `ON DELETE CASCADE` |
| `from_user_id` | `uuid` | Yes | — | The debtor paying |
| `to_user_id` | `uuid` | Yes | — | The creditor receiving |
| `amount` | `bigint` | Yes | — | `CHECK (amount > 0)` |
| `currency` | `text` | Yes | — | FK → `currencies(code)` |
| `settled_on` | `date` | Yes | `current_date` | |
| `note` | `text` | No | `null` | ≤ 200 chars |
| `created_by` | `uuid` | Yes | — | Who recorded it |
| `created_at` | `timestamptz` | Yes | `now()` | |
| `deleted_at` | `timestamptz` | No | `null` | Soft delete |

`CHECK (from_user_id <> to_user_id)`.

### Table: `ledger_entries`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `bigint` **PK** | Yes | identity | |
| `group_id` | `uuid` | Yes | — | FK → `groups(id)` `ON DELETE CASCADE` |
| `user_id` | `uuid` | Yes | — | FK → `profiles(id)` `ON DELETE CASCADE` |
| `source_type` | `ledger_source` | Yes | — | `expense` \| `settlement` |
| `source_id` | `uuid` | Yes | — | The expense or settlement |
| `amount` | `bigint` | Yes | — | Signed. `CHECK (amount <> 0)` |
| `created_at` | `timestamptz` | Yes | `now()` | |

`amount > 0` means **this person is owed money**; `< 0` means they owe it. Zero
effects are not stored. Unique on `(source_type, source_id, user_id)`.

### Table: `activity_logs`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | `gen_random_uuid()` | |
| `group_id` | `uuid` | Yes | — | FK → `groups(id)` `ON DELETE CASCADE` |
| `actor_id` | `uuid` | Yes | — | Who did it |
| `action` | `activity_action` | Yes | — | 10-value enum |
| `subject` | `text` | Yes | — | e.g. the expense description |
| `amount` | `bigint` | No | `null` | |
| `currency` | `text` | No | `null` | FK → `currencies(code)` |
| `href` | `text` | No | `null` | Where clicking it goes |
| `created_at` | `timestamptz` | Yes | `now()` | |

### Table: `notifications`

| Column | Type | Required | Default | Description |
|---|---|---|---|---|
| `id` | `uuid` **PK** | Yes | `gen_random_uuid()` | |
| `user_id` | `uuid` | Yes | — | Recipient, FK → `profiles(id)` |
| `group_id` | `uuid` | No | `null` | FK → `groups(id)` |
| `kind` | `notification_kind` | Yes | — | `expense`/`settlement`/`group`/`reminder` |
| `title` | `text` | Yes | — | |
| `body` | `text` | Yes | — | |
| `href` | `text` | No | `null` | |
| `read_at` | `timestamptz` | No | `null` | Null = unread |
| `created_at` | `timestamptz` | Yes | `now()` | |

---

## 4. Constraints

| Constraint | Where | Why |
|---|---|---|
| `amount > 0` | expenses, payments, settlements | An expense of zero or less is not an expense |
| `amount <> 0` | ledger_entries | Zero effects are noise; don't store them |
| `from_user_id <> to_user_id` | settlements | You cannot pay yourself |
| PK `(group_id, user_id)` | group_members | Unique membership |
| Partial unique on `group_id where role='owner'` | group_members | Exactly one owner |
| PK `(expense_id, user_id)` | payments, participants | Each person listed once per expense |
| Unique `(source_type, source_id, user_id)` | ledger_entries | One net effect per person per document |
| `value >= 0` | expense_participants | No negative shares, percentages or weights |
| Length checks | names, descriptions, notes | Match the client-side Zod limits |
| `code ~ '^[A-Z]{3}$'` | currencies | Well-formed ISO codes |
| **Deferred `ledger_entries_balanced`** | ledger_entries | **Every source document sums to zero at commit** |

The last one is the important one, and it is covered in §8.

The three cross-field rules — payments summing to the expense total,
percentages summing to 10 000 basis points, exact amounts summing to the total —
are enforced inside the write RPCs rather than as table constraints, because
they span rows in three tables and only make sense once all three are written.

---

## 5. Indexes, and why each exists

| Index | Table | Serves |
|---|---|---|
| `profiles_email_key` (unique, `lower(email)`) | profiles | Case-insensitive uniqueness and lookup by email |
| `groups_created_by_idx` | groups | "Groups I created" |
| `group_members_user_idx` | group_members | **The hottest path in the app.** The PK covers `group → users`; this covers `user → groups`, which is what every RLS check and every sidebar render asks |
| `group_members_single_owner_idx` (partial unique) | group_members | Enforces one owner; also a fast owner lookup |
| `expenses_group_date_idx` (partial, `deleted_at IS NULL`) | expenses | The default expense list: one group, newest first, live rows only. Partial so soft-deleted rows don't bloat it |
| `expenses_group_category_idx` (partial) | expenses | Category filter and the analytics breakdown |
| `expenses_search_idx` (GIN, tsvector) | expenses | Full-text search over description + notes |
| `expense_payments_user_idx` | expense_payments | "What has this person paid for?" — drives top spenders |
| `expense_participants_user_idx` | expense_participants | "What is this person charged for?" |
| `settlements_group_date_idx` (partial) | settlements | Settlement history for a group |
| `settlements_parties_idx` (partial) | settlements | The two-person breakdown view |
| `ledger_entries_group_user_idx` | ledger_entries | Balance queries are always `WHERE group_id GROUP BY user_id` |
| `ledger_entries_source_idx` | ledger_entries | Rebuild-by-source, and the zero-sum check |
| `ledger_entries_unique_idx` (unique) | ledger_entries | One entry per person per document |
| `activity_logs_group_time_idx` | activity_logs | The activity feed, newest first |
| `notifications_user_unread_idx` (partial, unread) | notifications | The bell's unread count — the common query, kept small |
| `notifications_user_time_idx` | notifications | The full notification panel |

---

## 6. Functions and RPCs

### Helpers

| Function | Returns | Purpose |
|---|---|---|
| `is_group_member(group_id)` | `boolean` | Membership check used by nearly every policy |
| `group_role_of(group_id)` | `group_role` | The caller's role in a group |
| `can_manage_members(group_id)` | `boolean` | True for `owner` and `admin` |

All three are `SECURITY DEFINER` **on purpose**. A policy on `group_members`
that itself queried `group_members` would recurse infinitely; running the lookup
as the definer, with RLS bypassed, breaks the cycle. They are read-only, take a
group id the caller already knows, and return a boolean or a role — they cannot
be used to enumerate anything.

### Accounting

| Function | Returns | Purpose |
|---|---|---|
| `allocate_amount(total, weights[])` | `bigint[]` | Largest-remainder allocation. The exact server-side twin of `allocate()` in `src/lib/money/money.ts`. Guarantees `SUM(result) = total` |
| `expense_shares(expense_id)` | `(user_id, share)` | What each participant is charged, per split method |
| `rebuild_expense_ledger(expense_id)` | `void` | Recompute `paid − owed` per person; idempotent |
| `rebuild_settlement_ledger(settlement_id)` | `void` | Two entries: `+amount` to the payer, `−amount` to the receiver |

### Reads

| Function | Returns | Purpose |
|---|---|---|
| `group_balances(group_id)` | `(user_id, paid, owed, settled, net)` | Net position per member, decomposed so the UI can *explain* the number |
| `group_pairwise_balances(group_id)` | `(from, to, amount)` | Net obligations between every pair, attributing each share across the payers proportionally |
| `settlement_suggestions(group_id)` | `(from, to, amount)` | Greedy debt simplification; at most `n − 1` transfers |

### Writes (all atomic)

| Function | Purpose |
|---|---|
| `create_expense(...)` | Insert expense + payments + participants + ledger + activity + notifications **in one transaction** |
| `update_expense(...)` | Replace the payment and participant sets wholesale, rebuild the ledger |
| `delete_expense(id)` | Soft delete, rebuild the ledger, log it |
| `record_settlement(...)` | Insert settlement + ledger + activity + notifications |
| `remove_group_member(group_id, user_id)` | Refuses if the member's net balance is non-zero |

Each write RPC **re-validates everything the client checked**. The client's
validation is a courtesy to the user; the database's is the actual rule.
Specifically, `create_expense` verifies that every named payer and participant
is a member of the target group — without that, a caller could attach a debt to
a stranger by passing their user id.

---

## 7. Triggers

| Trigger | On | Does |
|---|---|---|
| `on_auth_user_created` | `auth.users` insert | Creates the matching `profiles` row |
| `on_group_created` | `groups` insert | Makes `created_by` the `owner`, logs the activity |
| `*_touch` | profiles, groups, expenses update | Maintains `updated_at` |
| `expense_payments_sync` | payments insert/update/delete | Rebuilds that expense's ledger |
| `expense_participants_sync` | participants insert/update/delete | Rebuilds that expense's ledger |
| `expenses_sync` | expenses update of `amount`, `split_method`, `deleted_at` | Rebuilds the ledger |
| `settlements_sync` | settlements insert/update | Rebuilds the ledger |
| `ledger_entries_balanced` | ledger_entries, **deferred** | Raises unless every source document sums to zero |

The four `*_sync` triggers are belt-and-braces: the RPCs already rebuild the
ledger explicitly, but the triggers mean the ledger stays correct even for
writes that bypass them — a manual fix in the SQL editor, a future admin tool,
a data import.

---

## 8. How the accounting works in Postgres

```
             create_expense()  ─── one transaction ───┐
                     │                                │
        ┌────────────┼────────────┐                   │
        ▼            ▼            ▼                   │
    expenses   expense_payments  expense_participants │
                (who paid)        (who owes)          │
                     │                                │
                     ▼                                │
            rebuild_expense_ledger()                  │
                     │                                │
       net = SUM(paid) − SUM(share)  per person       │
                     │                                │
                     ▼                                │
              ledger_entries                          │
                     │                                │
        ┌────────────┴────────────┐                   │
        ▼                         ▼                   │
  SUM = 0 per source        SUM per user        ◄─────┘
  (deferred constraint)           │
                                  ▼
                          group_balances()
                                  │
                                  ▼
                      settlement_suggestions()
```

`rebuild_expense_ledger` is a `FULL OUTER JOIN` of payments against shares,
which is what makes all three accounting rules fall out of one query with no
branching:

| Case | In payments? | In shares? | `net` |
|---|---|---|---|
| Participant who didn't pay | no | yes | `0 − share` |
| Participant who paid | yes | yes | `paid − share` |
| Payer who isn't a participant | yes | no | `paid − 0` |

Because shares are produced by `allocate_amount`, `SUM(share) = amount` exactly,
and `SUM(paid) = amount` is enforced by the RPC. Therefore
`SUM(net) = amount − amount = 0` for every expense, always. Settlements are
trivially balanced: `+amount` and `−amount`.

The `ledger_entries_balanced` constraint trigger checks this **at commit**
rather than per statement, so intermediate states inside a transaction (an
expense row inserted before its participants exist) are allowed, while an
unbalanced *committed* state is impossible. If a bug ever produced one, the
transaction aborts rather than quietly corrupting the books.

**Rounding.** `allocate_amount` is a line-for-line port of the client's
`allocate()`: every part takes its floor, then leftover minor units go one at a
time to the largest discarded remainders, ties breaking on index. Rs 100 across
three people is 33.34 / 33.33 / 33.33 — deterministic, and identical on both
sides, so the preview a user saw before saving is exactly what the database
stores.

---

## 9. Row Level Security

RLS is enabled on every table. The shape is always the same: **you can see a row
if you are a member of the group it belongs to; you can change it only if your
role permits.**

| Table | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| `currencies` | any authenticated user | — | — | — |
| `profiles` | yourself, plus anyone you share a group with | via trigger only | yourself only | — |
| `groups` | members | anyone, as `created_by = auth.uid()` | owner | owner |
| `group_members` | members | owner/admin | owner/admin | owner/admin, or yourself (leaving) |
| `expenses` | members | members, as `created_by = auth.uid()` | the creator or an admin | **none — soft delete only** |
| `expense_payments` | members | creator/admin of the parent expense | same | same |
| `expense_participants` | members | creator/admin of the parent expense | same | same |
| `settlements` | members | members | the creator or an admin | **none — soft delete only** |
| `ledger_entries` | members | **none** | **none** | **none** |
| `activity_logs` | members | **none** (server-side only) | — | — |
| `notifications` | yourself only | **none** | yourself (marking read) | — |

Points worth noting:

- **`ledger_entries` has no write policy at all**, and `INSERT/UPDATE/DELETE`
  are additionally `REVOKE`d from `authenticated`. Balances are derived; the
  only things that may write them are the `SECURITY DEFINER` rebuild functions.
  A client cannot submit a balance, which is the single most important
  guarantee in the schema.
- **Changing an id gets you nothing.** Every policy resolves the group from the
  row itself and checks *your* membership of *that* group. Passing another
  group's id just fails the check.
- **`profiles` is not world-readable.** You can see someone's name only if you
  share a group with them, which is the minimum needed to render a balance.
- The one-owner-per-group index means an admin cannot promote themselves past
  the owner, and `remove_group_member` stops anyone deleting a member who still
  has money on the line.

---

## 10. Seed data

`seed.sql` creates five people, two groups (Hunza Weekend Trip, Apartment 4B)
and expenses that exercise every interesting case:

| Expense | Demonstrates |
|---|---|
| Eagle's Nest Hotel — Rs 48,000 | Equal split, single payer who is also a participant |
| Jeep to Khunjerab Pass — Rs 18,000 | Weighted split (1/1/1/2) |
| Souvenirs — Rs 6,000 | **Payer who is not a participant** — Uzair is owed the full amount |
| Lunch at Besham — Rs 5,200 | **Multiple payers** (Rs 3,000 + Rs 2,200) |
| Study desk — Rs 26,000 | Exact split |
| Electricity — Rs 18,750 | Percentage split (40/30/30) |
| Two settlements | Balances moving back toward zero |

Every expense is inserted **through `create_expense()`**, so the ledger is built
by the same code path production uses and the zero-sum constraint is genuinely
exercised rather than bypassed.

The file ends with four verification queries that should all return **zero
rows**: every source balances, every group balances, payments equal their
expense total, shares equal their expense total.

> `auth.users` is owned by Supabase, so create the five accounts through the
> dashboard first and paste their UUIDs into the block at the top of the file.

---

## 11. How the frontend maps onto this

The Phase 1 service layer was written against this schema, so the mapping is
close to one-to-one.

| Frontend | Database |
|---|---|
| `types/index.ts` `User` | `profiles` |
| `Group` | `groups` |
| `GroupMember` | `group_members` |
| `Expense` | `expenses` + its `payments` and `participants` arrays |
| `ExpensePayment[]` | `expense_payments` rows |
| `ExpenseParticipant[]` | `expense_participants` rows |
| `Settlement` | `settlements` |
| `LedgerEntry` | `ledger_entries` |
| `Balance` | `group_balances()` result row |
| `PairwiseBalance` | `group_pairwise_balances()` result row |
| `SettlementSuggestion` | `settlement_suggestions()` result row |
| `ActivityEvent` | `activity_logs` |
| `AppNotification` | `notifications` |
| `Money` (integer minor units) | `bigint` |
| `value` as basis points | `expense_participants.value` |

Column names are `snake_case` in the database and `camelCase` in TypeScript;
that translation belongs in the Supabase service implementation and nowhere
else.

### The integration itself

`src/services/index.ts` is the only line that changes:

```diff
- export const services: DataServices = mockServices
+ export const services: DataServices = supabaseServices
```

`src/services/supabase/` implements the same `DataServices` interface from
`src/services/types.ts`. Mapping of methods to database calls:

| Interface method | Becomes |
|---|---|
| `groups.list()` | `select * from groups` (RLS narrows it to yours) |
| `groups.create()` | `insert into groups` — the trigger adds you as owner |
| `expenses.list(query)` | `select` with filters; search via the tsvector index |
| `expenses.create()` | `rpc('create_expense', …)` |
| `expenses.update()` | `rpc('update_expense', …)` |
| `expenses.remove()` | `rpc('delete_expense', …)` |
| `balances.forGroup()` | `rpc('group_balances', …)` |
| `balances.pairwiseForGroup()` | `rpc('group_pairwise_balances', …)` |
| `balances.suggestionsForGroup()` | `rpc('settlement_suggestions', …)` |
| `settlements.record()` | `rpc('record_settlement', …)` |
| `members.remove()` | `rpc('remove_group_member', …)` |
| `profile.current()` | `select * from profiles where id = auth.uid()` |

Note that `DataServices` has no method that accepts a balance. That was
deliberate from the start, and it is why the interface survives the move to a
real backend unchanged.

**What stays exactly as it is:** every component, every hook, and the whole of
`src/lib/`. The client keeps computing splits and balances for previews —
that's what makes the form feel instant — but the server recomputes everything
authoritatively, and the two agree because `allocate_amount` and `allocate()`
are the same algorithm.

### What still needs building in Phase 2

Things this plan covers but the app does not yet have:

1. **Supabase Auth** wired into `(auth)/` — the forms already validate
   correctly, only the submit handlers change.
2. **Route protection in middleware** rather than the client-side gate in
   `AppShell`.
3. **Avatar uploads** to Supabase Storage, with an RLS'd bucket.
4. **Realtime subscriptions** on `expenses`, `settlements` and `notifications`,
   so a group updates live.
5. **Group invitations** — an `invitations` table with a token, since Phase 1
   fakes this by creating a profile directly.
6. **Cross-currency handling** if groups ever need to mix currencies; today a
   group has one currency and expenses inherit it.

---

## 12. Running it

```
1. Create a Supabase project.
2. SQL Editor → paste docs/phase-2/migration.sql → Run.
3. Authentication → Users → create the five seed accounts.
4. Paste their UUIDs into the top of docs/phase-2/seed.sql.
5. SQL Editor → paste seed.sql → Run.
6. Check the four verification queries at the bottom all return zero rows.
```

Only then is it worth writing `src/services/supabase/`.
