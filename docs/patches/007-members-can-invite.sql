-- =============================================================================
-- UpSplit - patch 007: any member can invite, not just owners and admins
--
-- Safe to run on a live database: it replaces one function and one policy.
-- It drops nothing and touches no data.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- What changes
-- ------------
-- invite_to_group() required owner or admin. It now requires only membership.
-- A shared-expense group is a group of people who already know each other, and
-- making everyone wait on an admin to add the friend who just joined the trip
-- is friction with no safety benefit: whoever is invited sees the same ledger
-- either way.
--
-- The group_members INSERT policy is relaxed to match, because the invite
-- dialog's "add someone you know" list inserts directly rather than going
-- through the RPC.
--
-- What does NOT change
-- --------------------
--   removing a member          owner/admin only, and still refuses on a
--                              non-zero balance
--   changing a role            owner/admin only
--   transferring ownership     owner only
--   the shareable invite link  owner/admin only, because create_invite_link()
--                              also rotates, and rotating kills a link other
--                              people are already using
--
-- Note the asymmetry this creates on purpose: a member can add somebody but
-- cannot remove them. Adding is reversible by an admin; removing someone
-- mid-trip is disruptive, and the balance check that guards it matters more.
--
-- The role restriction in the policy is load-bearing
-- --------------------------------------------------
-- A plain member may insert only a row whose role is 'member'. Without that
-- clause any member could insert an `owner` row, which either collides with
-- the single-owner index or quietly hands out admin. Owners and admins are
-- unrestricted, as before.
-- =============================================================================


-- =============================================================================
-- 1. invite_to_group() - membership is enough
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
$fn$;

-- =============================================================================
-- 2. The matching RLS policy on group_members.
-- =============================================================================

drop policy if exists group_members_insert on public.group_members;

create policy group_members_insert on public.group_members
  for insert to authenticated
  with check (
    -- Owners and admins may add anyone, at any role.
    public.can_manage_members(group_id)
    -- Any member may add someone, but only as a `member`.
    or (public.is_group_member(group_id) and role = 'member')
    -- The very first row (the creator becoming owner) is inserted by a
    -- SECURITY DEFINER trigger, which is not subject to this policy.
  );


-- =============================================================================
-- 3. Tell PostgREST the definition changed.
-- =============================================================================

notify pgrst, 'reload schema';


-- =============================================================================
-- Verify. Expect:
--
--   invite_needs_only_membership   t
--   policy_allows_members          t
-- =============================================================================

select
  (select prosrc like '%is_group_member%' and prosrc not like '%can_manage_members%'
     from pg_proc p
     join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'invite_to_group')
    as invite_needs_only_membership,
  (select with_check like '%is_group_member%'
     from pg_policies
    where schemaname = 'public'
      and tablename = 'group_members'
      and policyname = 'group_members_insert')
    as policy_allows_members;
