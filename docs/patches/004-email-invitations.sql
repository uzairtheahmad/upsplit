-- =============================================================================
-- UpSplit - patch 004: real email invitations
--
-- Safe to run on a live database: it adds two columns, adds four functions and
-- replaces one. It drops nothing and destroys no data.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- What changes
-- ------------
-- Before, inviting somebody without an account stored a row and told nobody.
-- The invitation was only ever discovered if that person happened to sign up
-- on their own, at which point handle_new_user() claimed it. Nothing was sent.
--
-- Now every invitation queues an email in email_outbox, whether or not the
-- address has an account, and a pending invitation carries a token so the
-- recipient has a link to click.
--
-- The email is queued rather than sent inline. A write RPC cannot hold its
-- transaction open across an HTTP call, and an inline send that failed would
-- vanish with no record. The outbox is drained by /api/email/dispatch.
-- =============================================================================


-- =============================================================================
-- 1. Tokens for pending invitations
--
-- 32 bytes of CSPRNG rendered base64url, the same shape create_invite_link()
-- uses. `extensions` is on the search_path because gen_random_bytes() comes
-- from pgcrypto, which Supabase installs there rather than in public.
-- =============================================================================

create or replace function public.new_invite_token()
returns text
language sql
volatile
set search_path = public, extensions
as $fn$
  select replace(replace(replace(
    encode(gen_random_bytes(32), 'base64'), '+', '-'), '/', '_'), '=', '');
$fn$;

alter table public.group_invitations
  add column if not exists token      text,
  add column if not exists expires_at timestamptz;

-- Backfill anything that predates this patch, then make both columns required.
update public.group_invitations
   set token = public.new_invite_token()
 where token is null;

update public.group_invitations
   set expires_at = created_at + interval '14 days'
 where expires_at is null;

alter table public.group_invitations
  alter column token      set not null,
  alter column token      set default public.new_invite_token(),
  alter column expires_at set not null,
  alter column expires_at set default (now() + interval '14 days');

create unique index if not exists group_invitations_token_idx
  on public.group_invitations (token);

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



-- =============================================================================
-- 2. queue_email() - put a message in the outbox for an address
--
-- notify_user() can only queue mail for somebody who already has an account,
-- because it starts from a user id and reads their notification preference. An
-- invitation has to reach an address with no account and no preference on
-- file, so it needs its own way in.
--
-- Execute is revoked from anon and authenticated below. This schema sets
-- `alter default privileges ... grant all on functions`, so without that
-- revoke any signed-in user could send arbitrary mail from your domain. It is
-- called only from SECURITY DEFINER functions, which run as the owner and do
-- not need the grant.
-- =============================================================================

create or replace function public.queue_email(
  p_to       text,
  p_subject  text,
  p_body     text,
  p_template text,
  p_payload  jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = public
as $fn$
  insert into public.email_outbox (to_email, subject, body, template, payload)
  values (lower(btrim(p_to)), p_subject, p_body, p_template, p_payload);
$fn$;

revoke execute on function
  public.queue_email(text, text, text, text, jsonb) from anon, authenticated;


-- =============================================================================
-- 3. invite_to_group() - now always sends something
--
-- Two paths, unchanged in who ends up in the group:
--
--   they have an account  -> added immediately, emailed "you were added"
--   they do not           -> invitation row with a token, emailed a join link
--
-- The return value gains `token`, `group_name` and `inviter_name` so the
-- caller can report what happened without a second round trip.
--
-- Re-inviting the same address now refreshes the invitation and re-queues the
-- mail instead of being a silent no-op, because "nothing happened" is not a
-- useful answer to somebody clicking Invite a second time.
-- =============================================================================

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

  perform public.queue_email(
    v_email,
    v_inviter || ' invited you to ' || v_group || ' on UpSplit',
    v_inviter || ' wants to share expenses with you in ' || v_group ||
      '. Create your free account to see what everyone has paid and what you owe.',
    'invitation',
    jsonb_build_object(
      'token',        v_token,
      'group_id',     p_group_id,
      'group_name',   v_group,
      'inviter_name', v_inviter,
      'href',         '/invite/' || v_token
    )
  );

  return jsonb_build_object(
    'status',       'pending',
    'email',        v_email,
    'token',        v_token,
    'group_name',   v_group,
    'inviter_name', v_inviter
  );
end;
$fn$;


-- =============================================================================
-- 4. invitation_preview() - what the landing page may show a stranger
--
-- Callable by anon, because the whole point is that the recipient has no
-- account yet. It is deliberately narrow: the group's name, who invited them,
-- how many people are in it. No member list, no other addresses, no amounts.
--
-- A bad, expired or already-accepted token returns a row saying which, rather
-- than raising, so the page can explain the difference.
-- =============================================================================

create or replace function public.invitation_preview(p_token text)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $fn$
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
$fn$;

grant execute on function public.invitation_preview(text) to anon, authenticated;


-- =============================================================================
-- 5. accept_invitation() - join the group the token points at
--
-- Signing up with the invited address is handled separately, by
-- handle_new_user(), which claims every pending invitation for that address.
-- This exists for the other cases: somebody who already had an account and
-- followed the link, or who signed up with a different address than the one
-- they were invited at.
--
-- Holding the token is the authorisation. It is 32 random bytes, and it is
-- what was mailed to them.
-- =============================================================================

create or replace function public.accept_invitation(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $fn$
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
$fn$;

grant execute on function public.accept_invitation(text) to authenticated;


-- =============================================================================
-- 6. handle_new_user() - respect the new expiry on the signup path
--
-- Signing up with an invited address claims every pending invitation for that
-- address. Now that invitations expire, that path has to check it too, or the
-- same dead token would be refused by accept_invitation() and honoured by
-- signing up, which is the kind of difference nobody finds until it matters.
-- =============================================================================

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

  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data->>'full_name'), ''),
    split_part(v_email, '@', 1)
  );

  insert into public.profiles (id, full_name, email, avatar_url)
  values (new.id, v_name, new.email, new.raw_user_meta_data->>'avatar_url')
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


-- =============================================================================
-- 7. Tell PostgREST about the new functions.
-- =============================================================================

notify pgrst, 'reload schema';


-- =============================================================================
-- Verify: expect exactly these four rows.
--
--   accept_invitation
--   invitation_preview
--   new_invite_token
--   queue_email
-- =============================================================================

select p.proname
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
 where n.nspname = 'public'
   and p.proname in
       ('new_invite_token', 'queue_email', 'invitation_preview', 'accept_invitation')
 order by p.proname;
