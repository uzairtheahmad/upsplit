-- =============================================================================
-- UpSplit — Phase 2 seed data
--
-- Run AFTER migration.sql, and only on a development project.
--
-- Supabase owns auth.users, so create the five accounts through the dashboard
-- (Authentication → Users → Add user) or the admin API first, then paste their
-- UUIDs into the block below. The profiles rows already exist by then — the
-- on_auth_user_created trigger made them — so this script updates names rather
-- than inserting profiles.
--
-- Every expense here goes through create_expense(), so the ledger is built by
-- the same code path the application uses and the zero-sum constraint is
-- genuinely exercised.
-- =============================================================================

do $$
declare
  -- ⚠️  Replace these with the real auth.users ids from your project.
  uzair    uuid := '00000000-0000-0000-0000-000000000001';
  ali      uuid := '00000000-0000-0000-0000-000000000002';
  shaheer  uuid := '00000000-0000-0000-0000-000000000003';
  naveed   uuid := '00000000-0000-0000-0000-000000000004';
  hadi     uuid := '00000000-0000-0000-0000-000000000005';

  g_hunza     uuid;
  g_apartment uuid;
begin
  -- ── profiles ──────────────────────────────────────────────────────────────
  update public.profiles set full_name = 'Uzair Ahmed'   where id = uzair;
  update public.profiles set full_name = 'Ali Raza'      where id = ali;
  update public.profiles set full_name = 'Shaheer Khan'  where id = shaheer;
  update public.profiles set full_name = 'Naveed Iqbal'  where id = naveed;
  update public.profiles set full_name = 'Hadi Malik'    where id = hadi;

  -- ── groups ────────────────────────────────────────────────────────────────
  -- The on_group_created trigger makes created_by the owner automatically.
  insert into public.groups (name, description, currency, icon, color, created_by)
  values ('Hunza Weekend Trip', 'Four days in Karimabad — hotel, fuel and food.',
          'PKR', 'plane', 'violet', uzair)
  returning id into g_hunza;

  insert into public.groups (name, description, currency, icon, color, created_by)
  values ('Apartment 4B', 'Rent, utilities and groceries for the flat.',
          'PKR', 'home', 'cyan', ali)
  returning id into g_apartment;

  insert into public.group_members (group_id, user_id, role) values
    (g_hunza, ali,     'admin'),
    (g_hunza, shaheer, 'member'),
    (g_hunza, naveed,  'member'),
    (g_apartment, uzair, 'admin'),
    (g_apartment, hadi,  'member');

  -- ── expenses ──────────────────────────────────────────────────────────────
  -- Amounts are minor units: Rs 48,000 -> 4 800 000 paisa.

  -- Equal split, single payer who is also a participant.
  perform set_config('request.jwt.claims', json_build_object('sub', uzair)::text, true);
  perform public.create_expense(
    g_hunza, 'Eagle''s Nest Hotel — 2 nights', 4800000, 'PKR', 'accommodation',
    current_date - 58, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', uzair, 'amount', 4800000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair),   jsonb_build_object('user_id', ali),
      jsonb_build_object('user_id', shaheer), jsonb_build_object('user_id', naveed)
    ),
    'Two twin rooms, breakfast included.'
  );
  -- Ledger: Uzair +3,600,000 · Ali/Shaheer/Naveed −1,200,000 each  → sums to 0

  -- Weighted split: Naveed took the front seat the whole way.
  perform public.create_expense(
    g_hunza, 'Jeep to Khunjerab Pass', 1800000, 'PKR', 'travel',
    current_date - 57, 'weighted',
    jsonb_build_array(jsonb_build_object('user_id', uzair, 'amount', 1800000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair,   'value', 1),
      jsonb_build_object('user_id', ali,     'value', 1),
      jsonb_build_object('user_id', shaheer, 'value', 1),
      jsonb_build_object('user_id', naveed,  'value', 2)
    )
  );
  -- Shares 360,000 / 360,000 / 360,000 / 720,000 → Uzair +1,440,000

  -- Rule 3: the payer is deliberately NOT a participant.
  perform public.create_expense(
    g_hunza, 'Souvenirs from Altit Fort', 600000, 'PKR', 'shopping',
    current_date - 56, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', uzair, 'amount', 600000)),
    jsonb_build_array(
      jsonb_build_object('user_id', ali),
      jsonb_build_object('user_id', shaheer),
      jsonb_build_object('user_id', naveed)
    ),
    'Uzair covered this one — he was not buying anything himself.'
  );
  -- Uzair +600,000 · the other three −200,000 each → sums to 0

  -- Multiple payers.
  perform set_config('request.jwt.claims', json_build_object('sub', ali)::text, true);
  perform public.create_expense(
    g_hunza, 'Lunch stop at Besham', 520000, 'PKR', 'food',
    current_date - 55, 'equal',
    jsonb_build_array(
      jsonb_build_object('user_id', ali,     'amount', 300000),
      jsonb_build_object('user_id', shaheer, 'amount', 220000)
    ),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair),   jsonb_build_object('user_id', ali),
      jsonb_build_object('user_id', shaheer), jsonb_build_object('user_id', naveed)
    )
  );
  -- Shares 130,000 each → Ali +170,000 · Shaheer +90,000 · Uzair/Naveed −130,000

  -- Exact split, in the flat.
  perform public.create_expense(
    g_apartment, 'Study desk and chair', 2600000, 'PKR', 'shopping',
    current_date - 84, 'exact',
    jsonb_build_array(jsonb_build_object('user_id', ali, 'amount', 2600000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair, 'value', 800000),
      jsonb_build_object('user_id', ali,   'value', 800000),
      jsonb_build_object('user_id', hadi,  'value', 1000000)
    )
  );

  -- Percentage split.
  perform public.create_expense(
    g_apartment, 'Electricity bill', 1875000, 'PKR', 'bills',
    current_date - 24, 'percentage',
    jsonb_build_array(jsonb_build_object('user_id', ali, 'amount', 1875000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair, 'value', 4000),
      jsonb_build_object('user_id', ali,   'value', 3000),
      jsonb_build_object('user_id', hadi,  'value', 3000)
    ),
    'Higher than usual — the AC ran all month.'
  );

  -- ── settlements ───────────────────────────────────────────────────────────
  perform set_config('request.jwt.claims', json_build_object('sub', shaheer)::text, true);
  perform public.record_settlement(
    g_hunza, shaheer, uzair, 800000, 'PKR', current_date - 40, 'Partial payment for the trip'
  );

  perform set_config('request.jwt.claims', json_build_object('sub', hadi)::text, true);
  perform public.record_settlement(
    g_apartment, hadi, ali, 300000, 'PKR', current_date - 30, 'Rent share'
  );
end $$;

-- =============================================================================
-- Verification — every one of these should come back clean.
-- =============================================================================

-- 1. Every source document balances to zero.
select source_type, source_id, sum(amount) as should_be_zero
  from public.ledger_entries
 group by source_type, source_id
having sum(amount) <> 0;
-- expect: 0 rows

-- 2. Every group balances to zero.
select group_id, sum(amount) as should_be_zero
  from public.ledger_entries
 group by group_id
having sum(amount) <> 0;
-- expect: 0 rows

-- 3. Payments always add up to their expense total.
select e.id, e.description, e.amount, sum(p.amount) as paid
  from public.expenses e
  join public.expense_payments p on p.expense_id = e.id
 group by e.id, e.description, e.amount
having sum(p.amount) <> e.amount;
-- expect: 0 rows

-- 4. Shares always add up to their expense total.
select e.id, e.description, e.amount, sum(s.share) as shared
  from public.expenses e
  cross join lateral public.expense_shares(e.id) s
 where e.deleted_at is null
 group by e.id, e.description, e.amount
having sum(s.share) <> e.amount;
-- expect: 0 rows
