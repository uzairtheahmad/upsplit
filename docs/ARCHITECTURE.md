# Architecture

How UpSplit is put together, and why. Read this before changing anything in
`lib/`, `services/` or `docs/schema.sql`.

## The accounting model

One rule governs the whole system:

```
net = amount paid - amount owed
```

For any single expense, the nets of everyone involved sum to **exactly zero**.
Postgres enforces that with a deferred constraint checked at commit, so an
unbalanced *committed* state is impossible. The test suite asserts the same
invariant on the client across every split method, participant count and
awkward total.

Three cases fall out of one code path, with no special-casing:

| Case | Result |
| --- | --- |
| Participant who didn't pay | `-their share` |
| Participant who did pay | `paid - their share` |
| Payer who isn't a participant | `+the whole amount` |

The third is the one most tools get wrong. A payer never has to appear in the
split.

### Money

Amounts are integer minor units (paisa, cents) everywhere: `Money = number` in
TypeScript, `bigint` in Postgres. Floats never touch a balance.

User input is parsed from the decimal *string* rather than by multiplying,
because `19.99 * 100` is `1998.9999999999998`. Formatting happens only at the
presentation layer.

### Rounding

Equal splits with a remainder use the largest-remainder method: each part gets
its floor, then leftover minor units go one at a time to the largest discarded
remainders, ties breaking on index. `Rs 100` across three people is
`33.34 / 33.33 / 33.33`, and `sum(shares) === total` always.

`allocate()` in `lib/money` and `allocate_amount()` in Postgres are the same
algorithm, so the preview a user saw before saving is exactly what the database
stores. **If you change one, change both**, and add a case to
`src/lib/money/money.test.ts`.

### Splits

`equal` and `exact` only. Both reduce to one code path: equal weights everyone
at 1, exact uses the stated amounts as the weights. Multiple payers are
supported by the data model, the maths and the UI.

An expense must involve **at least two people**, counted across payers union
participants. A one-person expense nets to zero and produces no ledger entries,
so it is rejected rather than silently recorded as nothing.

### Balances and settlements

Balances are always **derived** from expenses and settlements, never stored, so
they cannot drift. No API method accepts a balance.

Person-to-person balances attribute each participant's share across the payers
proportionally, which is what makes "you owe Ali Rs 1,200" meaningful when two
people paid.

Settlement suggestions use a greedy largest-debtor/largest-creditor pass,
giving at most `n - 1` transfers for `n` people with a non-zero balance.

**Settlements are not spending.** Nothing in `lib/analytics` ever takes a
settlement as input. Moving money to clear a debt doesn't create consumption.

## Code layout

```
src/
├── app/                    routing, layouts, page composition only
│   ├── (auth)/             login, signup, forgot-password
│   ├── (app)/              the authenticated shell and its screens
│   └── auth/callback/      exchanges email one-time codes for a session
├── components/
│   ├── ui/                 shadcn-style primitives (Radix + Tailwind + CVA)
│   ├── layout/             shell, sidebar, header, global dialogs
│   ├── charts/             Recharts wrappers on the validated palette
│   ├── landing/            the marketing page
│   └── <feature>/          dashboard, groups, expenses, balances, …
├── lib/
│   ├── supabase/           browser, server and middleware clients
│   ├── money/              parsing, formatting, exact allocation
│   ├── expenses/           the split engine
│   ├── balances/           ledger, net positions, pairwise breakdown
│   ├── settlements/        debt simplification
│   ├── analytics/          spending aggregation
│   ├── validation/         Zod schemas + cross-field split checks
│   └── store/              the client cache
├── services/               the data-access contract
│   ├── types.ts            the DataServices interface
│   └── supabase/           the implementation, mappers and workspace loader
├── hooks/                  read-side selectors, session, expense form state
└── types/                  domain types
```

The dependency direction is one-way: pages compose feature components, feature
components use domain functions, and only `services/` touches the data layer.
**No accounting logic lives in JSX.**

## How data flows

`services/index.ts` picks the implementation. Every method is async and returns
plain domain objects.

**Reads.** `services/supabase/queries.ts` loads the whole workspace for the
signed-in user in one parallel pass and hydrates the Zustand store in
`lib/store`. Nothing there is filtered by user or group: RLS already narrows
every table to rows the caller may see, and duplicating that in the client
would risk the two disagreeing. Components read through the hooks in
`hooks/use-app-data.ts` and derive everything else in a memo.

**Writes.** Every mutation goes through a Postgres RPC rather than a bare
insert, because the RPCs re-validate the input and rebuild the ledger in one
transaction. Each write is followed by a re-read, so the cache shows what the
database computed rather than what the client guessed. That is what makes
balance drift structurally impossible.

The store is a **cache**, not a source of truth. It is deliberately not
persisted to `localStorage`: the server owns this data, and a stale copy
surviving a sign-out would be both wrong and a privacy leak on a shared
machine.

### Adding a feature that writes data

1. Write the RPC in `docs/schema.sql`. Validate its inputs there. Assume the
   caller is hostile.
2. Add the method to the `DataServices` interface in `services/types.ts`.
3. Implement it in `services/supabase/supabase-services.ts`, calling the RPC
   and then `refreshWorkspace()`.
4. Add an RLS policy if you added a table. Every table has RLS enabled.
5. Add tests for any calculation the feature introduces.

## Security

Route protection lives in `middleware.ts` and uses `getUser()`, which
revalidates the token with Supabase. Not `getSession()`, which trusts a cookie
the browser could have forged.

RLS is enabled on every table. The shape is always the same: you can see a row
if you are a member of the group it belongs to, and change it only if your role
permits.

`ledger_entries` has **no write policy at all**, and `INSERT`, `UPDATE` and
`DELETE` are revoked from `authenticated`. A client cannot submit a balance,
which is the single most important guarantee in the schema.

The anon key is designed to be public. RLS is what protects the data, not the
secrecy of the key. `SUPABASE_SERVICE_ROLE_KEY` bypasses every policy, so it is
server-only and must never get a `NEXT_PUBLIC_` prefix.

## Design system

Tokens live in `app/globals.css`. Light and dark are authored independently
rather than inverted, with their own surfaces, borders and chart steps.

Financial meaning is never carried by colour alone. Every positive or negative
figure also gets a sign, an icon, or an explicit label ("you owe", "you're
owed"), so the app reads correctly in greyscale and to a screen reader.

The categorical chart ramp is **six fixed slots, assigned in order and never
cycled**. A seventh category folds into a neutral "Other". Both ramps were
validated for CVD separation, chroma, lightness band and contrast against their
own surface.
