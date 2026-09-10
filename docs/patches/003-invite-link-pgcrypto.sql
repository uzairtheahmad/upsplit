-- =============================================================================
-- UpSplit - patch 003: fix "function gen_random_bytes(integer) does not exist"
--
-- Safe to run on a live database: it replaces one function. It drops nothing
-- and touches no data.
--
-- Already folded into schema.sql, so a fresh schema.sql run does not need this.
--
-- The bug
-- -------
-- create_invite_link() builds its token from gen_random_bytes(), which comes
-- from the pgcrypto extension. Supabase installs pgcrypto into the
-- `extensions` schema, so `create extension if not exists "pgcrypto"` in
-- schema.sql was a no-op: the extension was already present, just not in
-- `public`.
--
-- The function pins `search_path = public` (correct for a SECURITY DEFINER
-- function), and that path excludes `extensions`, so the name could not
-- resolve and every invite-link creation failed.
--
-- gen_random_uuid() is unaffected and is used successfully elsewhere in the
-- schema, because since Postgres 13 it is a core builtin in pg_catalog rather
-- than part of pgcrypto. That is why this was the only function that broke.
--
-- The fix
-- -------
-- Add `extensions` to this one function's search_path. `public` stays first,
-- so resolution for everything else is unchanged, and `extensions` is not
-- writable by application roles, so nothing is weakened by trusting it.
-- =============================================================================

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

grant execute on function public.create_invite_link(uuid, timestamptz) to authenticated;

-- Supabase reloads its schema cache on DDL by itself, but the reload is
-- asynchronous and can be missed. Asking explicitly is free.
notify pgrst, 'reload schema';


-- =============================================================================
-- Verify: expect a token roughly 43 characters long, made only of A-Z a-z 0-9
-- - and _. Run it against a group you own, or it will raise 42501.
--
--   select public.create_invite_link('YOUR-GROUP-ID'::uuid);
--
-- Running it twice returns a different token each time and revokes the first,
-- which is the intended rotate-on-recreate behaviour.
-- =============================================================================

select
  p.proname,
  p.proconfig as search_path_setting
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_invite_link';
