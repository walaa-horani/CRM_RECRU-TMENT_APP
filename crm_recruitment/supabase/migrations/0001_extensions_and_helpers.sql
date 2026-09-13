-- 0001_extensions_and_helpers.sql
-- Extensions, the `app` helper schema, and the JWT claim accessors that every
-- RLS policy in this database is built on.

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext   with schema extensions;
create extension if not exists vector   with schema extensions;

create schema if not exists app;
grant usage on schema app to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Claim accessors
--
-- These read the Clerk session token that Supabase third-party auth has already
-- verified. They are plain STABLE functions, NOT security definer: they touch no
-- tables and must never gain the ability to bypass RLS.
--
-- Clerk session token v1 and v2 spell the organization claim differently, so both
-- are read. v2 nests them under `o`:
--   { "sub": "user_123", "o": { "id": "org_123", "rol": "admin" }, "v": 2 }
--
-- Always call these wrapped in a scalar subquery inside a policy:
--     using (tenant_id = (select app.current_tenant_id()))
-- The wrapper makes Postgres build an initPlan and evaluate the function once per
-- statement instead of once per row. On a table of any size this is the single
-- largest RLS performance factor.
-- ---------------------------------------------------------------------------

-- The active Clerk organization id, which is this application's tenant id.
-- Returns NULL when the user has no active organization, which makes every
-- tenant policy fail closed.
create or replace function app.current_tenant_id()
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.jwt() ->> 'org_id',        -- session token v1
    auth.jwt() -> 'o' ->> 'id'      -- session token v2
  )
$$;

-- The Clerk user id of the caller.
create or replace function app.current_user_id()
returns text
language sql
stable
set search_path = ''
as $$
  select auth.jwt() ->> 'sub'
$$;

-- The caller's role within the active organization, with Clerk's `org:` prefix
-- stripped: 'admin' | 'recruiter' | 'coordinator'.
--
-- Clerk ships two built-in roles, org:admin and org:member. This application also
-- expects custom roles org:recruiter and org:coordinator to be defined in the
-- Clerk dashboard. Any role this schema does not recognise (including a bare
-- org:member) falls through every write policy's role check and is therefore
-- read-only. That is deliberate: an unconfigured role can look at tenant data but
-- cannot change it.
create or replace function app.current_org_role()
returns text
language sql
stable
set search_path = ''
as $$
  select replace(
    coalesce(
      auth.jwt() ->> 'org_role',      -- session token v1, e.g. 'org:admin'
      auth.jwt() -> 'o' ->> 'rol'     -- session token v2, e.g. 'admin'
    ),
    'org:', ''
  )
$$;

-- Convenience predicate so policies read as prose.
-- Usage: with check ( ... and (select app.has_role('admin','recruiter')) )
create or replace function app.has_role(variadic p_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.current_org_role() = any(p_roles)
$$;

grant execute on function
  app.current_tenant_id(),
  app.current_user_id(),
  app.current_org_role(),
  app.has_role(text[])
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Shared triggers
-- ---------------------------------------------------------------------------

create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;
