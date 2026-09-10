-- =============================================================================
-- UpSplit - patch 005: fix a permission check that passed for non-members
--
-- ⚠️  SECURITY. Run this before the next deploy. It replaces three functions,
--     drops nothing and touches no data.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- The bug
-- -------
-- group_role_of() returns NULL for somebody who is not in the group at all.
-- can_manage_members() was:
--
--     select public.group_role_of(p_group_id) in ('owner', 'admin');
--
-- For a non-member that is `NULL in (...)`, which is NULL rather than false.
-- Every caller then wrote the natural guard:
--
--     if not public.can_manage_members(p_group_id) then
--       raise exception 'Only owners and admins can ...';
--     end if;
--
-- `not NULL` is NULL, and `if NULL then` does not take the branch. So the
-- guard raised for a plain member, whose role really is 'member', but silently
-- passed for anybody with no role in the group at all.
--
-- The same trap in a second spelling: `group_role_of(g) <> 'owner'` is NULL for
-- a non-member, so those raises were skipped too.
--
-- What it let a signed-in user do, to ANY group whose id they knew:
--
--   invite_to_group          add themselves, or anyone, to that group
--   transfer_group_ownership take ownership of it
--   remove_group_member      remove anyone from it
--   update_expense           rewrite anyone's expense
--   delete_expense           delete anyone's expense
--   create_invite_link       mint a shareable link to it
--   revoke_invite_link       revoke its link
--
-- Group ids are UUIDs and are not enumerable, which is the only reason this
-- was not trivially exploitable, but a group id is not a secret: it is in
-- every /groups/<id> URL any member sees.
--
-- RLS policies were NOT affected. A policy whose USING expression evaluates to
-- NULL filters the row out, so the same expression fails safe there. This was
-- only ever a problem in plpgsql, where NULL means "skip the branch".
--
-- The fix
-- -------
-- can_manage_members() now coalesces to false, which repairs all six of its
-- call sites at once. The two `<>` guards become `is distinct from`, which is
-- NULL-safe and returns true when the left side is NULL.
-- =============================================================================


-- -- can_manage_members ------------------------------------------------------------------
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


-- -- remove_group_member ------------------------------------------------------------------
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


-- -- transfer_group_ownership ------------------------------------------------------------------
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

-- =============================================================================
-- Tell PostgREST the definitions changed.
-- =============================================================================

notify pgrst, 'reload schema';


-- =============================================================================
-- Verify. Both columns ask the question a non-member's session would ask,
-- against a group id that cannot exist.
--
--   can_manage_members  must be  f   (it was NULL before this patch: the bug)
--   owner_guard_fires   must be  t   (the raise is reached)
-- =============================================================================

select
  public.can_manage_members('00000000-0000-0000-0000-000000000000')
    as can_manage_members,
  (public.group_role_of('00000000-0000-0000-0000-000000000000')
     is distinct from 'owner')
    as owner_guard_fires;
