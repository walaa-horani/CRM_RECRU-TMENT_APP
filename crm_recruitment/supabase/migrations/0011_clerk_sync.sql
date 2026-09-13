-- 0011_clerk_sync.sql
-- Hardening for the Clerk -> Supabase sync: exactly-once processing, ordering
-- protection, and immediate revocation of access when someone is removed from an
-- agency mid-session.

-- ---------------------------------------------------------------------------
-- 1. Exactly-once processing
--
-- Svix retries on any non-2xx and on timeouts, and it will happily deliver the
-- same message twice even after a success it never saw the ack for. Every
-- delivery carries a stable `svix-id`; recording it is what makes reprocessing
-- a no-op.
--
-- Dedupe alone is not enough, though: retries also arrive OUT OF ORDER, so a
-- stale `organization.updated` can land after a newer one. That is handled
-- separately by the source_updated_at guards below.
-- ---------------------------------------------------------------------------

create table public.webhook_events (
  svix_id      text primary key,
  event_type   text not null,
  received_at  timestamptz not null default now()
);

comment on table public.webhook_events is
  'Processed Clerk/Svix message ids. Insert-on-conflict-do-nothing is the exactly-once gate. Safe to prune rows older than the Svix retry window (~2 days); pruning sooner reopens the duplicate window.';

create index webhook_events_received_at_idx on public.webhook_events (received_at);

alter table public.webhook_events enable row level security;
-- No policy: only service_role (BYPASSRLS) touches this table.

-- ---------------------------------------------------------------------------
-- 2. Ordering guards
--
-- Clerk stamps every object with an updated_at. Applying an event only when it
-- is newer than what we already stored makes out-of-order delivery harmless.
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column source_updated_at timestamptz not null default '-infinity'::timestamptz;
alter table public.memberships
  add column source_updated_at timestamptz not null default '-infinity'::timestamptz;

comment on column public.tenants.source_updated_at is
  'Clerk object updated_at for the event that last wrote this row. Older events are discarded.';

-- Organization deletion is terminal. Without a tombstone, a stale
-- organization.updated redelivered after the delete would recreate an empty
-- agency row.
create table public.tenant_tombstones (
  tenant_id   text primary key,
  deleted_at  timestamptz not null default now()
);

alter table public.tenant_tombstones enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Revocation
--
-- Memberships are now SOFT deleted. The row has to survive removal for two
-- reasons: the ordering guard needs something to compare against, and
-- app.membership_revoked() below needs a positive record that this user was
-- removed rather than merely unknown.
--
-- FORCE RLS is dropped here so that the SECURITY DEFINER lookup below can read
-- the table as the owner without re-entering the memberships SELECT policy --
-- that policy calls app.current_tenant_id(), which would otherwise recurse
-- infinitely. memberships has no write policy for `authenticated`, so owner
-- bypass costs nothing.
-- ---------------------------------------------------------------------------

alter table public.memberships no force row level security;

/*
 * True when Clerk has told us this user is no longer an active member of the
 * organization in their token.
 *
 * Deliberately asymmetric:
 *   - row present and status <> 'active'  -> REVOKED (deny)
 *   - row present and status  = 'active'  -> fine
 *   - NO ROW AT ALL                       -> fine
 *
 * That last case is the important one. A brand new member's JWT can arrive
 * before the organizationMembership.created webhook does; treating "no row" as
 * revoked would lock legitimate users out on webhook lag. So this function can
 * only ever SUBTRACT access on a known revocation -- it never grants any.
 */
create or replace function app.membership_revoked()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.memberships m
    where m.tenant_id     = coalesce(auth.jwt() ->> 'org_id', auth.jwt() -> 'o' ->> 'id')
      and m.clerk_user_id = auth.jwt() ->> 'sub'
      and m.status <> 'active'
  )
$$;

/*
 * Replaces the 0001 definition.
 *
 * Returning NULL for a revoked membership means every existing policy, RPC and
 * storage rule inherits immediate revocation with no policy changes at all --
 * they all compare against this one function, and `tenant_id = NULL` is NULL,
 * which qualifies no row.
 *
 * Timeline for someone removed from an agency mid-session:
 *   t+0        Clerk fires organizationMembership.deleted
 *   t+~200ms   webhook marks the mirror row 'removed'; this function starts
 *              returning NULL and the database is closed to them
 *   t+<=60s    their session token refreshes without the `o` claim, so even if
 *              the webhook never arrived, the coalesce above yields NULL anyway
 *
 * The two mechanisms are independent, and either one alone is sufficient.
 */
create or replace function app.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when app.membership_revoked() then null
    else coalesce(
      auth.jwt() ->> 'org_id',        -- session token v1
      auth.jwt() -> 'o' ->> 'id'      -- session token v2
    )
  end
$$;

grant execute on function app.membership_revoked() to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Event application
--
-- One function per object kind, each doing dedupe + ordering + write in a
-- single transaction. Doing this in TypeScript would mean check-then-write
-- round trips with a race in between; here a concurrent duplicate simply loses
-- the primary key insert and returns 'duplicate'.
--
-- Return value is an outcome string so the route can log why nothing happened:
--   applied | duplicate | stale | tombstoned
-- ---------------------------------------------------------------------------

create or replace function app.normalize_org_role(p_clerk_role text)
returns text
language sql
immutable
set search_path = ''
as $$
  -- Clerk sends 'org:admin'. Anything this schema does not recognise --
  -- including Clerk's built-in 'org:member' -- becomes 'coordinator', the
  -- least-privileged role, so an unconfigured Clerk instance degrades to
  -- minimal access instead of failing the sync on a constraint violation.
  select case replace(coalesce(p_clerk_role, ''), 'org:', '')
    when 'admin'       then 'admin'
    when 'recruiter'   then 'recruiter'
    when 'coordinator' then 'coordinator'
    else 'coordinator'
  end
$$;

create or replace function public.clerk_sync_organization(
  p_svix_id    text,
  p_event_type text,
  p_org_id     text,
  p_name       text,
  p_slug       text,
  p_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Exactly-once gate.
  insert into public.webhook_events (svix_id, event_type)
  values (p_svix_id, p_event_type)
  on conflict (svix_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  -- Matched on the action suffix, not the full string. Clerk spells these
  -- differently in different places ('organizationMembership.deleted' in the
  -- SDK types, 'organization_membership.deleted' in the dashboard and JSON
  -- payloads) and verifyWebhook passes the wire value straight through. An
  -- equality test against one spelling would silently fall through to the
  -- upsert below on the other -- which for a removal means reinstating the
  -- member as 'active'. Suffix matching is immune to that.
  if p_event_type like '%.deleted' then
    -- Cascades to every tenant-scoped table, audit rows included. If regulatory
    -- retention is ever required, export before this runs rather than loosening
    -- the cascade.
    delete from public.tenants where id = p_org_id;
    insert into public.tenant_tombstones (tenant_id) values (p_org_id)
      on conflict (tenant_id) do nothing;
    return 'applied';
  end if;

  if exists (select 1 from public.tenant_tombstones t where t.tenant_id = p_org_id) then
    return 'tombstoned';
  end if;

  insert into public.tenants (id, name, slug, source_updated_at)
  values (p_org_id, p_name, p_slug, p_updated_at)
  on conflict (id) do update
    set name              = excluded.name,
        slug              = excluded.slug,
        source_updated_at = excluded.source_updated_at,
        updated_at        = now()
    where excluded.source_updated_at > tenants.source_updated_at;

  if not found then
    return 'stale';
  end if;

  -- Seed the six canonical stages, guarded on "this tenant has no stages yet",
  -- so a redelivered organization.created never resets a customised board.
  perform app.seed_default_pipeline_stages(p_org_id);

  return 'applied';
end
$$;

create or replace function public.clerk_sync_membership(
  p_svix_id    text,
  p_event_type text,
  p_org_id     text,
  p_user_id    text,
  p_email      text,
  p_full_name  text,
  p_role       text,
  p_updated_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.webhook_events (svix_id, event_type)
  values (p_svix_id, p_event_type)
  on conflict (svix_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  -- A membership event for an agency that has been deleted must not resurrect
  -- it via the stub insert below.
  if exists (select 1 from public.tenant_tombstones t where t.tenant_id = p_org_id) then
    return 'tombstoned';
  end if;

  -- The organization row may legitimately not exist yet: membership and
  -- organization events race, and Svix does not order them. Create a stub so
  -- the FK holds; a later organization.created/updated fills in the real name
  -- (its source_updated_at is newer, so the guard lets it through).
  insert into public.tenants (id, name, source_updated_at)
  values (p_org_id, p_org_id, '-infinity'::timestamptz)
  on conflict (id) do nothing;

  -- Suffix match: see the note in clerk_sync_organization. Getting this wrong
  -- here is the dangerous direction -- it would turn a removal into a
  -- reinstatement.
  if p_event_type like '%.deleted' then
    -- SOFT delete. The row must persist so app.membership_revoked() can tell
    -- "removed" apart from "not synced yet", which is what makes revocation
    -- immediate instead of waiting for the token to refresh.
    update public.memberships
      set status            = 'removed',
          source_updated_at = p_updated_at,
          updated_at        = now()
    where tenant_id = p_org_id
      and clerk_user_id = p_user_id
      and source_updated_at <= p_updated_at;

    if not found then
      -- Either already removed by a newer event, or we never saw the create.
      -- Record the tombstone anyway so a stale 'created' cannot resurrect them.
      insert into public.memberships (
        tenant_id, clerk_user_id, role, status, source_updated_at
      )
      values (p_org_id, p_user_id, 'coordinator', 'removed', p_updated_at)
      on conflict (tenant_id, clerk_user_id) do nothing;

      if not found then
        return 'stale';
      end if;
    end if;

    return 'applied';
  end if;

  insert into public.memberships (
    tenant_id, clerk_user_id, email, full_name, role, status, source_updated_at
  )
  values (
    p_org_id, p_user_id, p_email, p_full_name,
    app.normalize_org_role(p_role), 'active', p_updated_at
  )
  on conflict (tenant_id, clerk_user_id) do update
    set email             = excluded.email,
        full_name         = excluded.full_name,
        role              = excluded.role,
        status            = excluded.status,
        source_updated_at = excluded.source_updated_at,
        updated_at        = now()
    where excluded.source_updated_at > memberships.source_updated_at;

  if not found then
    return 'stale';
  end if;

  return 'applied';
end
$$;

revoke all on function
  public.clerk_sync_organization(text, text, text, text, text, timestamptz),
  public.clerk_sync_membership(text, text, text, text, text, text, text, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.clerk_sync_organization(text, text, text, text, text, timestamptz),
  public.clerk_sync_membership(text, text, text, text, text, text, text, timestamptz)
to service_role;

-- 0008 granted service_role every table that existed at the time; these two are
-- newer. The sync functions are SECURITY DEFINER so they do not strictly need
-- it, but leaving the gap would make any later direct query fail confusingly.
grant all on public.webhook_events, public.tenant_tombstones to service_role;

-- `authenticated` is deliberately granted NOTHING on either table.
