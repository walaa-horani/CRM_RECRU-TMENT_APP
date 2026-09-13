-- 00_shim_supabase.sql
-- LOCAL TEST HARNESS ONLY. Never applied to a Supabase project.
--
-- Recreates the parts of a Supabase database that the migrations depend on, so
-- the schema can be applied and its RLS behaviour exercised against a plain
-- pgvector Postgres container. Supabase provides all of this natively.

create schema if not exists extensions;
create schema if not exists auth;
create schema if not exists storage;

-- Supabase's three API roles.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit bypassrls;
  end if;
end
$$;

grant usage on schema extensions, auth, storage to anon, authenticated, service_role;

-- The verified JWT, exposed the way Supabase's PostgREST exposes it: as a GUC
-- the connection sets per request. Tests set request.jwt.claims to impersonate.
create or replace function auth.jwt()
returns jsonb
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), ''),
    '{}'
  )::jsonb
$$;

grant execute on function auth.jwt() to anon, authenticated, service_role;

-- Minimal storage schema: enough for bucket registration and path-prefix policies.
create table if not exists storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[],
  created_at         timestamptz not null default now()
);

create table if not exists storage.objects (
  id         uuid primary key default gen_random_uuid(),
  bucket_id  text not null references storage.buckets(id),
  name       text not null,
  owner      text,
  created_at timestamptz not null default now()
);

alter table storage.objects enable row level security;

create or replace function storage.foldername(name text)
returns text[]
language plpgsql
immutable
as $$
declare
  _parts text[];
begin
  _parts := string_to_array(name, '/');
  return _parts[1 : array_length(_parts, 1) - 1];
end
$$;

grant execute on function storage.foldername(text) to anon, authenticated, service_role;
grant select, insert, update, delete on storage.objects to authenticated;
grant select on storage.buckets to authenticated;
