-- 0004_pipeline.sql
-- The hiring pipeline: canonical stage kinds, the per-tenant stage table agencies
-- customise, the application rows that move across the Kanban board, and the
-- state machine that governs those moves.

-- The canonical machine from SKILLS.md. Agencies may rename and reorder stages,
-- but every stage maps to one of these, and transitions are validated on the kind
-- -- so no amount of customisation lets a client skip a step.
create type public.stage_kind as enum (
  'source',
  'screening',
  'interviewing',
  'offer',
  'placed',
  'withdrawn'
);

-- ---------------------------------------------------------------------------
-- pipeline_stages: the customisation layer
--
-- `kind` is intentionally NOT unique per tenant. An agency that wants "Tech
-- Screen" and "Final Interview" as separate board columns creates two rows of
-- kind 'interviewing'. Moving between same-kind stages is always legal, which
-- falls out of the transition trigger for free.
-- ---------------------------------------------------------------------------

create table public.pipeline_stages (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    text not null references public.tenants(id) on delete cascade,
  kind         public.stage_kind not null,
  label        text not null,                       -- agency renames this freely
  position     integer not null,
  is_terminal  boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (id, tenant_id),
  -- Lets applications declare a composite FK on (stage_id, tenant_id, stage_kind),
  -- which is what stops the denormalised stage_kind from ever drifting out of sync
  -- with the stage it points at.
  unique (id, tenant_id, kind),
  -- Deferrable so a drag-and-drop reorder can renumber several rows in one
  -- transaction without tripping over itself mid-statement.
  constraint pipeline_stages_tenant_position_uk
    unique (tenant_id, position) deferrable initially deferred
);

create index pipeline_stages_tenant_idx on public.pipeline_stages (tenant_id, position);

create trigger pipeline_stages_touch_updated_at
  before update on public.pipeline_stages
  for each row execute function app.touch_updated_at();

-- Seeds the six canonical stages for a new agency. Called by the Clerk webhook
-- on organization.created, over the service_role connection.
create or replace function app.seed_default_pipeline_stages(p_tenant_id text)
returns void
language sql
set search_path = ''
as $$
  -- Idempotent via an explicit guard rather than ON CONFLICT: the
  -- (tenant_id, position) constraint is DEFERRABLE, and Postgres refuses to use
  -- a deferrable constraint as an ON CONFLICT arbiter.
  insert into public.pipeline_stages (tenant_id, kind, label, position, is_terminal)
  select p_tenant_id, v.kind::public.stage_kind, v.label, v.position, v.is_terminal
  from (values
    ('source',       'Sourced',      1, false),
    ('screening',    'Screening',    2, false),
    ('interviewing', 'Interviewing', 3, false),
    ('offer',        'Offer',        4, false),
    ('placed',       'Placed',       5, true),
    ('withdrawn',    'Withdrawn',    6, true)
  ) as v(kind, label, position, is_terminal)
  where not exists (
    select 1 from public.pipeline_stages ps where ps.tenant_id = p_tenant_id
  );
$$;

grant execute on function app.seed_default_pipeline_stages(text) to service_role;

-- ---------------------------------------------------------------------------
-- applications: one candidate against one job. This is the Kanban card.
-- ---------------------------------------------------------------------------

create table public.applications (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null references public.tenants(id) on delete cascade,
  candidate_id      uuid not null,
  job_id            uuid not null,
  stage_id          uuid not null,
  -- Denormalised from pipeline_stages so the transition trigger and every board
  -- query can filter and validate without a join. Kept honest by the composite FK
  -- below, not by application code.
  stage_kind        public.stage_kind not null,
  status            text not null default 'active'
                      check (status in ('active', 'withdrawn', 'rejected', 'placed')),
  rejected_reason   text,
  owner_user_id     text,
  created_by        text,
  applied_at        timestamptz not null default now(),
  stage_entered_at  timestamptz not null default now(),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, tenant_id),
  unique (tenant_id, candidate_id, job_id),
  foreign key (candidate_id, tenant_id)
    references public.candidates (id, tenant_id) on delete cascade,
  foreign key (job_id, tenant_id)
    references public.jobs (id, tenant_id) on delete cascade,
  foreign key (stage_id, tenant_id, stage_kind)
    references public.pipeline_stages (id, tenant_id, kind)
);

create index applications_tenant_idx        on public.applications (tenant_id);
create index applications_board_idx         on public.applications (tenant_id, job_id, stage_kind);
create index applications_tenant_cand_idx   on public.applications (tenant_id, candidate_id);
create index applications_tenant_stage_idx  on public.applications (tenant_id, stage_id);

create trigger applications_touch_updated_at
  before update on public.applications
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- application_stage_events: append-only pipeline history
-- ---------------------------------------------------------------------------

create table public.application_stage_events (
  id               bigint generated always as identity primary key,
  tenant_id        text not null references public.tenants(id) on delete cascade,
  application_id   uuid not null,
  from_stage_kind  public.stage_kind,
  to_stage_kind    public.stage_kind not null,
  changed_by       text,                            -- Clerk user id, null when system
  changed_at       timestamptz not null default now(),
  note             text,
  foreign key (application_id, tenant_id)
    references public.applications (id, tenant_id) on delete cascade
);

create index application_stage_events_app_idx
  on public.application_stage_events (tenant_id, application_id, changed_at desc);

-- ---------------------------------------------------------------------------
-- State machine enforcement
--
-- In the database, not in application code, so an API route, a Server Action, a
-- direct PostgREST call and an Astra tool call are all held to the same rules.
--
-- Legal moves: forward one step along source -> screening -> interviewing ->
-- offer -> placed, plus withdrawn from any non-terminal stage, plus movement
-- between two stages of the same kind (an agency's custom sub-columns).
--
-- NOTE: backward moves are rejected. That is a faithful reading of the documented
-- machine in SKILLS.md, but it does mean dragging a card left on the board fails.
-- If product wants that, add the reverse pairs here -- deliberately, in a
-- migration, rather than by loosening the check somewhere in the app.
-- ---------------------------------------------------------------------------

create or replace function app.enforce_stage_transition()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_allowed boolean;
begin
  if new.stage_kind = old.stage_kind then
    return new;                                     -- reorder within a kind
  end if;

  if old.stage_kind in ('placed', 'withdrawn') then
    raise exception
      'application % is in terminal stage % and cannot be moved', old.id, old.stage_kind
      using errcode = 'check_violation';
  end if;

  if new.stage_kind = 'withdrawn' then
    v_allowed := true;                              -- legal from any live stage
  else
    v_allowed := case old.stage_kind
      when 'source'       then new.stage_kind = 'screening'
      when 'screening'    then new.stage_kind = 'interviewing'
      when 'interviewing' then new.stage_kind = 'offer'
      when 'offer'        then new.stage_kind = 'placed'
      else false
    end;
  end if;

  if not v_allowed then
    raise exception
      'illegal stage transition % -> % on application %', old.stage_kind, new.stage_kind, old.id
      using errcode = 'check_violation';
  end if;

  new.stage_entered_at := now();

  -- Keep the coarse status column consistent with the terminal stages.
  if new.stage_kind = 'placed' then
    new.status := 'placed';
  elsif new.stage_kind = 'withdrawn' and new.status = 'active' then
    new.status := 'withdrawn';
  end if;

  return new;
end
$$;

create trigger applications_enforce_stage_transition
  before update of stage_kind, stage_id on public.applications
  for each row execute function app.enforce_stage_transition();

-- ---------------------------------------------------------------------------
-- Stage history writer
--
-- SECURITY DEFINER because application_stage_events has no INSERT policy -- see
-- 0008. Clients must not be able to forge or backdate pipeline history, so the
-- only path into that table is this trigger, which derives the actor from the
-- verified JWT rather than from anything the caller supplies.
-- ---------------------------------------------------------------------------

create or replace function app.record_stage_event()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from public.stage_kind;
begin
  -- OLD is unassigned in an INSERT trigger, so branch explicitly rather than
  -- relying on a CASE expression to avoid touching it.
  if tg_op = 'UPDATE' then
    v_from := old.stage_kind;
  end if;

  insert into public.application_stage_events (
    tenant_id, application_id, from_stage_kind, to_stage_kind, changed_by
  )
  values (
    new.tenant_id,
    new.id,
    v_from,
    new.stage_kind,
    app.current_user_id()
  );
  return null;
end
$$;

create trigger applications_record_stage_event_ins
  after insert on public.applications
  for each row execute function app.record_stage_event();

create trigger applications_record_stage_event_upd
  after update of stage_kind on public.applications
  for each row
  when (old.stage_kind is distinct from new.stage_kind)
  execute function app.record_stage_event();
