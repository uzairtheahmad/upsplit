## What does this change?

<!-- One or two sentences. What is different after this PR that wasn't before? -->

Closes #

## Recording

<!--
  REQUIRED for anything that changes behaviour. Loom, or any screen recording.
  Under two minutes. If you fixed a bug, show it broken first, then fixed.
  Documentation-only PRs can delete this section.
-->

## How to check it

<!-- The steps a reviewer should follow to see this working themselves. -->

1.
2.
3.

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm test` passes
- [ ] `npm run typecheck` passes
- [ ] `npm run build` passes
- [ ] I added tests for anything that calculates
- [ ] I attached a recording, or this PR is docs-only

## If you touched money, balances, or the schema

<!-- Delete this whole section if you didn't. -->

- [ ] Balances are still derived, never stored
- [ ] Amounts are integer minor units, never floats
- [ ] Split parts still add back up to the expense total
- [ ] If I changed `allocate()`, I made the matching change to
      `allocate_amount()` in `docs/schema.sql` (or vice versa)
- [ ] Any new table has RLS enabled and policies in this PR

## Anything else

<!-- Trade-offs you made, things you're unsure about, things you left out. -->
