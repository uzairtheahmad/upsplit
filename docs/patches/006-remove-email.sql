-- =============================================================================
-- UpSplit - patch 006: remove email sending, add Google sign-in support
--
-- Safe to run on a live database, with one caveat: it DROPS the email_outbox
-- table and three unused profile columns. See below.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- Why
-- ---
-- Sending mail needs a verified sending domain, which there is not one of yet.
-- Rather than leave a half-built feature that silently queues messages nobody
-- will ever receive, the whole path comes out.
--
-- Invitations still work. invite_to_group() still creates a tokened
-- invitation and now returns the token to the caller, and the app shows the
-- inviter a /invite/<token> link to send however they like. The reusable
-- per-group invite link is unchanged. Nothing about who can join a group
-- changes; only who does the delivering.
--
-- In-app notifications are unaffected.
--
-- What is dropped
-- ---------------
--   public.email_outbox                  queued messages that will never send
--   public.queue_email(...)              its only writer
--   profiles.email_notifications         nothing read it
--   profiles.push_notifications          nothing ever read it: no push exists
--   profiles.weekly_summary              nothing ever read it: no digest exists
--
-- If you have queued mail you care about, copy it out before running this:
--
--   select * from public.email_outbox where sent_at is null;
--
-- Google sign-in
-- --------------
-- handle_new_user() now reads the metadata keys Google actually sends. It
-- looked only for `full_name` and `avatar_url`, which the signup form sends;
-- Google sends `name` and `picture`. Without this every Google user would
-- arrive with the local part of their email as their display name and no
-- photo. Existing accounts are untouched.
--
-- Enabling the provider is a dashboard job, not a SQL one:
--   Supabase -> Authentication -> Sign In / Providers -> Google
-- =============================================================================


-- =============================================================================
-- 1. Functions that referenced the outbox, rewritten without it.
--
-- These are replaced BEFORE the table is dropped, so nothing depends on
-- email_outbox by the time the drop runs.
-- =============================================================================

-- -- notify_user ---------------------------------------------------------------
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
as $fn$
begin
  if p_user_id is null then
    return;
  end if;

  insert into public.notifications (user_id, group_id, kind, title, body, href)
  values (p_user_id, p_group_id, p_kind, p_title, p_body, p_href);
end;
$fn$;


-- -- invite_to_group ---------------------------------------------------------------
create or replace function public.invite_to_group(
  p_group_id uuid,
  p_email    text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_email    text := lower(btrim(p_email));
  v_user_id  uuid;
  v_name     text;
  v_group    text;
  v_inviter  text;
  v_token    text;
begin
  if not public.can_manage_members(p_group_id) then
    raise exception 'Only owners and admins can invite people' using errcode = '42501';
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
$fn$;


-- -- handle_new_user ---------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;


-- -- delete_my_account ---------------------------------------------------------------
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;

-- =============================================================================
-- 2. Drop the outbox.
--
-- queue_email() first: it is the only thing that writes to the table.
-- =============================================================================

drop function if exists public.queue_email(text, text, text, text, jsonb);
drop table if exists public.email_outbox;


-- =============================================================================
-- 3. Drop the three preference columns nothing reads.
--
-- Settings no longer shows them, and the app's UserPreferences type no longer
-- carries them, so leaving the columns would only invite someone to wire up a
-- toggle that controls nothing.
-- =============================================================================

alter table public.profiles
  drop column if exists email_notifications,
  drop column if exists push_notifications,
  drop column if exists weekly_summary;


-- =============================================================================
-- 4. Tell PostgREST the shape changed.
--
-- Required here rather than merely tidy: the profiles columns are part of
-- PostgREST's cached table definition, and a stale cache will keep advertising
-- columns that no longer exist.
-- =============================================================================

notify pgrst, 'reload schema';


-- =============================================================================
-- Verify. Expect:
--
--   outbox_gone            t
--   queue_email_gone       t
--   prefs_gone             t
--   reads_google_metadata  t
-- =============================================================================

select
  to_regclass('public.email_outbox') is null as outbox_gone,
  not exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'queue_email'
  ) as queue_email_gone,
  not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles'
      and column_name in ('email_notifications', 'push_notifications', 'weekly_summary')
  ) as prefs_gone,
  (select prosrc like '%picture%' from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'handle_new_user')
    as reads_google_metadata;
