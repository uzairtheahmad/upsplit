-- =============================================================================
-- UpSplit — Phase 2 schema
--
-- Paste this whole file into the Supabase SQL Editor and run it once, on a
-- fresh project. It is written to be run top to bottom: extensions, enums,
-- tables, helper functions, RLS, RPCs, triggers.
--
-- Money is BIGINT minor units (paisa/cents) everywhere. No floats, ever.
--
-- The authoritative accounting rule, enforced by a deferred constraint at the
-- bottom of this file:
--
--     for every expense and every settlement,
--     SUM(ledger_entries.amount) = 0
-- =============================================================================

create extension if not exists "pgcrypto";

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

create type public.group_role as enum ('owner', 'admin', 'member');

create type public.expense_category as enum (
  'food', 'transport', 'shopping', 'bills', 'entertainment',
  'travel', 'accommodation', 'groceries', 'health', 'education', 'other'
);

create type public.split_method as enum ('equal', 'exact', 'percentage', 'weighted');

create type public.ledger_source as enum ('expense', 'settlement');

create type public.activity_action as enum (
  'expense_added', 'expense_updated', 'expense_deleted',
  'settlement_recorded', 'settlement_deleted',
  'group_created', 'group_updated', 'member_joined', 'member_removed', 'member_role_changed'
);

create type public.notification_kind as enum ('expense', 'settlement', 'group', 'reminder');

-- Currency lives in its own table rather than an enum so adding one later is a
-- data change, not a migration that rewrites every dependent column.
create table public.currencies (
  code        text primary key check (code ~ '^[A-Z]{3}$'),
  symbol      text        not null,
  decimals    smallint    not null default 2 check (decimals between 0 and 4),
  name        text        not null
);

insert into public.currencies (code, symbol, decimals, name) values
  ('PKR', 'Rs',  2, 'Pakistani rupee'),
  ('USD', '$',   2, 'US dollar'),
  ('EUR', '€',   2, 'Euro'),
  ('GBP', '£',   2, 'Pound sterling'),
  ('AED', 'AED', 2, 'UAE dirham');

-- =============================================================================
-- 2. TABLES
-- =============================================================================

-- ── profiles ────────────────────────────────────────────────────────────────
-- One row per auth user, created automatically by a trigger on auth.users.
create table public.profiles (
  id                  uuid primary key references auth.users (id) on delete cascade,
  full_name           text        not null check (length(btrim(full_name)) between 1 and 120),
  email               text        not null,
  avatar_url          text,
  default_currency    text        not null default 'PKR' references public.currencies (code),
  email_notifications boolean     not null default true,
  push_notifications  boolean     not null default false,
  weekly_summary      boolean     not null default true,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create unique index profiles_email_key on public.profiles (lower(email));

-- ── groups ──────────────────────────────────────────────────────────────────
create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text        not null check (length(btrim(name)) between 2 and 60),
  description text        check (length(description) <= 200),
  currency    text        not null default 'PKR' references public.currencies (code),
  icon        text        not null default 'users',
  color       text        not null default 'violet',
  created_by  uuid        not null references public.profiles (id) on delete restrict,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  archived_at timestamptz
);

create index groups_created_by_idx on public.groups (created_by);

-- ── group_members ───────────────────────────────────────────────────────────
create table public.group_members (
  group_id  uuid        not null references public.groups (id) on delete cascade,
  user_id   uuid        not null references public.profiles (id) on delete cascade,
  role      public.group_role not null default 'member',
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

-- "Which groups am I in?" is the hottest query in the app and drives every
-- RLS check, so it gets its own index in the non-PK direction.
create index group_members_user_idx on public.group_members (user_id);

-- Exactly one owner per group. A partial unique index is the cheapest way to
-- say that without a trigger.
create unique index group_members_single_owner_idx
  on public.group_members (group_id)
  where role = 'owner';

-- ── expenses ────────────────────────────────────────────────────────────────
create table public.expenses (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups (id) on delete cascade,
  description  text        not null check (length(btrim(description)) between 2 and 120),
  notes        text        check (length(notes) <= 500),
  amount       bigint      not null check (amount > 0),
  currency     text        not null references public.currencies (code),
  category     public.expense_category not null default 'other',
  expense_date date        not null,
  split_method public.split_method not null default 'equal',
  created_by   uuid        not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  deleted_at   timestamptz
);

-- The default list view: one group, newest first, live rows only.
create index expenses_group_date_idx
  on public.expenses (group_id, expense_date desc, created_at desc)
  where deleted_at is null;

create index expenses_group_category_idx
  on public.expenses (group_id, category)
  where deleted_at is null;

-- Full-text search over description and notes, for the expense search box.
create index expenses_search_idx
  on public.expenses
  using gin (to_tsvector('simple', description || ' ' || coalesce(notes, '')));

-- ── expense_payments ────────────────────────────────────────────────────────
-- Who actually put money down. One row per payer: this is what makes multiple
-- payers a data question rather than a schema change.
create table public.expense_payments (
  expense_id uuid   not null references public.expenses (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete restrict,
  amount     bigint not null check (amount > 0),
  primary key (expense_id, user_id)
);

create index expense_payments_user_idx on public.expense_payments (user_id);

-- ── expense_participants ────────────────────────────────────────────────────
-- Who is being charged, and the raw input that determines their share.
--
-- `value` is interpreted by the expense's split_method:
--   equal      -> ignored
--   exact      -> the person's share in minor units
--   percentage -> basis points (5000 = 50%), so percentages stay integers
--   weighted   -> an arbitrary non-negative weight
create table public.expense_participants (
  expense_id uuid   not null references public.expenses (id) on delete cascade,
  user_id    uuid   not null references public.profiles (id) on delete restrict,
  value      bigint check (value >= 0),
  primary key (expense_id, user_id)
);

create index expense_participants_user_idx on public.expense_participants (user_id);

-- ── settlements ─────────────────────────────────────────────────────────────
-- Modelled separately from expenses rather than as an `expense_type`, because
-- a settlement has genuinely different columns (a direction, no split, no
-- category) and because keeping it out of `expenses` makes it structurally
-- impossible for a settlement to leak into spending analytics.
create table public.settlements (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid        not null references public.groups (id) on delete cascade,
  from_user_id uuid        not null references public.profiles (id) on delete restrict,
  to_user_id   uuid        not null references public.profiles (id) on delete restrict,
  amount       bigint      not null check (amount > 0),
  currency     text        not null references public.currencies (code),
  settled_on   date        not null default current_date,
  note         text        check (length(note) <= 200),
  created_by   uuid        not null references public.profiles (id) on delete restrict,
  created_at   timestamptz not null default now(),
  deleted_at   timestamptz,
  constraint settlements_distinct_parties check (from_user_id <> to_user_id)
);

create index settlements_group_date_idx
  on public.settlements (group_id, settled_on desc)
  where deleted_at is null;

create index settlements_parties_idx
  on public.settlements (group_id, from_user_id, to_user_id)
  where deleted_at is null;

-- ── ledger_entries ──────────────────────────────────────────────────────────
-- The signed financial effect of every source document, one row per person.
--
--   amount > 0  -> this person is owed money
--   amount < 0  -> this person owes money
--
-- Derived, never written by clients. Maintained by triggers so it cannot drift
-- from the expenses that produced it, and constrained to sum to zero per
-- source so a partial write can never leave the books unbalanced.
create table public.ledger_entries (
  id          bigint generated always as identity primary key,
  group_id    uuid   not null references public.groups (id) on delete cascade,
  user_id     uuid   not null references public.profiles (id) on delete cascade,
  source_type public.ledger_source not null,
  source_id   uuid   not null,
  amount      bigint not null check (amount <> 0),
  created_at  timestamptz not null default now()
);

-- Balance queries are always "everything in this group, grouped by user".
create index ledger_entries_group_user_idx on public.ledger_entries (group_id, user_id);
create index ledger_entries_source_idx on public.ledger_entries (source_type, source_id);
create unique index ledger_entries_unique_idx
  on public.ledger_entries (source_type, source_id, user_id);

-- ── activity_logs ───────────────────────────────────────────────────────────
create table public.activity_logs (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid        not null references public.groups (id) on delete cascade,
  actor_id   uuid        not null references public.profiles (id) on delete cascade,
  action     public.activity_action not null,
  subject    text        not null,
  amount     bigint,
  currency   text        references public.currencies (code),
  href       text,
  created_at timestamptz not null default now()
);

create index activity_logs_group_time_idx on public.activity_logs (group_id, created_at desc);

-- ── notifications ───────────────────────────────────────────────────────────
create table public.notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid        not null references public.profiles (id) on delete cascade,
  group_id   uuid        references public.groups (id) on delete cascade,
  kind       public.notification_kind not null,
  title      text        not null,
  body       text        not null,
  href       text,
  read_at    timestamptz,
  created_at timestamptz not null default now()
);

-- The bell only ever asks for one user's unread rows, newest first.
create index notifications_user_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null;

create index notifications_user_time_idx on public.notifications (user_id, created_at desc);

-- =============================================================================
-- 3. HELPER FUNCTIONS
-- =============================================================================

-- Membership checks are SECURITY DEFINER on purpose. A policy on
-- group_members that queried group_members would recurse infinitely; running
-- the lookup as the definer with RLS bypassed breaks that cycle. Both
-- functions are read-only and take a group id the caller already knows, so
-- they leak nothing the caller could not otherwise ask for.
create or replace function public.is_group_member(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group_id and user_id = auth.uid()
  );
$$;

create or replace function public.group_role_of(p_group_id uuid)
returns public.group_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.group_members
  where group_id = p_group_id and user_id = auth.uid();
$$;

create or replace function public.can_manage_members(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.group_role_of(p_group_id) in ('owner', 'admin');
$$;

-- ── allocate_amount ─────────────────────────────────────────────────────────
-- Largest-remainder allocation. This is the exact server-side twin of
-- `allocate()` in src/lib/money/money.ts: every part gets its floor, then the
-- leftover minor units go one at a time to the largest discarded remainders,
-- ties breaking on index.
--
-- Guarantees SUM(result) = p_total for any non-negative weights, so an equal
-- split of 10000 across 3 is {3334, 3333, 3333} and never a fraction.
create or replace function public.allocate_amount(p_total bigint, p_weights bigint[])
returns bigint[]
language plpgsql
immutable
as $$
declare
  n            int    := coalesce(array_length(p_weights, 1), 0);
  total_weight numeric := 0;
  sign_factor  int    := case when p_total < 0 then -1 else 1 end;
  magnitude    bigint := abs(p_total);
  result       bigint[];
  remainders   numeric[];
  exact_share  numeric;
  distributed  bigint := 0;
  leftover     bigint;
  order_idx    int[];
begin
  if n = 0 then
    return '{}'::bigint[];
  end if;

  select coalesce(sum(w), 0) into total_weight from unnest(p_weights) as w;

  -- No usable weights: fall back to an even split rather than dividing by zero.
  if total_weight <= 0 then
    return public.allocate_amount(p_total, array_fill(1::bigint, array[n]));
  end if;

  result     := array_fill(0::bigint, array[n]);
  remainders := array_fill(0::numeric, array[n]);

  for i in 1..n loop
    exact_share   := (magnitude::numeric * greatest(p_weights[i], 0)) / total_weight;
    result[i]     := floor(exact_share)::bigint;
    remainders[i] := exact_share - floor(exact_share);
    distributed   := distributed + result[i];
  end loop;

  leftover := magnitude - distributed;

  select array_agg(i order by remainders[i] desc, i asc)
    into order_idx
    from generate_series(1, n) as i;

  for k in 1..leftover loop
    result[order_idx[k]] := result[order_idx[k]] + 1;
  end loop;

  if sign_factor = -1 then
    for i in 1..n loop
      result[i] := -result[i];
    end loop;
  end if;

  return result;
end;
$$;

-- ── expense_shares ──────────────────────────────────────────────────────────
-- What each participant is charged for one expense. Mirrors
-- `calculateShares()` on the client, including the exact-split rule: if the
-- stated amounts already balance, they are used verbatim; otherwise they are
-- scaled so the result still sums to the total.
create or replace function public.expense_shares(p_expense_id uuid)
returns table (user_id uuid, share bigint)
language plpgsql
stable
as $$
declare
  v_expense    public.expenses%rowtype;
  v_users      uuid[];
  v_weights    bigint[];
  v_shares     bigint[];
  v_stated     bigint;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then return; end if;

  select array_agg(p.user_id order by p.user_id),
         array_agg(
           case v_expense.split_method
             when 'equal' then 1::bigint
             else greatest(coalesce(p.value, 0), 0)
           end
           order by p.user_id
         )
    into v_users, v_weights
    from public.expense_participants p
   where p.expense_id = p_expense_id;

  if v_users is null then return; end if;

  if v_expense.split_method = 'exact' then
    select coalesce(sum(w), 0) into v_stated from unnest(v_weights) as w;
    if v_stated = v_expense.amount then
      v_shares := v_weights;
    else
      v_shares := public.allocate_amount(v_expense.amount, v_weights);
    end if;
  else
    v_shares := public.allocate_amount(v_expense.amount, v_weights);
  end if;

  for i in 1..array_length(v_users, 1) loop
    user_id := v_users[i];
    share   := v_shares[i];
    return next;
  end loop;
end;
$$;

-- ── rebuild_expense_ledger ──────────────────────────────────────────────────
-- Recompute the signed effects of one expense: net = paid - owed, per person,
-- dropping anyone whose net is zero. Idempotent, so it is safe to call from
-- several triggers.
create or replace function public.rebuild_expense_ledger(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
begin
  select * into v_expense from public.expenses where id = p_expense_id;
  if not found then
    delete from public.ledger_entries
     where source_type = 'expense' and source_id = p_expense_id;
    return;
  end if;

  delete from public.ledger_entries
   where source_type = 'expense' and source_id = p_expense_id;

  -- A soft-deleted expense contributes nothing to any balance.
  if v_expense.deleted_at is not null then
    return;
  end if;

  insert into public.ledger_entries (group_id, user_id, source_type, source_id, amount)
  select v_expense.group_id,
         t.user_id,
         'expense',
         p_expense_id,
         t.net
    from (
      select coalesce(pay.user_id, sh.user_id) as user_id,
             coalesce(pay.paid, 0) - coalesce(sh.share, 0) as net
        from (
          select user_id, sum(amount) as paid
            from public.expense_payments
           where expense_id = p_expense_id
           group by user_id
        ) pay
        full outer join (
          select user_id, share from public.expense_shares(p_expense_id)
        ) sh on sh.user_id = pay.user_id
    ) t
   where t.net <> 0;
end;
$$;

-- ── rebuild_settlement_ledger ───────────────────────────────────────────────
-- A settlement moves both parties toward zero: the payer's net rises, the
-- receiver's falls.
create or replace function public.rebuild_settlement_ledger(p_settlement_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_settlement public.settlements%rowtype;
begin
  delete from public.ledger_entries
   where source_type = 'settlement' and source_id = p_settlement_id;

  select * into v_settlement from public.settlements where id = p_settlement_id;
  if not found or v_settlement.deleted_at is not null then
    return;
  end if;

  insert into public.ledger_entries (group_id, user_id, source_type, source_id, amount)
  values
    (v_settlement.group_id, v_settlement.from_user_id, 'settlement', p_settlement_id,  v_settlement.amount),
    (v_settlement.group_id, v_settlement.to_user_id,   'settlement', p_settlement_id, -v_settlement.amount);
end;
$$;

-- =============================================================================
-- 4. READ RPCs
-- =============================================================================

-- Net position per member, decomposed so the UI can explain the number rather
-- than just assert it.
create or replace function public.group_balances(p_group_id uuid)
returns table (user_id uuid, paid bigint, owed bigint, settled bigint, net bigint)
language sql
stable
security definer
set search_path = public
as $$
  with members as (
    select gm.user_id from public.group_members gm where gm.group_id = p_group_id
  ),
  paid as (
    select ep.user_id, sum(ep.amount) as amount
      from public.expense_payments ep
      join public.expenses e on e.id = ep.expense_id
     where e.group_id = p_group_id and e.deleted_at is null
     group by ep.user_id
  ),
  owed as (
    select s.user_id, sum(s.share) as amount
      from public.expenses e
      cross join lateral public.expense_shares(e.id) s
     where e.group_id = p_group_id and e.deleted_at is null
     group by s.user_id
  ),
  settled as (
    select le.user_id, sum(le.amount) as amount
      from public.ledger_entries le
     where le.group_id = p_group_id and le.source_type = 'settlement'
     group by le.user_id
  )
  select m.user_id,
         coalesce(p.amount, 0) as paid,
         coalesce(o.amount, 0) as owed,
         coalesce(s.amount, 0) as settled,
         coalesce(p.amount, 0) - coalesce(o.amount, 0) + coalesce(s.amount, 0) as net
    from members m
    left join paid p    on p.user_id = m.user_id
    left join owed o    on o.user_id = m.user_id
    left join settled s on s.user_id = m.user_id
   where public.is_group_member(p_group_id);
$$;

-- Greedy debt simplification: repeatedly match the largest debtor against the
-- largest creditor. Each pass zeroes at least one person, so n people with a
-- non-zero balance settle in at most n-1 transfers. Not always the theoretical
-- minimum (that problem is NP-hard) but fast, deterministic, and every
-- suggestion is genuinely payable.
create or replace function public.settlement_suggestions(p_group_id uuid)
returns table (from_user_id uuid, to_user_id uuid, amount bigint)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  debtors   record[];
  creditors record[];
  d_ids   uuid[];   d_amounts bigint[];
  c_ids   uuid[];   c_amounts bigint[];
  di int := 1;      ci int := 1;
  transfer bigint;
begin
  if not public.is_group_member(p_group_id) then
    return;
  end if;

  select array_agg(b.user_id order by b.net asc, b.user_id),
         array_agg(-b.net    order by b.net asc, b.user_id)
    into d_ids, d_amounts
    from public.group_balances(p_group_id) b
   where b.net < 0;

  select array_agg(b.user_id order by b.net desc, b.user_id),
         array_agg(b.net     order by b.net desc, b.user_id)
    into c_ids, c_amounts
    from public.group_balances(p_group_id) b
   where b.net > 0;

  if d_ids is null or c_ids is null then
    return;
  end if;

  while di <= array_length(d_ids, 1) and ci <= array_length(c_ids, 1) loop
    transfer := least(d_amounts[di], c_amounts[ci]);

    if transfer > 0 then
      from_user_id := d_ids[di];
      to_user_id   := c_ids[ci];
      amount       := transfer;
      return next;

      d_amounts[di] := d_amounts[di] - transfer;
      c_amounts[ci] := c_amounts[ci] - transfer;
    end if;

    if d_amounts[di] = 0 then di := di + 1; end if;
    if c_amounts[ci] = 0 then ci := ci + 1; end if;
  end loop;
end;
$$;

-- Net obligations between every pair, attributing each participant's share
-- across the payers proportionally. This is what makes "you owe Ali Rs 1,200"
-- meaningful when two people paid for the same expense.
create or replace function public.group_pairwise_balances(p_group_id uuid)
returns table (from_user_id uuid, to_user_id uuid, amount bigint)
language sql
stable
security definer
set search_path = public
as $$
  with expense_edges as (
    select sh.user_id as debtor,
           pay.user_id as creditor,
           (public.allocate_amount(
              sh.share,
              (select array_agg(p2.amount order by p2.user_id)
                 from public.expense_payments p2 where p2.expense_id = e.id)
            ))[
              (select count(*)::int
                 from public.expense_payments p3
                where p3.expense_id = e.id and p3.user_id <= pay.user_id)
            ] as amount
      from public.expenses e
      cross join lateral public.expense_shares(e.id) sh
      join public.expense_payments pay on pay.expense_id = e.id
     where e.group_id = p_group_id
       and e.deleted_at is null
       and sh.share > 0
       and sh.user_id <> pay.user_id
  ),
  settlement_edges as (
    select s.from_user_id as debtor, s.to_user_id as creditor, -s.amount as amount
      from public.settlements s
     where s.group_id = p_group_id and s.deleted_at is null
  ),
  all_edges as (
    select debtor, creditor, amount from expense_edges
    union all
    select debtor, creditor, amount from settlement_edges
  ),
  -- Net the two directions of each pair against each other.
  netted as (
    select least(debtor, creditor) as a,
           greatest(debtor, creditor) as b,
           sum(case when debtor < creditor then amount else -amount end) as amount
      from all_edges
     group by 1, 2
  )
  select case when amount > 0 then a else b end,
         case when amount > 0 then b else a end,
         abs(amount)
    from netted
   where amount <> 0 and public.is_group_member(p_group_id);
$$;

-- =============================================================================
-- 5. WRITE RPCs (atomic)
-- =============================================================================

-- Creating an expense touches three tables plus the ledger. Doing that as four
-- client round-trips would let a network failure leave a half-written expense
-- and an unbalanced group. This function is a single transaction: it either
-- all lands or none of it does.
--
-- It also re-validates everything the client checked, because the client's
-- checks are for the user's benefit and nothing more.
create or replace function public.create_expense(
  p_group_id     uuid,
  p_description  text,
  p_amount       bigint,
  p_currency     text,
  p_category     public.expense_category,
  p_expense_date date,
  p_split_method public.split_method,
  p_payments     jsonb,     -- [{"user_id": "...", "amount": 300000}, ...]
  p_participants jsonb,     -- [{"user_id": "...", "value": 5000}, ...]
  p_notes        text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_id uuid;
  v_paid_total bigint;
  v_pct_total  bigint;
  v_exact_total bigint;
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22003';
  end if;

  -- Every payer and participant must belong to the group. Without this, a
  -- caller could name any user id and attach a debt to a stranger.
  if exists (
    select 1 from jsonb_array_elements(p_payments) e
     where not exists (
       select 1 from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = (e->>'user_id')::uuid
     )
  ) then
    raise exception 'A payer is not a member of this group' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_participants) e
     where not exists (
       select 1 from public.group_members gm
        where gm.group_id = p_group_id and gm.user_id = (e->>'user_id')::uuid
     )
  ) then
    raise exception 'A participant is not a member of this group' using errcode = '42501';
  end if;

  select coalesce(sum((e->>'amount')::bigint), 0) into v_paid_total
    from jsonb_array_elements(p_payments) e;

  if v_paid_total <> p_amount then
    raise exception 'Payments (%) must add up to the expense total (%)', v_paid_total, p_amount
      using errcode = '23514';
  end if;

  if jsonb_array_length(p_participants) = 0 then
    raise exception 'An expense needs at least one participant' using errcode = '23514';
  end if;

  if p_split_method = 'percentage' then
    select coalesce(sum((e->>'value')::bigint), 0) into v_pct_total
      from jsonb_array_elements(p_participants) e;
    if v_pct_total <> 10000 then
      raise exception 'Percentages must add up to exactly 100%%' using errcode = '23514';
    end if;
  end if;

  if p_split_method = 'exact' then
    select coalesce(sum((e->>'value')::bigint), 0) into v_exact_total
      from jsonb_array_elements(p_participants) e;
    if v_exact_total <> p_amount then
      raise exception 'Exact amounts must add up to the expense total' using errcode = '23514';
    end if;
  end if;

  insert into public.expenses (
    group_id, description, notes, amount, currency, category,
    expense_date, split_method, created_by
  ) values (
    p_group_id, btrim(p_description), nullif(btrim(coalesce(p_notes, '')), ''),
    p_amount, p_currency, p_category, p_expense_date, p_split_method, v_actor
  )
  returning id into v_expense_id;

  insert into public.expense_payments (expense_id, user_id, amount)
  select v_expense_id, (e->>'user_id')::uuid, (e->>'amount')::bigint
    from jsonb_array_elements(p_payments) e;

  insert into public.expense_participants (expense_id, user_id, value)
  select v_expense_id, (e->>'user_id')::uuid, nullif(e->>'value', '')::bigint
    from jsonb_array_elements(p_participants) e;

  perform public.rebuild_expense_ledger(v_expense_id);

  insert into public.activity_logs (group_id, actor_id, action, subject, amount, currency, href)
  values (p_group_id, v_actor, 'expense_added', btrim(p_description), p_amount, p_currency,
          '/groups/' || p_group_id || '/expenses/' || v_expense_id);

  -- Tell everyone else in the group.
  insert into public.notifications (user_id, group_id, kind, title, body, href)
  select gm.user_id, p_group_id, 'expense',
         (select full_name from public.profiles where id = v_actor) || ' added an expense',
         btrim(p_description),
         '/groups/' || p_group_id || '/expenses/' || v_expense_id
    from public.group_members gm
   where gm.group_id = p_group_id and gm.user_id <> v_actor;

  return v_expense_id;
end;
$$;

-- Replaces the payment and participant sets wholesale, which keeps editing and
-- creating on the same code path — the ledger is rebuilt either way.
create or replace function public.update_expense(
  p_expense_id   uuid,
  p_description  text,
  p_amount       bigint,
  p_category     public.expense_category,
  p_expense_date date,
  p_split_method public.split_method,
  p_payments     jsonb,
  p_participants jsonb,
  p_notes        text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_group uuid;
  v_paid_total bigint;
  v_actor uuid := auth.uid();
begin
  select group_id into v_group from public.expenses
   where id = p_expense_id and deleted_at is null;

  if v_group is null then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_group) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;

  select coalesce(sum((e->>'amount')::bigint), 0) into v_paid_total
    from jsonb_array_elements(p_payments) e;

  if v_paid_total <> p_amount then
    raise exception 'Payments must add up to the expense total' using errcode = '23514';
  end if;

  update public.expenses
     set description  = btrim(p_description),
         notes        = nullif(btrim(coalesce(p_notes, '')), ''),
         amount       = p_amount,
         category     = p_category,
         expense_date = p_expense_date,
         split_method = p_split_method,
         updated_at   = now()
   where id = p_expense_id;

  delete from public.expense_payments where expense_id = p_expense_id;
  insert into public.expense_payments (expense_id, user_id, amount)
  select p_expense_id, (e->>'user_id')::uuid, (e->>'amount')::bigint
    from jsonb_array_elements(p_payments) e;

  delete from public.expense_participants where expense_id = p_expense_id;
  insert into public.expense_participants (expense_id, user_id, value)
  select p_expense_id, (e->>'user_id')::uuid, nullif(e->>'value', '')::bigint
    from jsonb_array_elements(p_participants) e;

  perform public.rebuild_expense_ledger(p_expense_id);

  insert into public.activity_logs (group_id, actor_id, action, subject, amount, href)
  values (v_group, v_actor, 'expense_updated', btrim(p_description), p_amount,
          '/groups/' || v_group || '/expenses/' || p_expense_id);
end;
$$;

create or replace function public.delete_expense(p_expense_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense public.expenses%rowtype;
  v_actor uuid := auth.uid();
begin
  select * into v_expense from public.expenses
   where id = p_expense_id and deleted_at is null;

  if not found then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;

  -- The person who added it, or a group admin, may remove it.
  if v_expense.created_by <> v_actor and not public.can_manage_members(v_expense.group_id) then
    raise exception 'Only the person who added this expense, or a group admin, can delete it'
      using errcode = '42501';
  end if;

  update public.expenses set deleted_at = now(), updated_at = now()
   where id = p_expense_id;

  perform public.rebuild_expense_ledger(p_expense_id);

  insert into public.activity_logs (group_id, actor_id, action, subject, amount, href)
  values (v_expense.group_id, v_actor, 'expense_deleted', v_expense.description, v_expense.amount,
          '/groups/' || v_expense.group_id || '/expenses');
end;
$$;

create or replace function public.record_settlement(
  p_group_id     uuid,
  p_from_user_id uuid,
  p_to_user_id   uuid,
  p_amount       bigint,
  p_currency     text,
  p_settled_on   date default current_date,
  p_note         text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  v_actor uuid := auth.uid();
begin
  if not public.is_group_member(p_group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;

  if p_from_user_id = p_to_user_id then
    raise exception 'A settlement needs two different people' using errcode = '23514';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22003';
  end if;

  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id in (p_from_user_id, p_to_user_id)
     group by group_id having count(*) = 2
  ) then
    raise exception 'Both people must be members of this group' using errcode = '42501';
  end if;

  insert into public.settlements (
    group_id, from_user_id, to_user_id, amount, currency, settled_on, note, created_by
  ) values (
    p_group_id, p_from_user_id, p_to_user_id, p_amount, p_currency, p_settled_on,
    nullif(btrim(coalesce(p_note, '')), ''), v_actor
  )
  returning id into v_id;

  perform public.rebuild_settlement_ledger(v_id);

  insert into public.activity_logs (group_id, actor_id, action, subject, amount, currency, href)
  values (p_group_id, v_actor, 'settlement_recorded', 'a settlement', p_amount, p_currency,
          '/groups/' || p_group_id || '/balances');

  insert into public.notifications (user_id, group_id, kind, title, body, href)
  select gm.user_id, p_group_id, 'settlement', 'A settlement was recorded',
         'Balances in the group have been updated',
         '/groups/' || p_group_id || '/balances'
    from public.group_members gm
   where gm.group_id = p_group_id and gm.user_id <> v_actor;

  return v_id;
end;
$$;

-- Removing a member would break the group's zero-sum books if they still had
-- money on the line, so the database refuses rather than trusting the UI.
create or replace function public.remove_group_member(p_group_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_net bigint;
begin
  if not public.can_manage_members(p_group_id) then
    raise exception 'Only owners and admins can remove members' using errcode = '42501';
  end if;

  if public.group_role_of(p_group_id) <> 'owner'
     and (select role from public.group_members
           where group_id = p_group_id and user_id = p_user_id) in ('owner', 'admin') then
    raise exception 'Admins cannot remove owners or other admins' using errcode = '42501';
  end if;

  select net into v_net from public.group_balances(p_group_id) where user_id = p_user_id;

  if coalesce(v_net, 0) <> 0 then
    raise exception 'Settle this member''s balance before removing them' using errcode = '23514';
  end if;

  delete from public.group_members where group_id = p_group_id and user_id = p_user_id;
end;
$$;

-- =============================================================================
-- 6. TRIGGERS
-- =============================================================================

-- ── keep updated_at honest ──────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch before update on public.profiles
  for each row execute function public.touch_updated_at();
create trigger groups_touch before update on public.groups
  for each row execute function public.touch_updated_at();
create trigger expenses_touch before update on public.expenses
  for each row execute function public.touch_updated_at();

-- ── a profile for every auth user ───────────────────────────────────────────
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    new.email,
    new.raw_user_meta_data->>'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── the creator of a group is its owner ─────────────────────────────────────
create or replace function public.handle_new_group()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.created_by, 'owner')
  on conflict do nothing;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  values (new.id, new.created_by, 'group_created', new.name, '/groups/' || new.id);

  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- ── keep the ledger in step with its sources ────────────────────────────────
-- These exist so the ledger stays correct even for writes that bypass the
-- RPCs (a manual fix in the SQL editor, a future admin tool, a data import).
create or replace function public.sync_expense_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_expense_ledger(
    case when tg_op = 'DELETE' then old.expense_id else new.expense_id end
  );
  return null;
end;
$$;

create trigger expense_payments_sync
  after insert or update or delete on public.expense_payments
  for each row execute function public.sync_expense_ledger();

create trigger expense_participants_sync
  after insert or update or delete on public.expense_participants
  for each row execute function public.sync_expense_ledger();

create or replace function public.sync_expense_row_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_expense_ledger(new.id);
  return null;
end;
$$;

create trigger expenses_sync
  after update of amount, split_method, deleted_at on public.expenses
  for each row execute function public.sync_expense_row_ledger();

create or replace function public.sync_settlement_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.rebuild_settlement_ledger(new.id);
  return null;
end;
$$;

create trigger settlements_sync
  after insert or update of amount, deleted_at on public.settlements
  for each row execute function public.sync_settlement_ledger();

-- ── the zero-sum invariant, enforced by the database ────────────────────────
-- Deferred to commit so intermediate states inside a transaction (an expense
-- inserted before its participants exist) are allowed, while an unbalanced
-- *committed* state is impossible.
create or replace function public.assert_ledger_balanced()
returns trigger
language plpgsql
as $$
declare
  v_source_id uuid := coalesce(new.source_id, old.source_id);
  v_source_type public.ledger_source := coalesce(new.source_type, old.source_type);
  v_sum bigint;
begin
  select coalesce(sum(amount), 0) into v_sum
    from public.ledger_entries
   where source_type = v_source_type and source_id = v_source_id;

  if v_sum <> 0 then
    raise exception
      'Ledger for % % does not balance: sum is %, expected 0', v_source_type, v_source_id, v_sum
      using errcode = '23514';
  end if;

  return null;
end;
$$;

create constraint trigger ledger_entries_balanced
  after insert or update or delete on public.ledger_entries
  deferrable initially deferred
  for each row execute function public.assert_ledger_balanced();

-- =============================================================================
-- 7. ROW LEVEL SECURITY
--
-- Enabled on every table. The shape is always the same: you can see a row if
-- you are a member of the group it belongs to, and you can change it only if
-- your role permits. Nothing relies on the frontend.
-- =============================================================================

alter table public.profiles             enable row level security;
alter table public.groups               enable row level security;
alter table public.group_members        enable row level security;
alter table public.expenses             enable row level security;
alter table public.expense_payments     enable row level security;
alter table public.expense_participants enable row level security;
alter table public.settlements          enable row level security;
alter table public.ledger_entries       enable row level security;
alter table public.activity_logs        enable row level security;
alter table public.notifications        enable row level security;
alter table public.currencies           enable row level security;

-- ── currencies: a public lookup table ───────────────────────────────────────
create policy currencies_read on public.currencies
  for select to authenticated using (true);

-- ── profiles ────────────────────────────────────────────────────────────────
-- You can see yourself, and anyone you share a group with — you need their
-- name to render a balance. You can only ever modify your own row.
create policy profiles_select on public.profiles
  for select to authenticated
  using (
    id = auth.uid()
    or exists (
      select 1
        from public.group_members mine
        join public.group_members theirs on theirs.group_id = mine.group_id
       where mine.user_id = auth.uid() and theirs.user_id = profiles.id
    )
  );

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- ── groups ──────────────────────────────────────────────────────────────────
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id));

create policy groups_insert on public.groups
  for insert to authenticated
  with check (created_by = auth.uid());

create policy groups_update on public.groups
  for update to authenticated
  using (public.group_role_of(id) = 'owner')
  with check (public.group_role_of(id) = 'owner');

create policy groups_delete on public.groups
  for delete to authenticated
  using (public.group_role_of(id) = 'owner');

-- ── group_members ───────────────────────────────────────────────────────────
create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    -- Owners and admins may add people. The very first row (the creator
    -- becoming owner) is inserted by a SECURITY DEFINER trigger, which is not
    -- subject to this policy.
    public.can_manage_members(group_id)
  );

create policy group_members_update on public.group_members
  for update to authenticated
  using (public.can_manage_members(group_id))
  with check (public.can_manage_members(group_id));

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    -- Admins can remove people; anyone can remove themselves. The balance
    -- check lives in remove_group_member().
    public.can_manage_members(group_id) or user_id = auth.uid()
  );

-- ── expenses ────────────────────────────────────────────────────────────────
create policy expenses_select on public.expenses
  for select to authenticated
  using (public.is_group_member(group_id));

create policy expenses_insert on public.expenses
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy expenses_update on public.expenses
  for update to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or public.can_manage_members(group_id))
  )
  with check (public.is_group_member(group_id));

-- No delete policy: expenses are soft-deleted through delete_expense(), so a
-- hard DELETE is never permitted and history cannot be destroyed.

-- ── expense_payments / expense_participants ─────────────────────────────────
-- Visible to group members; writable only by whoever may edit the parent
-- expense. Both check membership through the expense they hang off.
create policy expense_payments_select on public.expense_payments
  for select to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_payments.expense_id and public.is_group_member(e.group_id)
  ));

create policy expense_payments_write on public.expense_payments
  for all to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_payments.expense_id
       and public.is_group_member(e.group_id)
       and (e.created_by = auth.uid() or public.can_manage_members(e.group_id))
  ))
  with check (exists (
    select 1 from public.expenses e
     where e.id = expense_payments.expense_id and public.is_group_member(e.group_id)
  ));

create policy expense_participants_select on public.expense_participants
  for select to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_participants.expense_id and public.is_group_member(e.group_id)
  ));

create policy expense_participants_write on public.expense_participants
  for all to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_participants.expense_id
       and public.is_group_member(e.group_id)
       and (e.created_by = auth.uid() or public.can_manage_members(e.group_id))
  ))
  with check (exists (
    select 1 from public.expenses e
     where e.id = expense_participants.expense_id and public.is_group_member(e.group_id)
  ));

-- ── settlements ─────────────────────────────────────────────────────────────
create policy settlements_select on public.settlements
  for select to authenticated
  using (public.is_group_member(group_id));

create policy settlements_insert on public.settlements
  for insert to authenticated
  with check (public.is_group_member(group_id) and created_by = auth.uid());

create policy settlements_update on public.settlements
  for update to authenticated
  using (
    public.is_group_member(group_id)
    and (created_by = auth.uid() or public.can_manage_members(group_id))
  )
  with check (public.is_group_member(group_id));

-- ── ledger_entries ──────────────────────────────────────────────────────────
-- Read-only to clients. There is deliberately no INSERT, UPDATE or DELETE
-- policy: the ledger is derived, and the only things that may write to it are
-- the SECURITY DEFINER rebuild functions.
create policy ledger_entries_select on public.ledger_entries
  for select to authenticated
  using (public.is_group_member(group_id));

-- ── activity_logs ───────────────────────────────────────────────────────────
create policy activity_logs_select on public.activity_logs
  for select to authenticated
  using (public.is_group_member(group_id));

-- ── notifications ───────────────────────────────────────────────────────────
create policy notifications_select on public.notifications
  for select to authenticated
  using (user_id = auth.uid());

create policy notifications_update on public.notifications
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- =============================================================================
-- 8. GRANTS
-- =============================================================================

grant usage on schema public to authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update on public.groups, public.group_members, public.expenses,
  public.expense_payments, public.expense_participants, public.settlements,
  public.profiles, public.notifications to authenticated;
grant delete on public.group_members to authenticated;

grant execute on all functions in schema public to authenticated;

-- The ledger is never client-writable, whatever the policies say.
revoke insert, update, delete on public.ledger_entries from authenticated;
revoke insert, update, delete on public.activity_logs from authenticated;
