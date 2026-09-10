-- =============================================================================
-- UpSplit - complete database setup
--
-- ONE FILE. Paste the whole thing into the Supabase SQL Editor and run it.
-- Safe to re-run: it drops and rebuilds everything from scratch every time.
--
-- WARNING  Part 0 drops the entire `public` schema. Every table and all its
--          data goes. Run this on a development project only.
--          It does NOT touch auth.users, so your logins survive.
--
-- What it does, in order:
--
--   Part 0   Teardown - drop the public schema so this file is re-runnable
--   Part 1   Enums and the currencies lookup
--   Part 2   The 11 tables, their keys, constraints and indexes
--   Part 3   Helper functions (membership checks, the allocator)
--   Part 4   Read RPCs (balances, pairwise, settlement suggestions)
--   Part 5   Write RPCs (create/update/delete expense, record settlement)
--   Part 6   Triggers, including the deferred zero-sum constraint
--   Part 7   Row Level Security policies
--   Part 8   Grants
--   Part 9   Backfill profiles for accounts already in auth.users
--   Part 10  Demo seed data (skipped automatically if the accounts are absent)
--   Part 11  Verification - the four queries at the very bottom must all
--            return ZERO rows
--
-- Money is BIGINT minor units (paisa/cents) everywhere. No floats, ever.
--
-- The authoritative accounting rule, enforced by a deferred constraint:
--
--     for every expense and every settlement,
--     SUM(ledger_entries.amount) = 0
-- =============================================================================


-- =============================================================================
-- PART 0. TEARDOWN
--
-- Makes this file idempotent. Without it, a second run fails on the first
-- `create type` that already exists.
-- =============================================================================

-- The one object that does not live in the public schema.
drop trigger if exists on_auth_user_created on auth.users;

drop schema if exists public cascade;
create schema public;

-- Restore the grants Supabase expects on a fresh public schema.
grant usage on schema public to postgres, anon, authenticated, service_role;
grant all   on schema public to postgres, service_role;

alter default privileges in schema public
  grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to postgres, anon, authenticated, service_role;


-- On Supabase pgcrypto is already installed, in the `extensions` schema, so
-- this is a no-op there rather than a way to get it into `public`. Any
-- SECURITY DEFINER function calling a pgcrypto function must therefore list
-- `extensions` in its search_path. See create_invite_link().
create extension if not exists "pgcrypto";


-- Invitation and link tokens: 32 bytes of CSPRNG rendered base64url. Defined
-- up here because group_invitations.token defaults to it, so it has to exist
-- before that table is created.
create or replace function public.new_invite_token()
returns text
language sql
volatile
set search_path = public, extensions
as $$
  select replace(replace(replace(
    encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
$$;

-- =============================================================================
-- 1. ENUMS
-- =============================================================================

create type public.group_role as enum ('owner', 'admin', 'member');

create type public.expense_category as enum (
  'food', 'transport', 'shopping', 'bills', 'entertainment',
  'travel', 'accommodation', 'groceries', 'health', 'education', 'other'
);

create type public.split_method as enum ('equal', 'exact');

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
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  -- Accounts are anonymised rather than deleted: the expenses a person created
  -- are still referenced by groups that need them, and removing the row would
  -- change other people's balances. See delete_my_account().
  deleted_at          timestamptz
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
--   equal -> ignored (null)
--   exact -> the person's share, in minor units
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

-- ── group_invitations ───────────────────────────────────────────────────────
-- An invitation addressed to an email that has no account yet.
--
-- Someone who already has an account is added to the group immediately and
-- never appears here. This table exists only to remember the gap between
-- "you were invited" and "you signed up", so that signing up joins you to the
-- groups already waiting for you.
create table public.group_invitations (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid        not null references public.groups (id) on delete cascade,
  email       text        not null check (length(btrim(email)) between 3 and 320),
  invited_by  uuid        not null references public.profiles (id) on delete cascade,
  -- What gets mailed. Holding it is what authorises the join, so it is random
  -- rather than derived from the id, and it expires.
  token       text        not null unique default public.new_invite_token(),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '14 days'),
  accepted_at timestamptz
);

-- One live invitation per address per group. Re-inviting is a no-op, not a
-- duplicate row.
create unique index group_invitations_pending_idx
  on public.group_invitations (group_id, lower(email))
  where accepted_at is null;

-- The signup path asks "what is waiting for this address?", so that lookup is
-- indexed and kept small by excluding already-accepted rows.
create index group_invitations_email_idx
  on public.group_invitations (lower(email))
  where accepted_at is null;

-- ── group_invite_links ──────────────────────────────────────────────────────
-- One shareable link per group. Anyone holding it can join until an admin
-- rotates or revokes it, or it expires.
--
-- group_id is the primary key, which is what enforces "one live link per
-- group" — rotating a link replaces the row rather than accumulating dead
-- tokens that still work.
create table public.group_invite_links (
  group_id   uuid primary key references public.groups (id) on delete cascade,
  token      text        not null unique,
  created_by uuid        not null references public.profiles (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz,
  revoked_at timestamptz
);

-- ── expense_comments ────────────────────────────────────────────────────────
-- A thread per expense, so a charge can be queried in place.
create table public.expense_comments (
  id         uuid primary key default gen_random_uuid(),
  expense_id uuid        not null references public.expenses (id) on delete cascade,
  author_id  uuid        not null references public.profiles (id) on delete restrict,
  body       text        not null check (length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

-- The thread is always read oldest-first for one expense.
create index expense_comments_expense_idx
  on public.expense_comments (expense_id, created_at)
  where deleted_at is null;

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
  -- coalesce is load-bearing. group_role_of() returns NULL for somebody who is
  -- not in the group at all, and `NULL in ('owner','admin')` is NULL, not
  -- false. A caller writing the natural guard
  --
  --     if not public.can_manage_members(g) then raise ...
  --
  -- would then evaluate `if not NULL`, which is `if NULL`, which does not take
  -- the branch: the check would pass for every non-member. RLS policies are
  -- unaffected, because a NULL USING expression filters the row, but a plpgsql
  -- guard is not a policy.
  select coalesce(public.group_role_of(p_group_id) in ('owner', 'admin'), false);
$$;

-- ── notify_user ─────────────────────────────────────────────────────────────
-- Every notification in the app goes through here, so "tell this person
-- something" is one call rather than an insert plus a preference check plus an
-- email queue repeated in five RPCs.
--
-- The in-app notification is always written. The email is queued only if the
-- recipient still wants email and has not been anonymised by
-- delete_my_account().
create or replace function public.notify_user(
  p_user_id  uuid,
  p_group_id uuid,
  p_kind     public.notification_kind,
  p_title    text,
  p_body     text,
  p_href     text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, group_id, kind, title, body, href)
  values (p_user_id, p_group_id, p_kind, p_title, p_body, p_href);
end;
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

  -- An equal split weights everyone the same; an exact split uses the stated
  -- amounts as the weights, which makes both methods one code path.
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

-- Creating a group has to be one statement, for two reasons.
--
-- First, the caller is not yet a member of the group they are creating: the
-- on_group_created trigger adds them as owner, and an AFTER INSERT trigger
-- fires at the end of the statement. So `insert ... returning *` from a client
-- fails the groups_select policy, because is_group_member() is still false for
-- the row being returned.
--
-- Second, a group with no members is not a valid group. Inserting the group
-- and its members as two client round-trips means a failure between them
-- leaves exactly that.
--
-- SECURITY DEFINER sidesteps the first and the single transaction the second.
create or replace function public.create_group(
  p_name        text,
  p_currency    text,
  p_icon        text,
  p_color       text,
  p_description text default null,
  p_member_ids  uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_group_id uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  insert into public.groups (name, description, currency, icon, color, created_by)
  values (
    btrim(p_name),
    nullif(btrim(coalesce(p_description, '')), ''),
    p_currency,
    p_icon,
    p_color,
    v_actor
  )
  returning id into v_group_id;

  -- The trigger has already made the creator the owner; everyone else joins
  -- as a member. Anyone named who does not have a profile fails the foreign
  -- key, which is the correct outcome - you cannot add a stranger.
  insert into public.group_members (group_id, user_id, role)
  select v_group_id, m, 'member'
    from unnest(coalesce(p_member_ids, '{}'::uuid[])) as m
   where m <> v_actor
  on conflict (group_id, user_id) do nothing;

  return v_group_id;
end;
$$;

-- Inviting someone has to be a function, because RLS on `profiles`
-- deliberately hides anyone you do not already share a group with. A client
-- looking someone up by email therefore always finds nothing, which made it
-- impossible to grow a group past its creator.
--
-- SECURITY DEFINER lets the lookup see every profile, but it is deliberately
-- narrow: an EXACT, case-insensitive email match. There is no prefix or
-- wildcard search, so this cannot be used to enumerate the user base - you
-- must already know the address. Only owners and admins may call it, and it
-- can only ever add a plain member.
--
-- Returns one of three outcomes, so the UI can say something true:
--   {"status": "added",          "user_id": ...}  they had an account
--   {"status": "already_member", "user_id": ...}  nothing to do
--   {"status": "pending",        "email": ...}    invitation stored for signup
create or replace function public.invite_to_group(
  p_group_id uuid,
  p_email    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email    text := lower(btrim(p_email));
  v_user_id  uuid;
  v_name     text;
  v_group    text;
  v_inviter  text;
  v_token    text;
begin
  -- Any member may invite. A shared-expense group is a group of people who
  -- already know each other, and making everyone wait on an admin to add the
  -- friend who just joined the trip is friction with no safety benefit:
  -- whoever is invited sees the same ledger either way. Removing people is
  -- still admin-only, because that one is destructive.
  if not public.is_group_member(p_group_id) then
    raise exception 'Only people in this group can invite others' using errcode = '42501';
  end if;

  if v_email !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' then
    raise exception 'That does not look like an email address' using errcode = '22023';
  end if;

  select name into v_group from public.groups where id = p_group_id;

  select full_name into v_inviter from public.profiles where id = auth.uid();
  v_inviter := coalesce(v_inviter, 'Someone');

  select id, full_name into v_user_id, v_name
    from public.profiles
   where lower(email) = v_email
     and deleted_at is null;

  -- -- they already have an account ------------------------------------------
  if v_user_id is not null then
    if exists (
      select 1 from public.group_members
       where group_id = p_group_id and user_id = v_user_id
    ) then
      return jsonb_build_object('status', 'already_member', 'user_id', v_user_id);
    end if;

    insert into public.group_members (group_id, user_id, role)
    values (p_group_id, v_user_id, 'member');

    insert into public.activity_logs (group_id, actor_id, action, subject, href)
    values (p_group_id, auth.uid(), 'member_joined', v_name,
            '/groups/' || p_group_id || '/members');

    -- In-app notification, plus an outbox row if they accept email.
    perform public.notify_user(
      v_user_id, p_group_id, 'group',
      v_inviter || ' added you to ' || v_group,
      'You now share expenses with everyone in ' || v_group || '.',
      '/groups/' || p_group_id
    );

    update public.group_invitations
       set accepted_at = now()
     where group_id = p_group_id and lower(email) = v_email and accepted_at is null;

    return jsonb_build_object(
      'status',       'added',
      'user_id',      v_user_id,
      'email',        v_email,
      'group_name',   v_group,
      'inviter_name', v_inviter
    );
  end if;

  -- -- no account yet: store it, hand them a link -----------------------------
  insert into public.group_invitations (group_id, email, invited_by)
  values (p_group_id, v_email, auth.uid())
  on conflict (group_id, lower(email)) where accepted_at is null
  do update set invited_by = excluded.invited_by,
                created_at = now(),
                expires_at = now() + interval '14 days'
  returning token into v_token;

  -- Nothing is emailed. The token goes back to whoever did the inviting, and
  -- they send the /invite/<token> link themselves.
  return jsonb_build_object(
    'status',       'pending',
    'email',        v_email,
    'token',        v_token,
    'group_name',   v_group,
    'inviter_name', v_inviter
  );
end;
$$;


-- What a stranger holding an invitation token may see. Granted to anon,
-- because the recipient has no account yet.
create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_inv record;
begin
  select i.group_id, i.email, i.accepted_at, i.expires_at,
         g.name as group_name, g.currency,
         p.full_name as inviter_name
    into v_inv
    from public.group_invitations i
    join public.groups g        on g.id = i.group_id
    left join public.profiles p on p.id = i.invited_by
   where i.token = p_token;

  if not found then
    return jsonb_build_object('status', 'invalid');
  end if;

  if v_inv.accepted_at is not null then
    return jsonb_build_object('status', 'accepted', 'group_name', v_inv.group_name);
  end if;

  if v_inv.expires_at < now() then
    return jsonb_build_object('status', 'expired', 'group_name', v_inv.group_name);
  end if;

  return jsonb_build_object(
    'status',       'valid',
    'group_id',     v_inv.group_id,
    'group_name',   v_inv.group_name,
    'currency',     v_inv.currency,
    'inviter_name', coalesce(v_inv.inviter_name, 'Someone'),
    'email',        v_inv.email,
    'member_count', (select count(*) from public.group_members m
                      where m.group_id = v_inv.group_id)
  );
end;
$$;


-- Joins the group a token points at, for someone who already has a session.
create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_inv   record;
  v_name  text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select id, group_id, email, invited_by, accepted_at, expires_at
    into v_inv
    from public.group_invitations
   where token = p_token;

  if not found then
    raise exception 'That invitation link is not valid' using errcode = 'P0002';
  end if;

  -- Already in the group, by whatever route: succeed quietly and send them in.
  if exists (
    select 1 from public.group_members
     where group_id = v_inv.group_id and user_id = v_actor
  ) then
    update public.group_invitations
       set accepted_at = coalesce(accepted_at, now())
     where id = v_inv.id;
    return v_inv.group_id;
  end if;

  if v_inv.accepted_at is not null then
    raise exception 'That invitation has already been used' using errcode = 'P0002';
  end if;

  if v_inv.expires_at < now() then
    raise exception 'That invitation has expired. Ask for a new one.'
      using errcode = 'P0002';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_inv.group_id, v_actor, 'member');

  update public.group_invitations set accepted_at = now() where id = v_inv.id;

  select full_name into v_name from public.profiles where id = v_actor;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  values (v_inv.group_id, v_actor, 'member_joined', coalesce(v_name, 'Someone'),
          '/groups/' || v_inv.group_id || '/members');

  -- Tell whoever invited them that it worked.
  perform public.notify_user(
    v_inv.invited_by, v_inv.group_id, 'group',
    coalesce(v_name, 'Someone') || ' joined ' ||
      (select name from public.groups where id = v_inv.group_id),
    'They accepted the invitation you sent to ' || v_inv.email || '.',
    '/groups/' || v_inv.group_id || '/members'
  );

  return v_inv.group_id;
end;
$$;

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
  v_exact_total bigint;
  v_involved   integer;
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

  -- R2: a group of one has nobody to share with.
  if (select count(*) from public.group_members where group_id = p_group_id) < 2 then
    raise exception 'Add someone else to this group before recording an expense'
      using errcode = '23514';
  end if;

  -- R1: an expense is by definition shared. One person paying for themselves
  -- nets to zero and produces no ledger entries at all, so it is rejected
  -- outright rather than silently recorded as something that does nothing.
  --
  -- Payers and participants are counted together, which keeps the
  -- payer-who-is-not-a-participant case working: paying for someone else is
  -- two people even though the split names one.
  select count(distinct t.u) into v_involved
    from (
      select (e->>'user_id')::uuid as u from jsonb_array_elements(p_payments) e
      union all
      select (e->>'user_id')::uuid from jsonb_array_elements(p_participants) e
    ) t;

  if v_involved < 2 then
    raise exception 'An expense has to involve at least two people'
      using errcode = '23514';
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
  perform public.notify_user(
    gm.user_id, p_group_id, 'expense',
    (select full_name from public.profiles where id = v_actor) || ' added an expense',
    btrim(p_description),
    '/groups/' || p_group_id || '/expenses/' || v_expense_id
  )
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
  v_created_by uuid;
  v_paid_total bigint;
  v_exact_total bigint;
  v_involved   integer;
  v_actor uuid := auth.uid();
begin
  select group_id, created_by into v_group, v_created_by
    from public.expenses
   where id = p_expense_id and deleted_at is null;

  if v_group is null then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_group) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;

  -- Matches the expenses_update policy and delete_expense(). Without this the
  -- RPC is more permissive than the policy it bypasses, and any member of the
  -- group could rewrite anyone else's expense.
  if v_created_by <> v_actor and not public.can_manage_members(v_group) then
    raise exception 'Only the person who added this expense, or a group admin, can edit it'
      using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'Amount must be greater than zero' using errcode = '22003';
  end if;

  -- R1, as create_expense applies it. An edit must not be able to reduce an
  -- expense to one person.
  select count(distinct t.u) into v_involved
    from (
      select (e->>'user_id')::uuid as u from jsonb_array_elements(p_payments) e
      union all
      select (e->>'user_id')::uuid from jsonb_array_elements(p_participants) e
    ) t;

  if v_involved < 2 then
    raise exception 'An expense has to involve at least two people'
      using errcode = '23514';
  end if;

  -- Every payer and participant must belong to the group. create_expense has
  -- always checked this; without the same check here, an edit could attach a
  -- debt to a stranger by passing their user id.
  if exists (
    select 1 from jsonb_array_elements(p_payments) e
     where not exists (
       select 1 from public.group_members gm
        where gm.group_id = v_group and gm.user_id = (e->>'user_id')::uuid
     )
  ) then
    raise exception 'A payer is not a member of this group' using errcode = '42501';
  end if;

  if exists (
    select 1 from jsonb_array_elements(p_participants) e
     where not exists (
       select 1 from public.group_members gm
        where gm.group_id = v_group and gm.user_id = (e->>'user_id')::uuid
     )
  ) then
    raise exception 'A participant is not a member of this group' using errcode = '42501';
  end if;

  select coalesce(sum((e->>'amount')::bigint), 0) into v_paid_total
    from jsonb_array_elements(p_payments) e;

  if v_paid_total <> p_amount then
    raise exception 'Payments must add up to the expense total' using errcode = '23514';
  end if;

  if jsonb_array_length(p_participants) = 0 then
    raise exception 'An expense needs at least one participant' using errcode = '23514';
  end if;

  if p_split_method = 'exact' then
    select coalesce(sum((e->>'value')::bigint), 0) into v_exact_total
      from jsonb_array_elements(p_participants) e;
    if v_exact_total <> p_amount then
      raise exception 'Exact amounts must add up to the expense total' using errcode = '23514';
    end if;
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

  perform public.notify_user(
    gm.user_id, p_group_id, 'settlement', 'A settlement was recorded',
    'Balances in the group have been updated',
    '/groups/' || p_group_id || '/balances'
  )
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

  -- `is distinct from`, not `<>`: NULL <> 'owner' is NULL, so the raise would
  -- be skipped for somebody with no role in this group at all.
  if public.group_role_of(p_group_id) is distinct from 'owner'
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

-- ── comments ────────────────────────────────────────────────────────────────
-- An RPC rather than a bare insert so posting a comment also notifies the
-- other people on the expense, in the same transaction.
create or replace function public.add_expense_comment(
  p_expense_id uuid,
  p_body       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_expense public.expenses%rowtype;
  v_name    text;
  v_id      uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_expense from public.expenses
   where id = p_expense_id and deleted_at is null;

  if not found then
    raise exception 'That expense no longer exists' using errcode = 'P0002';
  end if;

  if not public.is_group_member(v_expense.group_id) then
    raise exception 'You are not a member of this group' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_body, ''))) = 0 then
    raise exception 'A comment cannot be empty' using errcode = '23514';
  end if;

  insert into public.expense_comments (expense_id, author_id, body)
  values (p_expense_id, v_actor, btrim(p_body))
  returning id into v_id;

  select full_name into v_name from public.profiles where id = v_actor;

  -- Everyone involved in the expense, plus anyone already in the thread,
  -- minus the author. A comment is only interesting to people it concerns,
  -- so this deliberately does not notify the whole group.
  perform public.notify_user(
    t.user_id, v_expense.group_id, 'expense',
    v_name || ' commented on ' || v_expense.description,
    btrim(p_body),
    '/groups/' || v_expense.group_id || '/expenses/' || p_expense_id
  )
    from (
      select user_id from public.expense_payments where expense_id = p_expense_id
      union
      select user_id from public.expense_participants where expense_id = p_expense_id
      union
      select author_id from public.expense_comments
       where expense_id = p_expense_id and deleted_at is null
    ) t
   where t.user_id <> v_actor;

  return v_id;
end;
$$;

-- ── invite links ────────────────────────────────────────────────────────────
-- Creates or rotates the group's shareable link. Rotating replaces the row, so
-- the previous token stops working immediately rather than lingering.
create or replace function public.create_invite_link(
  p_group_id   uuid,
  p_expires_at timestamptz default null
)
returns text
language plpgsql
security definer
-- `extensions` is on the path because gen_random_bytes() lives in pgcrypto,
-- which Supabase installs there rather than in public. Unlike
-- gen_random_uuid(), it is not a core builtin, so a public-only path cannot
-- resolve it. Listing public first still pins resolution for the rest.
set search_path = public, extensions
as $$
declare
  v_token text;
begin
  if not public.can_manage_members(p_group_id) then
    raise exception 'Only owners and admins can create an invite link'
      using errcode = '42501';
  end if;

  -- 32 bytes of CSPRNG, URL-safe. Long enough that guessing is not a threat.
  v_token := replace(replace(replace(
    encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');

  insert into public.group_invite_links (group_id, token, created_by, expires_at)
  values (p_group_id, v_token, auth.uid(), p_expires_at)
  on conflict (group_id) do update
    set token      = excluded.token,
        created_by = excluded.created_by,
        created_at = now(),
        expires_at = excluded.expires_at,
        revoked_at = null;

  return v_token;
end;
$$;

create or replace function public.revoke_invite_link(p_group_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.can_manage_members(p_group_id) then
    raise exception 'Only owners and admins can revoke an invite link'
      using errcode = '42501';
  end if;

  update public.group_invite_links
     set revoked_at = now()
   where group_id = p_group_id and revoked_at is null;
end;
$$;

-- Joining by link. SECURITY DEFINER because the caller is by definition not
-- yet a member, so no policy on group_members or groups would let them see the
-- group they are about to join.
--
-- Takes the token and nothing else: a caller cannot name a group they were not
-- given a link to.
create or replace function public.accept_invite_link(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_link  public.group_invite_links%rowtype;
  v_name  text;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select * into v_link from public.group_invite_links where token = btrim(p_token);

  if not found or v_link.revoked_at is not null then
    raise exception 'That invite link is no longer valid' using errcode = 'P0002';
  end if;

  if v_link.expires_at is not null and v_link.expires_at < now() then
    raise exception 'That invite link has expired' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.group_members
     where group_id = v_link.group_id and user_id = v_actor
  ) then
    return v_link.group_id;
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (v_link.group_id, v_actor, 'member');

  select full_name into v_name from public.profiles where id = v_actor;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  values (v_link.group_id, v_actor, 'member_joined', v_name,
          '/groups/' || v_link.group_id || '/members');

  return v_link.group_id;
end;
$$;

-- ── ownership ───────────────────────────────────────────────────────────────
-- The one-owner-per-group index means a role change cannot promote a second
-- owner; handing the group over has to demote and promote in one statement.
create or replace function public.transfer_group_ownership(
  p_group_id uuid,
  p_user_id  uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
begin
  -- `is distinct from`, not `<>`: see remove_group_member.
  if public.group_role_of(p_group_id) is distinct from 'owner' then
    raise exception 'Only the owner can hand over a group' using errcode = '42501';
  end if;

  if p_user_id = v_actor then
    return;
  end if;

  if not exists (
    select 1 from public.group_members
     where group_id = p_group_id and user_id = p_user_id
  ) then
    raise exception 'That person is not a member of this group' using errcode = 'P0002';
  end if;

  -- Demote first: the partial unique index permits only one owner at a time.
  update public.group_members set role = 'admin'
   where group_id = p_group_id and user_id = v_actor;

  update public.group_members set role = 'owner'
   where group_id = p_group_id and user_id = p_user_id;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  select p_group_id, v_actor, 'member_role_changed', p.full_name,
         '/groups/' || p_group_id || '/members'
    from public.profiles p where p.id = p_user_id;
end;
$$;

-- ── account deletion ────────────────────────────────────────────────────────
-- Anonymise rather than delete. The expenses this person created are still
-- referenced by groups that need them, and removing the rows would silently
-- change other members' balances.
--
-- Refuses while any money is outstanding, and refuses to abandon a group that
-- still has other people in it without an owner.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor    uuid := auth.uid();
  v_unsettled int;
  v_owned     int;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  select count(*) into v_unsettled
    from public.group_members gm
    cross join lateral public.group_balances(gm.group_id) b
   where gm.user_id = v_actor and b.user_id = v_actor and b.net <> 0;

  if v_unsettled > 0 then
    raise exception 'Settle every balance before deleting your account'
      using errcode = '23514';
  end if;

  -- Groups this person owns that other people are still in.
  select count(*) into v_owned
    from public.group_members mine
   where mine.user_id = v_actor
     and mine.role = 'owner'
     and exists (
       select 1 from public.group_members others
        where others.group_id = mine.group_id and others.user_id <> v_actor
     );

  if v_owned > 0 then
    raise exception 'Hand over the groups you own before deleting your account'
      using errcode = '23514';
  end if;

  -- A group where nobody else remains has no reason to outlive the account,
  -- and deleting it affects no one else's books.
  delete from public.groups g
   where g.created_by = v_actor
     and not exists (
       select 1 from public.group_members m
        where m.group_id = g.id and m.user_id <> v_actor
     );

  delete from public.group_members where user_id = v_actor;

  update public.profiles
     set full_name  = 'Deleted user',
         email      = 'deleted+' || v_actor::text || '@upsplit.invalid',
         avatar_url = null,
         deleted_at = now()
   where id = v_actor;
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
declare
  v_email text := lower(btrim(coalesce(new.email, '')));
  v_name  text;
begin
  -- Anonymous visitors have no address. They still need a profile, so they get
  -- a synthetic one: unique (the profiles email index demands it) and at a
  -- reserved domain that can never receive mail.
  if v_email = '' then
    insert into public.profiles (id, full_name, email)
    values (new.id, 'Guest', 'anon+' || new.id::text || '@upsplit.invalid')
    on conflict (id) do nothing;
    return new;
  end if;

  -- Every provider names these differently. The signup form sends full_name;
  -- Google sends name and picture. Without both spellings a Google account
  -- lands with the email prefix as its display name and no photo.
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data->>'name'), ''),
    split_part(v_email, '@', 1)
  );

  insert into public.profiles (id, full_name, email, avatar_url)
  values (
    new.id, v_name, new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data->>'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data->>'picture'), '')
    )
  )
  on conflict (id) do nothing;

  -- Claim every group that was waiting for this address.
  insert into public.group_members (group_id, user_id, role)
  select i.group_id, new.id, 'member'
    from public.group_invitations i
   where lower(i.email) = v_email
     and i.accepted_at is null
     and i.expires_at > now()
  on conflict (group_id, user_id) do nothing;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  select i.group_id, new.id, 'member_joined', v_name,
         '/groups/' || i.group_id || '/members'
    from public.group_invitations i
   where lower(i.email) = v_email
     and i.accepted_at is null
     and i.expires_at > now();

  -- Expired invitations are settled too. They were not claimed above, so
  -- leaving them pending would let a later re-invite collide with a row
  -- that can never be redeemed.
  update public.group_invitations
     set accepted_at = now()
   where lower(email) = v_email
     and accepted_at is null;

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
  v_source_id   uuid;
  v_source_type public.ledger_source;
  v_sum bigint;
begin
  -- NEW is unassigned on DELETE and OLD is unassigned on INSERT, so the
  -- source has to be picked by TG_OP rather than coalesced: touching the
  -- wrong one raises "record is not assigned yet".
  if tg_op = 'DELETE' then
    v_source_id   := old.source_id;
    v_source_type := old.source_type;
  else
    v_source_id   := new.source_id;
    v_source_type := new.source_type;
  end if;

  select coalesce(sum(amount), 0) into v_sum
    from public.ledger_entries
   where source_type = v_source_type and source_id = v_source_id;

  if v_sum <> 0 then
    raise exception
      'Ledger for % % does not balance: sum is %, expected 0', v_source_type, v_source_id, v_sum
      using errcode = '23514';
  end if;

  -- An UPDATE that moved a row between sources leaves the *old* source needing
  -- a check too.
  if tg_op = 'UPDATE'
     and (old.source_id <> new.source_id or old.source_type <> new.source_type) then
    select coalesce(sum(amount), 0) into v_sum
      from public.ledger_entries
     where source_type = old.source_type and source_id = old.source_id;

    if v_sum <> 0 then
      raise exception
        'Ledger for % % does not balance: sum is %, expected 0',
        old.source_type, old.source_id, v_sum
        using errcode = '23514';
    end if;
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
alter table public.group_invitations    enable row level security;
alter table public.group_invite_links   enable row level security;
alter table public.expense_comments     enable row level security;
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
    -- Owners and admins may add anyone, at any role.
    public.can_manage_members(group_id)
    -- Any member may add someone, but only as a `member`. The role check is
    -- load-bearing: without it a plain member could insert an `owner` row,
    -- which either collides with the single-owner index or hands out admin.
    or (public.is_group_member(group_id) and role = 'member')
    -- The very first row (the creator becoming owner) is inserted by a
    -- SECURITY DEFINER trigger, which is not subject to this policy.
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

-- ── group_invitations ───────────────────────────────────────────────────────
-- Members can see who has been invited to their group. There are deliberately
-- no write policies: invitations are created only by invite_to_group() and
-- closed only by the signup trigger, both SECURITY DEFINER.
create policy group_invitations_select on public.group_invitations
  for select to authenticated
  using (public.is_group_member(group_id));

-- ── group_invite_links ──────────────────────────────────────────────────────
-- Members can read their group's link so an admin can copy it. Creating,
-- rotating and revoking go through SECURITY DEFINER functions, so there are no
-- write policies — and accepting a link deliberately does not require SELECT,
-- because the person joining is not a member yet.
create policy group_invite_links_select on public.group_invite_links
  for select to authenticated
  using (public.is_group_member(group_id));

-- ── expense_comments ────────────────────────────────────────────────────────
-- Visible to the group. Posting goes through add_expense_comment() so the
-- thread's other participants get notified in the same transaction; the only
-- direct write a client may make is editing or retracting its own comment.
create policy expense_comments_select on public.expense_comments
  for select to authenticated
  using (exists (
    select 1 from public.expenses e
     where e.id = expense_comments.expense_id and public.is_group_member(e.group_id)
  ));

create policy expense_comments_update on public.expense_comments
  for update to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

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
grant execute on function public.create_group(text, text, text, text, text, uuid[])
  to authenticated;
grant execute on function public.invite_to_group(uuid, text) to authenticated;
grant execute on function public.add_expense_comment(uuid, text) to authenticated;
grant execute on function public.create_invite_link(uuid, timestamptz) to authenticated;
grant execute on function public.invitation_preview(text) to anon, authenticated;
grant execute on function public.accept_invitation(text) to authenticated;
grant execute on function public.revoke_invite_link(uuid) to authenticated;
grant execute on function public.accept_invite_link(text) to authenticated;
grant execute on function public.transfer_group_ownership(uuid, uuid) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Editing your own comment is the one direct write clients may make here.
grant update on public.expense_comments to authenticated;

-- The ledger is never client-writable, whatever the policies say.
revoke insert, update, delete on public.ledger_entries from authenticated;
revoke insert, update, delete on public.activity_logs from authenticated;

-- Invitations and links are created and closed only by SECURITY DEFINER
-- functions; comments are posted by one.
revoke insert, update, delete on public.group_invitations from authenticated;

-- The invitation token is the authorisation to join, so it is not readable by
-- clients at all. Only owners and admins may invite, but the SELECT policy
-- above lets any member of the group see its pending invitations, and without
-- this a plain member could lift a token and hand it to an outsider.
--
-- Table-level SELECT has to go first: a column-level revoke cannot carve a
-- hole out of a privilege held on the whole table. invite_to_group() returns
-- the token to the person who created it, and nothing in the app ever selects
-- from this table, so nothing loses anything it was using.
revoke select on public.group_invitations from anon, authenticated;
grant select (id, group_id, email, invited_by, created_at, expires_at, accepted_at)
  on public.group_invitations to authenticated;

revoke insert, update, delete on public.group_invite_links from authenticated;
revoke insert, delete on public.expense_comments from authenticated;


-- =============================================================================
-- 9. STORAGE — avatars
--
-- `storage.objects` is owned by supabase_storage_admin, so creating policies
-- on it can fail depending on the role running this script. The whole block is
-- therefore guarded: if it cannot be applied it reports what to click instead
-- of aborting a migration that is otherwise complete.
-- =============================================================================

do $storage$
begin
  insert into storage.buckets (id, name, public)
  values ('avatars', 'avatars', true)
  on conflict (id) do nothing;

  -- Anyone may read an avatar: the bucket is public, and an avatar is shown
  -- next to a name that group members can already see.
  begin
    execute $p$
      create policy avatars_public_read on storage.objects
        for select to public
        using (bucket_id = 'avatars')
    $p$;
  exception
    when duplicate_object then null;
  end;

  -- You may only write inside a folder named after your own user id, so one
  -- person can never overwrite another's avatar.
  begin
    execute $p$
      create policy avatars_own_write on storage.objects
        for all to authenticated
        using (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
        with check (
          bucket_id = 'avatars'
          and (storage.foldername(name))[1] = auth.uid()::text
        )
    $p$;
  exception
    when duplicate_object then null;
  end;

exception
  when insufficient_privilege then
    raise notice ' ';
    raise notice 'STORAGE SETUP SKIPPED - this role cannot alter storage.';
    raise notice 'Everything else was created. Add the bucket and policies by hand:';
    raise notice '  Storage -> New bucket -> name "avatars", Public';
    raise notice '  Storage -> avatars -> Policies';
    raise notice '    SELECT  to public         using bucket_id = ''avatars''';
    raise notice '    ALL     to authenticated  using bucket_id = ''avatars'' and';
    raise notice '            (storage.foldername(name))[1] = auth.uid()::text';
    raise notice ' ';
end
$storage$;


-- =============================================================================
-- 1. The dormant demo personas
--
-- Inserted directly into auth.users because they must satisfy the profiles
-- foreign key. `.invalid` is reserved by RFC 2606 and can never receive mail,
-- so these addresses cannot collide with a real user or be mailed by accident.
-- =============================================================================

do $demo$
declare
  v_persona record;
  v_id      uuid;
begin
  for v_persona in
    select * from (values
      ('demo-ali@upsplit.invalid',     'Ali Raza'),
      ('demo-shaheer@upsplit.invalid', 'Shaheer Khan'),
      ('demo-naveed@upsplit.invalid',  'Naveed Iqbal')
    ) as t(email, full_name)
  loop
    select id into v_id from auth.users where email = v_persona.email;

    if v_id is null then
      v_id := gen_random_uuid();

      insert into auth.users (
        instance_id, id, aud, role, email,
        encrypted_password, email_confirmed_at,
        created_at, updated_at,
        raw_app_meta_data, raw_user_meta_data
      ) values (
        '00000000-0000-0000-0000-000000000000', v_id, 'authenticated', 'authenticated',
        v_persona.email,
        -- Not a usable password: no plaintext hashes to this, so these
        -- accounts cannot be signed into.
        'demo-account-cannot-sign-in',
        now(), now(), now(),
        '{"provider":"email","providers":["email"]}'::jsonb,
        jsonb_build_object('full_name', v_persona.full_name)
      );
    end if;

    -- The trigger may already have made the profile; make sure the name is
    -- right either way.
    insert into public.profiles (id, full_name, email)
    values (v_id, v_persona.full_name, v_persona.email)
    on conflict (id) do update set full_name = excluded.full_name;
  end loop;
end
$demo$;




-- =============================================================================
-- 2. start_demo() - build this visitor's own workspace
--
-- Returns the group id to land on. Idempotent: calling it twice returns the
-- group already built rather than a second copy.
--
-- The numbers are chosen so that four people settle in exactly three transfers
-- rather than six, which is the claim the landing page makes:
--
--   net   Uzair +34,100 · Ali +3,100 · Shaheer −15,700 · Naveed −21,500  (= 0)
--   →     Naveed  → Uzair   Rs 21,500
--         Shaheer → Uzair   Rs 12,600
--         Shaheer → Ali     Rs  3,100
-- =============================================================================

create or replace function public.start_demo()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor   uuid := auth.uid();
  v_group   uuid;
  v_ali     uuid;
  v_shaheer uuid;
  v_naveed  uuid;
begin
  if v_actor is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  -- Already has one: send them back to it instead of building a second.
  select g.id into v_group
    from public.groups g
    join public.group_members m on m.group_id = g.id and m.user_id = v_actor
   where g.name = 'Hunza Weekend Trip'
   limit 1;

  if v_group is not null then
    return v_group;
  end if;

  select id into v_ali     from public.profiles where email = 'demo-ali@upsplit.invalid';
  select id into v_shaheer from public.profiles where email = 'demo-shaheer@upsplit.invalid';
  select id into v_naveed  from public.profiles where email = 'demo-naveed@upsplit.invalid';

  if v_ali is null or v_shaheer is null or v_naveed is null then
    raise exception 'The demo accounts are missing. Run docs/patches/002-demo.sql.'
      using errcode = 'P0002';
  end if;

  -- The landing page tells the souvenirs story as Uzair's, so the visitor
  -- takes that name while they are in the demo.
  update public.profiles
     set full_name = 'Uzair Ahmed'
   where id = v_actor and full_name = 'Guest';

  insert into public.groups (name, description, currency, icon, color, created_by)
  values (
    'Hunza Weekend Trip',
    'Four days in Karimabad: hotel, jeep and food.',
    'PKR', 'plane', 'violet', v_actor
  )
  returning id into v_group;

  -- The trigger already made the visitor the owner.
  insert into public.group_members (group_id, user_id, role) values
    (v_group, v_ali,     'member'),
    (v_group, v_shaheer, 'member'),
    (v_group, v_naveed,  'member');

  -- Equal split, one payer who is also in the split.
  perform public.create_expense(
    v_group, 'Eagle''s Nest Hotel — 2 nights', 4800000, 'PKR', 'accommodation',
    current_date - 6, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', v_actor, 'amount', 4800000)),
    jsonb_build_array(
      jsonb_build_object('user_id', v_actor),  jsonb_build_object('user_id', v_ali),
      jsonb_build_object('user_id', v_shaheer),jsonb_build_object('user_id', v_naveed)
    ),
    'Two twin rooms, breakfast included.'
  );

  -- The payer is deliberately NOT in the split: this is the example the
  -- landing page leads with.
  perform public.create_expense(
    v_group, 'Souvenirs from Altit Fort', 300000, 'PKR', 'shopping',
    current_date - 5, 'equal',
    jsonb_build_array(jsonb_build_object('user_id', v_actor, 'amount', 300000)),
    jsonb_build_array(
      jsonb_build_object('user_id', v_ali),
      jsonb_build_object('user_id', v_shaheer),
      jsonb_build_object('user_id', v_naveed)
    ),
    'You covered this one — you were not buying anything yourself.'
  );

  -- Exact split: Naveed took the front seat the whole way.
  perform public.create_expense(
    v_group, 'Jeep to Khunjerab Pass', 1800000, 'PKR', 'travel',
    current_date - 4, 'exact',
    jsonb_build_array(jsonb_build_object('user_id', v_ali, 'amount', 1800000)),
    jsonb_build_array(
      jsonb_build_object('user_id', v_actor,   'value', 360000),
      jsonb_build_object('user_id', v_ali,     'value', 360000),
      jsonb_build_object('user_id', v_shaheer, 'value', 360000),
      jsonb_build_object('user_id', v_naveed,  'value', 720000)
    )
  );

  -- Two payers on one expense.
  perform public.create_expense(
    v_group, 'Lunch stop at Besham', 520000, 'PKR', 'food',
    current_date - 3, 'equal',
    jsonb_build_array(
      jsonb_build_object('user_id', v_ali,     'amount', 300000),
      jsonb_build_object('user_id', v_shaheer, 'amount', 220000)
    ),
    jsonb_build_array(
      jsonb_build_object('user_id', v_actor),  jsonb_build_object('user_id', v_ali),
      jsonb_build_object('user_id', v_shaheer),jsonb_build_object('user_id', v_naveed)
    )
  );

  return v_group;
end;
$$;

grant execute on function public.start_demo() to authenticated;

-- Supabase reloads its schema cache on DDL by itself, but the reload is
-- asynchronous and can be missed, which leaves PostgREST reporting
-- "Could not find the function public.start_demo". Asking explicitly is free.
notify pgrst, 'reload schema';


-- =============================================================================
-- PART 9. BACKFILL PROFILES
--
-- on_auth_user_created only fires for NEW signups. Any account that already
-- existed in auth.users before this script ran - including ones whose profile
-- was just dropped by Part 0 - needs its profiles row recreated here.
-- =============================================================================

insert into public.profiles (id, full_name, email, avatar_url)
select u.id,
       coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)),
       u.email,
       u.raw_user_meta_data->>'avatar_url'
  from auth.users u
 where u.email is not null
on conflict (id) do nothing;


-- =============================================================================
-- PART 10. DEMO SEED DATA
--
-- Every expense is inserted through create_expense(), so the ledger is built
-- by the same code path the application uses and the zero-sum constraint is
-- genuinely exercised rather than bypassed.
--
-- Skipped automatically, with a notice, if the five demo accounts are not all
-- present in auth.users. The schema is complete either way.
-- =============================================================================

-- Resolves an auth user by email. Dropped again at the end of this part.
create or replace function public.__seed_uid(p_email text)
returns uuid
language sql
stable
as $seed$
  select id from auth.users where lower(email) = lower(p_email) limit 1;
$seed$;

do $$
declare
  -- Resolved from auth.users by email, so there are no UUIDs to paste.
  -- Create these five accounts first: Authentication -> Users -> Add user
  -- (tick "Auto Confirm User"). Any that are missing skip the seed entirely.
  uzair    uuid := public.__seed_uid('shared.access@uptek.com');
  ali      uuid := public.__seed_uid('ali.raza@example.com');
  shaheer  uuid := public.__seed_uid('shaheer.khan@example.com');
  naveed   uuid := public.__seed_uid('naveed.iqbal@example.com');
  hadi     uuid := public.__seed_uid('hadi.malik@example.com');

  g_hunza     uuid;
  g_apartment uuid;
begin
  if uzair is null or ali is null or shaheer is null
     or naveed is null or hadi is null then
    raise notice ' ';
    raise notice '=====================================================================';
    raise notice 'SEED SKIPPED - the five demo accounts do not all exist in auth.users.';
    raise notice 'The schema above was created successfully; only the demo data was';
    raise notice 'skipped. To add it, create these accounts under';
    raise notice 'Authentication -> Users (tick "Auto Confirm User"):';
    raise notice ' ';
    raise notice '  shared.access@uptek.com    (this is you)   found: %', (uzair is not null);
    raise notice '  ali.raza@example.com                       found: %', (ali is not null);
    raise notice '  shaheer.khan@example.com                   found: %', (shaheer is not null);
    raise notice '  naveed.iqbal@example.com                   found: %', (naveed is not null);
    raise notice '  hadi.malik@example.com                     found: %', (hadi is not null);
    raise notice ' ';
    raise notice 'Then re-run this whole file.';
    raise notice '=====================================================================';
    return;
  end if;

  -- Nothing to do if the demo groups are already here.
  if exists (select 1 from public.groups where name = 'Hunza Weekend Trip') then
    raise notice 'SEED SKIPPED - demo data already present.';
    return;
  end if;

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

  -- Exact split: Naveed took the front seat, so he paid a larger share.
  perform public.create_expense(
    g_hunza, 'Jeep to Khunjerab Pass', 1800000, 'PKR', 'travel',
    current_date - 57, 'exact',
    jsonb_build_array(jsonb_build_object('user_id', uzair, 'amount', 1800000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair,   'value', 360000),
      jsonb_build_object('user_id', ali,     'value', 360000),
      jsonb_build_object('user_id', shaheer, 'value', 360000),
      jsonb_build_object('user_id', naveed,  'value', 720000)
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

  -- Exact split: Uzair's room has the AC, so he carries more of the bill.
  -- 40 / 30 / 30 of 1,875,000.
  perform public.create_expense(
    g_apartment, 'Electricity bill', 1875000, 'PKR', 'bills',
    current_date - 24, 'exact',
    jsonb_build_array(jsonb_build_object('user_id', ali, 'amount', 1875000)),
    jsonb_build_array(
      jsonb_build_object('user_id', uzair, 'value', 750000),
      jsonb_build_object('user_id', ali,   'value', 562500),
      jsonb_build_object('user_id', hadi,  'value', 562500)
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

drop function if exists public.__seed_uid(text);


-- =============================================================================
-- PART 11. VERIFICATION
--
-- One query, four checks. Every `failures` value must come back 0. If any is
-- non-zero, stop and do not build on this database - the books do not balance.
-- =============================================================================

-- The Supabase SQL Editor shows only the final result set, so all four
-- checks are folded into a single query. Every `failures` value must be 0.

with unbalanced_sources as (
  -- 1. Every source document balances to zero.
  select 1
    from public.ledger_entries
   group by source_type, source_id
  having sum(amount) <> 0
),
unbalanced_groups as (
  -- 2. Every group balances to zero.
  select 1
    from public.ledger_entries
   group by group_id
  having sum(amount) <> 0
),
bad_payments as (
  -- 3. Payments always add up to their expense total.
  select 1
    from public.expenses e
    join public.expense_payments p on p.expense_id = e.id
   group by e.id, e.amount
  having sum(p.amount) <> e.amount
),
bad_shares as (
  -- 4. Shares always add up to their expense total.
  select 1
    from public.expenses e
    cross join lateral public.expense_shares(e.id) s
   where e.deleted_at is null
   group by e.id, e.amount
  having sum(s.share) <> e.amount
)
select 1 as "#", 'every source document balances to zero' as "check",
       (select count(*) from unbalanced_sources) as failures
union all
select 2, 'every group balances to zero',
       (select count(*) from unbalanced_groups)
union all
select 3, 'payments add up to their expense total',
       (select count(*) from bad_payments)
union all
select 4, 'shares add up to their expense total',
       (select count(*) from bad_shares)
order by "#";

-- Expected: four rows, every `failures` = 0.
--
-- If `failures` is 0 on all four rows the books balance and the database is
-- ready. If any row is non-zero, stop - do not build on this database.
