-- 0012_billing.sql
-- Free vs Pro entitlements, enforced in the database.
--
-- The requirement driving this file: a Free-plan tenant must be unable to
-- trigger an AI agent call even holding a valid session token and knowing the
-- API route. A route guard cannot deliver that on its own -- not because a
-- caller forges a request (they cannot, the token is verified), but because the
-- second AI route added six months from now will forget to call it. Putting the
-- check in RLS means every route, Server Action, PostgREST call and Astra tool
-- inherits it and none of them can opt out.
--
-- Two axes, deliberately independent:
--
--   plan   (free | pro)                      -> gates the AI agent
--   status (active|trialing|past_due|canceled) -> gates ALL writes
--
-- Keeping them separate is what lets a Free tenant keep full CRM write access
-- (they simply have no AI), while a cancelled Pro tenant keeps full read access
-- and loses writes. Conflating the two would make Free read-only, which is not
-- the product.

-- ---------------------------------------------------------------------------
-- 1. Billing state on the tenant mirror
-- ---------------------------------------------------------------------------

alter table public.tenants
  add column subscription_status text not null default 'active'
    check (subscription_status in ('active', 'trialing', 'past_due', 'canceled')),
  add column grace_period_ends_at timestamptz,
  -- Billing events and organization events arrive on independent streams, so
  -- this is a SEPARATE ordering guard from source_updated_at. Sharing one would
  -- let an organization.updated discard a newer subscription change.
  add column plan_source_updated_at timestamptz not null default '-infinity'::timestamptz;

-- `plan` and `seats_purchased` already existed but were never populated.
alter table public.tenants alter column plan set default 'free';
alter table public.tenants alter column seats_purchased set default 2;
update public.tenants set plan = 'free' where plan is null;
update public.tenants set seats_purchased = 2 where seats_purchased is null;
alter table public.tenants alter column plan set not null;
alter table public.tenants
  add constraint tenants_plan_ck check (plan in ('free', 'pro'));

comment on column public.tenants.plan is
  'Clerk plan slug, matching the `pla` claim minus its o:/u: scope prefix. Gates AI only.';
comment on column public.tenants.subscription_status is
  'Gates writes. Independent of plan -- a Free tenant is active and fully writable.';

-- ---------------------------------------------------------------------------
-- 2. Claim readers
--
-- Clerk puts the plan and features in the session token itself:
--   "pla": "o:pro"        scope:planslug, o: when an organization is active
--   "fea": "o:ai_agent"   enabled features
--
-- These are used for cross-checks and diagnostics, NOT as the decision. See the
-- note on app.ai_enabled() for why.
-- ---------------------------------------------------------------------------

create or replace function app.current_plan()
returns text
language sql
stable
set search_path = ''
as $$
  select nullif(split_part(coalesce(auth.jwt() ->> 'pla', ''), ':', 2), '')
$$;

-- `fea` carries multiple features; split rather than compare, and treat an
-- unparseable claim as "no features" rather than as a match.
create or replace function app.has_feature(p_feature text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (
    select 1
    from unnest(string_to_array(coalesce(auth.jwt() ->> 'fea', ''), ',')) f
    where btrim(split_part(f, ':', 2)) = p_feature
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Entitlements
--
-- Both read the tenants mirror rather than the JWT claims, and that choice is
-- load-bearing. Clerk refreshes session tokens every 60 seconds, so `pla` is up
-- to a minute stale -- a downgraded tenant keeps presenting "o:pro" for that
-- minute. For a feature billed per call, that is the entire problem. The mirror
-- is written by the billing webhook and is current within ~200ms.
--
-- It also means an UPGRADE lands at webhook speed instead of token speed, which
-- is the better direction for someone who has just paid.
-- ---------------------------------------------------------------------------

create or replace function app.ai_enabled()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select t.plan = 'pro'
       -- past_due revokes AI on day 0, deliberately NOT riding the write grace
       -- period below: the grace period protects the customer relationship, and
       -- should not fund per-call vendor costs on an account that may never pay.
       and t.subscription_status in ('active', 'trialing')
    from public.tenants t
    where t.id = app.current_tenant_id()
  ), false)
$$;

create or replace function app.tenant_writable()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  -- Note what is absent: any reference to `plan`. Free is a fully writable
  -- plan; it just has no AI and fewer seats. Only the subscription STATUS can
  -- make a tenant read-only.
  select coalesce((
    select t.subscription_status in ('active', 'trialing')
        or (t.subscription_status = 'past_due'
            and t.grace_period_ends_at is not null
            and t.grace_period_ends_at > now())
    from public.tenants t
    where t.id = app.current_tenant_id()
  ), true)   -- no tenant row yet (webhook lag) -> writable; see membership_revoked
$$;

-- Role check AND write entitlement, in one predicate.
--
-- This exists rather than folding the check into app.has_role() because
-- has_role() is also used by audit_logs_select -- the ONLY read policy that
-- consults a role. Redefining has_role() would stop admins reading their own
-- audit trail after a downgrade, which is precisely backwards.
create or replace function app.can_write(variadic p_roles text[])
returns boolean
language sql
stable
set search_path = ''
as $$
  select app.has_role(variadic p_roles) and app.tenant_writable()
$$;

-- Active members only. Pending Clerk invitations are not mirrored here, so the
-- application layer adds them before comparing against seats_purchased -- see
-- lib/billing/entitlements.ts. Counting only accepted members would let several
-- simultaneous invites race past the limit.
create or replace function app.seats_used(p_tenant_id text)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::integer
  from public.memberships m
  where m.tenant_id = p_tenant_id
    and m.status = 'active'
$$;

grant execute on function
  app.current_plan(), app.has_feature(text), app.ai_enabled(),
  app.tenant_writable(), app.can_write(text[]), app.seats_used(text)
to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Rebuild the write policies on top of can_write()
--
-- Generated from a table rather than hand-written 33 times: the shape is
-- identical everywhere and only the role list varies, so a loop is both shorter
-- and less likely to contain a typo in a security predicate.
--
-- SELECT policies are deliberately NOT touched. Reads and exports must keep
-- working for Free, cancelled and past-due tenants -- retaining the data is
-- worthless if it cannot be read.
-- ---------------------------------------------------------------------------

do $$
declare
  r        record;
  v_tenant constant text := 'tenant_id = (select app.current_tenant_id())';
  v_roles  text;
  v_ai     text;
begin
  for r in
    select * from (values
      ('clients',                'insert', array['admin','recruiter'],                 false),
      ('clients',                'update', array['admin','recruiter'],                 false),
      ('clients',                'delete', array['admin'],                             false),
      ('client_contacts',        'insert', array['admin','recruiter','coordinator'],   false),
      ('client_contacts',        'update', array['admin','recruiter','coordinator'],   false),
      ('client_contacts',        'delete', array['admin','recruiter'],                 false),
      ('jobs',                   'insert', array['admin','recruiter'],                 false),
      ('jobs',                   'update', array['admin','recruiter'],                 false),
      ('jobs',                   'delete', array['admin'],                             false),
      ('candidates',             'insert', array['admin','recruiter','coordinator'],   false),
      ('candidates',             'update', array['admin','recruiter','coordinator'],   false),
      ('candidates',             'delete', array['admin'],                             false),
      ('pipeline_stages',        'insert', array['admin'],                             false),
      ('pipeline_stages',        'update', array['admin'],                             false),
      ('pipeline_stages',        'delete', array['admin'],                             false),
      ('applications',           'insert', array['admin','recruiter','coordinator'],   false),
      ('applications',           'update', array['admin','recruiter','coordinator'],   false),
      ('applications',           'delete', array['admin'],                             false),
      ('interviews',             'insert', array['admin','recruiter','coordinator'],   false),
      ('interviews',             'update', array['admin','recruiter','coordinator'],   false),
      ('interviews',             'delete', array['admin','recruiter'],                 false),
      ('interview_participants', 'insert', array['admin','recruiter','coordinator'],   false),
      ('interview_participants', 'update', array['admin','recruiter','coordinator'],   false),
      ('interview_participants', 'delete', array['admin','recruiter','coordinator'],   false),
      ('offers',                 'insert', array['admin','recruiter'],                 false),
      ('offers',                 'update', array['admin','recruiter'],                 false),
      ('offers',                 'delete', array['admin'],                             false),
      -- Embeddings cost money to produce, so writing one is an AI operation even
      -- though no chat is involved. A Free agency importing 10,000 resumes would
      -- otherwise run up embedding spend without ever opening Astra.
      ('candidate_embeddings',   'insert', array['admin','recruiter','coordinator'],   true),
      ('candidate_embeddings',   'update', array['admin','recruiter','coordinator'],   true),
      ('candidate_embeddings',   'delete', array['admin','recruiter'],                 false),
      ('job_embeddings',         'insert', array['admin','recruiter'],                 true),
      ('job_embeddings',         'update', array['admin','recruiter'],                 true),
      ('job_embeddings',         'delete', array['admin','recruiter'],                 false)
    ) as t(tbl, cmd, roles, needs_ai)
  loop
    v_roles := (
      select string_agg(quote_literal(x), ', ')
      from unnest(r.roles) x
    );
    v_ai := case when r.needs_ai then ' and (select app.ai_enabled())' else '' end;

    execute format('drop policy if exists %I on public.%I', r.tbl || '_' || r.cmd, r.tbl);

    if r.cmd = 'insert' then
      execute format(
        'create policy %I on public.%I for insert to authenticated
           with check (%s and (select app.can_write(%s))%s)',
        r.tbl || '_insert', r.tbl, v_tenant, v_roles, v_ai);

    elsif r.cmd = 'update' then
      execute format(
        'create policy %I on public.%I for update to authenticated
           using (%s)
           with check (%s and (select app.can_write(%s))%s)',
        r.tbl || '_update', r.tbl, v_tenant, v_tenant, v_roles, v_ai);

    else
      execute format(
        'create policy %I on public.%I for delete to authenticated
           using (%s and (select app.can_write(%s))%s)',
        r.tbl || '_delete', r.tbl, v_tenant, v_roles, v_ai);
    end if;
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5. The AI tables
--
-- These are keyed on individual ownership rather than role, so they are written
-- out instead of generated. Inserting an ai_message IS the AI call being
-- recorded, which makes this the narrowest possible chokepoint on the feature.
-- ---------------------------------------------------------------------------

drop policy if exists ai_conversations_insert on public.ai_conversations;
create policy ai_conversations_insert on public.ai_conversations
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
    and (select app.ai_enabled())
  );

drop policy if exists ai_conversations_update on public.ai_conversations;
create policy ai_conversations_update on public.ai_conversations
  for update to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
  )
  with check (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
    and (select app.ai_enabled())
  );

drop policy if exists ai_messages_insert on public.ai_messages;
create policy ai_messages_insert on public.ai_messages
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.ai_enabled())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = ai_messages.tenant_id
        and c.clerk_user_id = (select app.current_user_id())
    )
  );

-- DELETE is intentionally left alone on both tables: a downgraded tenant must
-- still be able to clear its own AI history.

-- ---------------------------------------------------------------------------
-- 6. Vector matching is a Pro feature
--
-- Redefinitions of the 0007 functions, with the entitlement added. Still
-- SECURITY INVOKER -- adding `security definer` here would disable RLS and undo
-- both the tenant filter and this gate.
-- ---------------------------------------------------------------------------

create or replace function app.match_candidates_for_job(
  p_job_id  uuid,
  p_limit   integer default 20,
  p_min_similarity double precision default 0.0
)
returns table (candidate_id uuid, similarity double precision)
language sql
stable
set search_path = 'extensions'
set hnsw.iterative_scan = 'strict_order'
as $$
  select ce.candidate_id,
         1 - (ce.embedding <=> je.embedding) as similarity
  from public.job_embeddings je
  join public.candidate_embeddings ce
    on ce.tenant_id = je.tenant_id
  where je.job_id = p_job_id
    and je.tenant_id = (select app.current_tenant_id())
    and (select app.ai_enabled())
    and 1 - (ce.embedding <=> je.embedding) >= p_min_similarity
  order by ce.embedding <=> je.embedding
  limit p_limit
$$;

create or replace function app.match_jobs_for_candidate(
  p_candidate_id uuid,
  p_limit        integer default 20,
  p_min_similarity double precision default 0.0
)
returns table (job_id uuid, similarity double precision)
language sql
stable
set search_path = 'extensions'
set hnsw.iterative_scan = 'strict_order'
as $$
  select je.job_id,
         1 - (je.embedding <=> ce.embedding) as similarity
  from public.candidate_embeddings ce
  join public.job_embeddings je
    on je.tenant_id = ce.tenant_id
  where ce.candidate_id = p_candidate_id
    and ce.tenant_id = (select app.current_tenant_id())
    and (select app.ai_enabled())
    and 1 - (je.embedding <=> ce.embedding) >= p_min_similarity
  order by je.embedding <=> ce.embedding
  limit p_limit
$$;

create or replace function app.search_candidates_by_embedding(
  p_embedding extensions.vector(1536),
  p_limit     integer default 10
)
returns table (candidate_id uuid, similarity double precision)
language sql
stable
set search_path = 'extensions'
set hnsw.iterative_scan = 'strict_order'
as $$
  select ce.candidate_id,
         1 - (ce.embedding <=> p_embedding) as similarity
  from public.candidate_embeddings ce
  where ce.tenant_id = (select app.current_tenant_id())
    and (select app.ai_enabled())
  order by ce.embedding <=> p_embedding
  limit p_limit
$$;

-- ---------------------------------------------------------------------------
-- 7. Billing webhook sync
--
-- Same construction as clerk_sync_organization / clerk_sync_membership in 0011:
-- dedupe on svix-id, ordering guard, one transaction.
-- ---------------------------------------------------------------------------

create or replace function public.clerk_sync_subscription(
  p_svix_id      text,
  p_event_type   text,
  p_org_id       text,
  p_plan         text,
  p_status       text,
  p_seats        integer,
  p_grace_until  timestamptz,
  p_updated_at   timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan   text;
  v_status text;
begin
  insert into public.webhook_events (svix_id, event_type)
  values (p_svix_id, p_event_type)
  on conflict (svix_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  if exists (select 1 from public.tenant_tombstones t where t.tenant_id = p_org_id) then
    return 'tombstoned';
  end if;

  -- Unknown plan slugs fall back to 'free' rather than failing the constraint:
  -- a plan renamed in the Clerk dashboard should downgrade access, not wedge
  -- the webhook into a permanent retry loop.
  v_plan := case when p_plan = 'pro' then 'pro' else 'free' end;
  v_status := case
    when p_status in ('active', 'trialing', 'past_due', 'canceled') then p_status
    else 'active'
  end;

  update public.tenants
     set plan                   = v_plan,
         subscription_status    = v_status,
         seats_purchased        = coalesce(p_seats, seats_purchased),
         grace_period_ends_at   = p_grace_until,
         plan_source_updated_at = p_updated_at,
         updated_at             = now()
   where id = p_org_id
     and plan_source_updated_at < p_updated_at;

  if not found then
    return 'stale';
  end if;

  return 'applied';
end
$$;

revoke all on function
  public.clerk_sync_subscription(text, text, text, text, text, integer, timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.clerk_sync_subscription(text, text, text, text, text, integer, timestamptz, timestamptz)
to service_role;
