-- 0008_rls_policies.sql
-- Every row-level security policy in the database, in one file so the whole
-- isolation surface can be reviewed in a single diff.
--
-- The standard pattern, applied to most tables:
--
--   SELECT  same tenant
--   INSERT  same tenant + role allowed to create this thing
--   UPDATE  same tenant in USING, and same tenant again in WITH CHECK
--   DELETE  same tenant + admin
--
-- The WITH CHECK on UPDATE is the easy one to leave out and the expensive one to
-- miss: without it a recruiter can set tenant_id to another agency and hand the
-- row over.
--
-- Claim accessors are always wrapped in a scalar subquery -- `(select app.…)` --
-- so Postgres evaluates them once per statement via an initPlan rather than once
-- per row.
--
-- Fail-closed: app.current_tenant_id() returns NULL when the user has no active
-- Clerk organization, so `tenant_id = NULL` is NULL and no row qualifies. The
-- SELECT policies also say `is not null` explicitly so that intent survives
-- future edits.

-- ---------------------------------------------------------------------------
-- Enable RLS
--
-- FORCE additionally subjects the table owner to policies. It is applied
-- everywhere EXCEPT audit_logs and application_stage_events: those two are
-- written by SECURITY DEFINER triggers running as the table owner, and forcing
-- RLS on them would leave no legal write path at all. Their protection is that
-- no write policy exists plus an immutability trigger (0006).
-- ---------------------------------------------------------------------------

alter table public.tenants                  enable row level security;
alter table public.tenants                  force  row level security;
alter table public.memberships              enable row level security;
alter table public.memberships              force  row level security;
alter table public.clients                  enable row level security;
alter table public.clients                  force  row level security;
alter table public.client_contacts          enable row level security;
alter table public.client_contacts          force  row level security;
alter table public.jobs                     enable row level security;
alter table public.jobs                     force  row level security;
alter table public.candidates               enable row level security;
alter table public.candidates               force  row level security;
alter table public.pipeline_stages          enable row level security;
alter table public.pipeline_stages          force  row level security;
alter table public.applications             enable row level security;
alter table public.applications             force  row level security;
alter table public.interviews               enable row level security;
alter table public.interviews               force  row level security;
alter table public.interview_participants   enable row level security;
alter table public.interview_participants   force  row level security;
alter table public.offers                   enable row level security;
alter table public.offers                   force  row level security;
alter table public.candidate_embeddings     enable row level security;
alter table public.candidate_embeddings     force  row level security;
alter table public.job_embeddings           enable row level security;
alter table public.job_embeddings           force  row level security;
alter table public.ai_conversations         enable row level security;
alter table public.ai_conversations         force  row level security;
alter table public.ai_messages              enable row level security;
alter table public.ai_messages              force  row level security;

-- Written by SECURITY DEFINER triggers -- see note above. No FORCE.
alter table public.audit_logs               enable row level security;
alter table public.application_stage_events enable row level security;

-- ---------------------------------------------------------------------------
-- tenants -- mirror of Clerk. Read your own row, nothing else.
-- No write policies: the Clerk webhook's service_role connection is the only
-- writer, and it bypasses RLS.
-- ---------------------------------------------------------------------------

create policy tenants_select on public.tenants
  for select to authenticated
  using (
    id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

-- ---------------------------------------------------------------------------
-- memberships -- mirror of Clerk. Read-only, deliberately: a write path here is
-- a privilege-escalation vector (set your own role to 'admin').
-- ---------------------------------------------------------------------------

create policy memberships_select on public.memberships
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------

create policy clients_select on public.clients
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy clients_insert on public.clients
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy clients_update on public.clients
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy clients_delete on public.clients
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- client_contacts
-- ---------------------------------------------------------------------------

create policy client_contacts_select on public.client_contacts
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy client_contacts_insert on public.client_contacts
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy client_contacts_update on public.client_contacts
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy client_contacts_delete on public.client_contacts
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

-- ---------------------------------------------------------------------------
-- jobs
-- ---------------------------------------------------------------------------

create policy jobs_select on public.jobs
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy jobs_insert on public.jobs
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy jobs_update on public.jobs
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy jobs_delete on public.jobs
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- candidates
-- ---------------------------------------------------------------------------

create policy candidates_select on public.candidates
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy candidates_insert on public.candidates
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy candidates_update on public.candidates
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy candidates_delete on public.candidates
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- pipeline_stages -- board configuration, so admin-only to change.
-- ---------------------------------------------------------------------------

create policy pipeline_stages_select on public.pipeline_stages
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy pipeline_stages_insert on public.pipeline_stages
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

create policy pipeline_stages_update on public.pipeline_stages
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

create policy pipeline_stages_delete on public.pipeline_stages
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- applications -- the Kanban card. Coordinators move cards; the state machine
-- trigger (0004) decides whether a given move is legal.
-- ---------------------------------------------------------------------------

create policy applications_select on public.applications
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy applications_insert on public.applications
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy applications_update on public.applications
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy applications_delete on public.applications
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- application_stage_events -- readable history, no write policy. Rows arrive
-- only from app.record_stage_event().
-- ---------------------------------------------------------------------------

create policy application_stage_events_select on public.application_stage_events
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------

create policy interviews_select on public.interviews
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy interviews_insert on public.interviews
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy interviews_update on public.interviews
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy interviews_delete on public.interviews
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

-- ---------------------------------------------------------------------------
-- interview_participants
-- ---------------------------------------------------------------------------

create policy interview_participants_select on public.interview_participants
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy interview_participants_insert on public.interview_participants
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy interview_participants_update on public.interview_participants
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy interview_participants_delete on public.interview_participants
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

-- ---------------------------------------------------------------------------
-- offers -- money. Coordinators read but cannot create or change.
-- ---------------------------------------------------------------------------

create policy offers_select on public.offers
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy offers_insert on public.offers
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy offers_update on public.offers
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy offers_delete on public.offers
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- audit_logs -- admins read their own agency's trail. Nobody writes: no INSERT,
-- UPDATE or DELETE policy exists, and the immutability trigger in 0006 closes
-- the owner and service_role paths too.
-- ---------------------------------------------------------------------------

create policy audit_logs_select on public.audit_logs
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
    and (select app.has_role('admin'))
  );

-- ---------------------------------------------------------------------------
-- Embeddings -- written from user-facing paths via /lib/embeddings, so they need
-- real write policies rather than a service-role shortcut.
-- ---------------------------------------------------------------------------

create policy candidate_embeddings_select on public.candidate_embeddings
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy candidate_embeddings_insert on public.candidate_embeddings
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy candidate_embeddings_update on public.candidate_embeddings
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter', 'coordinator'))
  );

create policy candidate_embeddings_delete on public.candidate_embeddings
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy job_embeddings_select on public.job_embeddings
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
  );

create policy job_embeddings_insert on public.job_embeddings
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy job_embeddings_update on public.job_embeddings
  for update to authenticated
  using (tenant_id = (select app.current_tenant_id()))
  with check (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

create policy job_embeddings_delete on public.job_embeddings
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.has_role('admin', 'recruiter'))
  );

-- ---------------------------------------------------------------------------
-- Astra conversations -- tenant-scoped AND private to the individual recruiter.
-- A colleague in the same agency cannot read your Copilot history.
-- ---------------------------------------------------------------------------

create policy ai_conversations_select on public.ai_conversations
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
    and clerk_user_id = (select app.current_user_id())
  );

create policy ai_conversations_insert on public.ai_conversations
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
  );

create policy ai_conversations_update on public.ai_conversations
  for update to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
  )
  with check (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
  );

create policy ai_conversations_delete on public.ai_conversations
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and clerk_user_id = (select app.current_user_id())
  );

-- Messages inherit the conversation's ownership.
create policy ai_messages_select on public.ai_messages
  for select to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and (select app.current_tenant_id()) is not null
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = ai_messages.tenant_id
        and c.clerk_user_id = (select app.current_user_id())
    )
  );

create policy ai_messages_insert on public.ai_messages
  for insert to authenticated
  with check (
    tenant_id = (select app.current_tenant_id())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = ai_messages.tenant_id
        and c.clerk_user_id = (select app.current_user_id())
    )
  );

create policy ai_messages_delete on public.ai_messages
  for delete to authenticated
  using (
    tenant_id = (select app.current_tenant_id())
    and exists (
      select 1 from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.tenant_id = ai_messages.tenant_id
        and c.clerk_user_id = (select app.current_user_id())
    )
  );

-- ---------------------------------------------------------------------------
-- Grants
--
-- RLS decides which rows; grants decide whether the verb is available at all.
-- Where a table has no write policy, the grant is withheld as well, so a future
-- policy mistake alone cannot open a write path.
-- ---------------------------------------------------------------------------

revoke all on all tables    in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema app    from anon;

grant usage on schema public to authenticated, service_role;

grant select on public.tenants, public.memberships to authenticated;
grant select on public.audit_logs                  to authenticated;
grant select on public.application_stage_events    to authenticated;

grant select, insert, update, delete on
  public.clients,
  public.client_contacts,
  public.jobs,
  public.candidates,
  public.pipeline_stages,
  public.applications,
  public.interviews,
  public.interview_participants,
  public.offers,
  public.candidate_embeddings,
  public.job_embeddings,
  public.ai_conversations,
  public.ai_messages
to authenticated;

-- The webhook and background jobs run as service_role, which also has BYPASSRLS.
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
