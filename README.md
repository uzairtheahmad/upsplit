# UpSplit

A shared-expense app: track what everyone paid, see exactly who owes whom, and
settle up in the fewest possible payments.

**Phase 1 (this repo) is UI-only.** There is no database, no Supabase, and no
real authentication. Everything runs on mock data held in local state and
persisted to `localStorage`, behind a service interface that Phase 2 will
re-implement against Supabase without touching the components.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # accounting engine test suite
npm run typecheck
npm run build
```

Log in with any email and an 8+ character password. Signing in with a seeded
address (e.g. `ali.raza@example.com`) views the app as that person.

## The accounting model

One rule governs the whole system:

```
net = amount paid − amount owed
```

and for any single expense the nets of everyone involved sum to **exactly
zero**. That invariant is asserted by the test suite across every split method,
participant count and awkward total.

Three cases all fall out of the same code path, with no special-casing:

| Case | Result |
| --- | --- |
| Participant who didn't pay | `−their share` |
| Participant who did pay | `paid − their share` |
| Payer who isn't a participant | `+the whole amount` |

The third case is the one most tools get wrong. A payer never has to appear in
the split.

### Money

Amounts are integer minor units (paisa, cents) everywhere — `Money = number`.
Floats never touch a balance. User input is parsed from the decimal *string*
rather than by multiplying, because `19.99 * 100` is `1998.9999999999998`.
Formatting happens only at the presentation layer, in `lib/money`.

### Rounding

Equal splits with a remainder use the largest-remainder method: each part gets
its floor, then leftover minor units go one at a time to the largest discarded
remainders, ties breaking on index. `Rs 100` across three people is
`33.34 / 33.33 / 33.33`, never `33.333…`, and `sum(shares) === total` always.
The allocation is deterministic — the same inputs always give the same answer,
which matters because people re-check these numbers.

### Split methods

`equal`, `exact` (minor units), `percentage` (stored as basis points so
percentages stay integers) and `weighted` (arbitrary positive shares).
Multiple payers are supported by the data model, the maths and the UI.

### Balances and settlements

Balances are always **derived** from expenses and settlements, never stored, so
they cannot drift. Person-to-person balances attribute each participant's share
across the payers proportionally, which is what makes "you owe Ali Rs 1,200"
meaningful when two people paid.

Settlement suggestions use the greedy largest-debtor/largest-creditor pass,
giving at most `n − 1` transfers for `n` people with a non-zero balance. Every
suggestion is possible (the sender really does owe at least that much), and
applying all of them leaves every balance at exactly zero.

**Settlements are not spending.** Nothing in `lib/analytics` ever takes a
settlement as input — moving money to clear a debt doesn't create consumption.

## Architecture

```
src/
├── app/                    routing, layouts, page composition only
│   ├── (auth)/             login, signup, forgot-password
│   └── (app)/              the authenticated shell and its screens
├── components/
│   ├── ui/                 shadcn-style primitives (Radix + Tailwind + CVA)
│   ├── layout/             shell, sidebar, header, global dialog actions
│   ├── charts/             Recharts wrappers on the validated palette
│   └── <feature>/          dashboard, groups, expenses, balances, …
├── lib/
│   ├── money/              parsing, formatting, exact allocation
│   ├── expenses/           the split engine
│   ├── balances/           ledger, net positions, pairwise breakdown
│   ├── settlements/        debt simplification
│   ├── analytics/          spending aggregation
│   └── validation/         Zod schemas + cross-field split checks
├── services/               the data-access contract
│   ├── types.ts            interfaces Phase 2 will re-implement
│   └── mock/               Phase 1 implementation + seed data
├── hooks/                  read-side selectors, expense form state
└── types/                  domain types
```

The dependency direction is one-way: pages compose feature components, feature
components use domain functions, and only `services/` touches the data layer.
No accounting logic lives in JSX.

### Swapping in a backend

`services/index.ts` is the single line that picks an implementation:

```ts
export const services: DataServices = mockServices
```

Every method is async and returns plain domain objects, so a Supabase
implementation of the same interface is a drop-in. Note what the contract does
*not* accept: no method takes a balance. Balances are derived, never submitted
by the client — the same shape the Phase 2 RPCs will have.

## Design system

Tokens live in `app/globals.css`. Light and dark are authored independently
rather than inverted, with their own surfaces, borders and chart steps.

Financial meaning is never carried by colour alone: every positive or negative
figure also gets a sign, an icon, or an explicit label ("you owe", "you're
owed"), so the app reads correctly in greyscale and to a screen reader.

The categorical chart ramp is **six fixed slots, assigned in order and never
cycled** — a seventh category folds into a neutral "Other". Both the light and
dark ramps were validated for CVD separation, chroma, lightness band and
contrast against their own surface.

## Tests

`npm test` covers the accounting engine: every split method, uneven remainders,
the three payer cases, multiple payers, invalid percentages and exact amounts,
empty participants, zero and negative amounts, soft deletes, pairwise
attribution, settlement clearing, and the zero-sum invariant swept across
methods × totals × participant counts.

## What Phase 1 deliberately does not do

No Supabase client, no environment variables, no migrations, no real auth. The
mock auth gate exists so the full sign-up → dashboard → settle-up journey is
walkable; it checks nothing and nothing leaves the browser.
