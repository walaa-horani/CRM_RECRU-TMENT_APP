-- 0006_audit.sql
-- Append-only audit trail.
--
-- This table cannot follow the normal RLS pattern. Two constraints collide:
--   * clients must not be able to INSERT, or they can forge entries;
--   * the service role key is banned from user-facing request paths (rule 1),
--     so the app cannot write audit rows with elevated credentials either.
--
-- The resolution is that nothing writes here directly. Rows arrive only from
-- SECURITY DEFINER triggers that derive tenant and actor from the verified JWT
-- rather than from arguments, so a caller cannot choose what gets logged or
-- whose name is on it. Because the trigger is driven by the table it audits,
-- application code also cannot forget to log.
--
-- Consequence worth knowing: audit coverage now depends on trigger coverage. A
-- table added later without its audit trigger is silently unlogged.

create table public.audit_logs (
  id            bigint generated always as identity primary key,
  tenant_id     text not null references public.tenants(id) on delete cascade,
  actor_user_id text,                               -- Clerk user id; null for system writes
  actor_type    text not null default 'user'
                  check (actor_type in ('user', 'system', 'ai_agent')),
  action        text not null,                      -- 'application.stage_changed', 'offer.created', ...
  entity_type   text not null,
  entity_id     text,
  before        jsonb,
  after         jsonb,
  metadata      jsonb not null default '{}'::jsonb, -- ip, user agent, Astra tool call id
  created_at    timestamptz not null default now()
);

create index audit_logs_tenant_time_idx
  on public.audit_logs (tenant_id, created_at desc);
create index audit_logs_entity_idx
  on public.audit_logs (tenant_id, entity_type, entity_id);
create index audit_logs_actor_idx
  on public.audit_logs (tenant_id, actor_user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- The writer
--
-- Trigger arguments:
--   tg_argv[0]  entity prefix, e.g. 'offer'
--   tg_argv[1]  optional full action override, e.g. 'application.stage_changed'
-- ---------------------------------------------------------------------------

create or replace function app.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor  text := app.current_user_id();
  v_action text;
  v_before jsonb;
  v_after  jsonb;
  v_row    jsonb;
begin
  -- NEW is unassigned in a DELETE trigger and OLD is unassigned in an INSERT
  -- trigger, so branch explicitly instead of leaning on COALESCE or CASE to
  -- avoid touching them.
  if tg_op <> 'INSERT' then
    v_before := to_jsonb(old);
  end if;
  if tg_op <> 'DELETE' then
    v_after := to_jsonb(new);
  end if;

  v_row := coalesce(v_after, v_before);

  v_action := coalesce(
    tg_argv[1],
    tg_argv[0] || '.' || case tg_op
                           when 'INSERT' then 'created'
                           when 'UPDATE' then 'updated'
                           when 'DELETE' then 'deleted'
                         end
  );

  insert into public.audit_logs (
    tenant_id, actor_user_id, actor_type, action, entity_type, entity_id, before, after
  )
  values (
    v_row ->> 'tenant_id',
    v_actor,
    case when v_actor is null then 'system' else 'user' end,
    v_action,
    tg_table_name,
    -- Most tables key on `id`; memberships is composite, so fall back to the
    -- Clerk user id that identifies the row within its tenant.
    coalesce(v_row ->> 'id', v_row ->> 'clerk_user_id'),
    v_before,
    v_after
  );

  return null;
end
$$;

-- ---------------------------------------------------------------------------
-- Immutability
--
-- No UPDATE or DELETE policy exists for `authenticated` (see 0008), which stops
-- clients. This trigger additionally stops the service role and the table owner,
-- so "append-only" is true of every connection rather than only of the ones RLS
-- happens to govern. A future retention/purge job must drop this trigger
-- deliberately inside its own migration.
-- ---------------------------------------------------------------------------

create or replace function app.reject_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception '% is append-only; % is not permitted', tg_table_name, tg_op
    using errcode = 'insufficient_privilege';
end
$$;

create trigger audit_logs_immutable
  before update or delete on public.audit_logs
  for each row execute function app.reject_mutation();

create trigger application_stage_events_immutable
  before update or delete on public.application_stage_events
  for each row execute function app.reject_mutation();

-- ---------------------------------------------------------------------------
-- Coverage: the events AGENT.md rule 6 requires
-- ---------------------------------------------------------------------------

-- Candidate stage changes (the application row is what carries the stage).
create trigger applications_audit_stage
  after update of stage_kind on public.applications
  for each row
  when (old.stage_kind is distinct from new.stage_kind)
  execute function app.audit_row('application', 'application.stage_changed');

-- Offer creation and edits.
create trigger offers_audit
  after insert or update or delete on public.offers
  for each row execute function app.audit_row('offer');

-- Client and job creation (and subsequent edits, which are cheap to include).
create trigger clients_audit
  after insert or update or delete on public.clients
  for each row execute function app.audit_row('client');

create trigger jobs_audit
  after insert or update or delete on public.jobs
  for each row execute function app.audit_row('job');

-- Team permission changes. These arrive over the Clerk webhook's service_role
-- connection, so actor_user_id is null and actor_type resolves to 'system'.
create trigger memberships_audit
  after insert or delete on public.memberships
  for each row execute function app.audit_row('membership');

create trigger memberships_audit_role_change
  after update of role on public.memberships
  for each row
  when (old.role is distinct from new.role)
  execute function app.audit_row('membership', 'membership.role_changed');
