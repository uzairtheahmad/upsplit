-- =============================================================================
-- UpSplit - patch 002: one-click demo
--
-- Safe to run on a live database: it adds three demo accounts, replaces two
-- functions and adds one. It drops nothing and touches no existing data.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- ⚠️  Also required, once, in the Supabase dashboard:
--        Authentication -> Sign In / Providers -> Anonymous Sign-Ins -> enable
--     Without it the demo button fails with "Anonymous sign-ins are disabled".
--
-- How the demo works
-- ------------------
-- A visitor clicking "Try the demo" is signed in anonymously and given their
-- OWN group, seeded from scratch. Nobody shares a workspace, so no visitor can
-- spoil the demo for anyone else and no reset job is needed.
--
-- The three other people in that group (Ali, Shaheer, Naveed) are real but
-- dormant accounts: they exist only so group_members -> profiles -> auth.users
-- resolves. They have no usable password and can never sign in.
-- =============================================================================


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
-- 2. handle_new_user - support anonymous sign-ins
--
-- An anonymous user has no email, and the previous version returned early in
-- that case, leaving them with no profile. The app then failed to load,
-- because loadWorkspace requires the caller's own profile row.
-- =============================================================================

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
  on conflict (group_id, user_id) do nothing;

  insert into public.activity_logs (group_id, actor_id, action, subject, href)
  select i.group_id, new.id, 'member_joined', v_name,
         '/groups/' || i.group_id || '/members'
    from public.group_invitations i
   where lower(i.email) = v_email
     and i.accepted_at is null;

  update public.group_invitations
     set accepted_at = now()
   where lower(email) = v_email
     and accepted_at is null;

  return new;
end;
$$;


-- =============================================================================
-- 3. start_demo() - build this visitor's own workspace
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


-- =============================================================================
-- Verify: expect one row, and three demo profiles.
-- =============================================================================

select
  (select count(*) from information_schema.routines
    where routine_schema = 'public' and routine_name = 'start_demo')      as start_demo_exists,
  (select count(*) from public.profiles
    where email like 'demo-%@upsplit.invalid')                            as demo_personas;
