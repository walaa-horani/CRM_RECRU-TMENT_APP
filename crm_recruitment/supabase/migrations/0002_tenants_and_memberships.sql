-- 0002_tenants_and_memberships.sql
-- Mirrors of Clerk-owned state.
--
-- Clerk is the source of truth for identity; these two tables are a read replica
-- kept in sync by the webhook handler. Nothing in a user-facing request path may
-- write to them, which is enforced below by simply never creating a write policy
-- (see 0008). The webhook's service_role connection has BYPASSRLS and is the only
-- writer.

create table public.tenants (
  -- The Clerk organization id (org_xxx) IS the tenant id, everywhere in this
  -- database. No surrogate key, so RLS is a direct string comparison against the
  -- JWT claim with no lookup.
  id               text primary key,
  name             text not null,
  slug             text,
  -- Cached from Clerk billing so seat/plan gates can be checked in SQL without a
  -- round trip. Clerk remains authoritative; this is a convenience copy.
  plan             text,
  seats_purchased  integer,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table public.tenants is
  'One row per recruitment agency. Mirror of a Clerk organization; written only by the Clerk webhook.';

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------

create table public.memberships (
  tenant_id      text not null references public.tenants(id) on delete cascade,
  clerk_user_id  text not null,
  email          extensions.citext,
  full_name      text,
  -- Display and join convenience ONLY. The authorization decision is made from
  -- the JWT claim (app.current_org_role()), never from this column -- a webhook
  -- lag would otherwise mean a stale role is what gates data access.
  role           text not null default 'coordinator'
                   check (role in ('admin', 'recruiter', 'coordinator')),
  status         text not null default 'active'
                   check (status in ('active', 'suspended', 'removed')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  primary key (tenant_id, clerk_user_id)
);

comment on column public.memberships.role is
  'Display/join copy of the Clerk org role. NOT the authorization source -- policies read app.current_org_role() from the JWT.';

create index memberships_tenant_idx on public.memberships (tenant_id);
create index memberships_user_idx   on public.memberships (clerk_user_id);

create trigger memberships_touch_updated_at
  before update on public.memberships
  for each row execute function app.touch_updated_at();
