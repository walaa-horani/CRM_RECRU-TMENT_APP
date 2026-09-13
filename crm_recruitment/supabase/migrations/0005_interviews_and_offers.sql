-- 0005_interviews_and_offers.sql

-- ---------------------------------------------------------------------------
-- interviews
-- ---------------------------------------------------------------------------

create table public.interviews (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         text not null references public.tenants(id) on delete cascade,
  application_id    uuid not null,
  round             integer not null default 1 check (round > 0),
  scheduled_at      timestamptz not null,
  duration_minutes  integer not null default 60 check (duration_minutes > 0),
  timezone          text not null default 'UTC',
  mode              text not null default 'video'
                      check (mode in ('phone', 'video', 'onsite')),
  location_or_link  text,
  status            text not null default 'scheduled'
                      check (status in ('scheduled', 'completed', 'cancelled', 'no_show')),
  feedback          text,
  rating            integer check (rating between 1 and 5),
  outcome           text check (outcome in ('advance', 'reject', 'hold')),
  created_by        text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (application_id, tenant_id)
    references public.applications (id, tenant_id) on delete cascade
);

create index interviews_tenant_idx      on public.interviews (tenant_id);
create index interviews_app_idx         on public.interviews (tenant_id, application_id);
create index interviews_scheduled_idx   on public.interviews (tenant_id, scheduled_at);

create trigger interviews_touch_updated_at
  before update on public.interviews
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- interview_participants
--
-- An interviewer is one of three things, and only one of the three identity
-- columns may be set. A 'client_contact' or 'external' participant has no Clerk
-- identity and therefore no JWT, which means RLS cannot authorise them directly.
-- If external interviewers ever need to submit feedback through a link, that path
-- needs a signed single-purpose token and a service_role read scoped to exactly
-- one interview row -- an explicit, audited exception, not a loosened policy.
-- ---------------------------------------------------------------------------

create table public.interview_participants (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          text not null references public.tenants(id) on delete cascade,
  interview_id       uuid not null,
  participant_type   text not null
                       check (participant_type in ('recruiter', 'client_contact', 'external')),
  clerk_user_id      text,
  client_contact_id  uuid,
  external_email     extensions.citext,
  external_name      text,
  is_organizer       boolean not null default false,
  created_at         timestamptz not null default now(),
  constraint interview_participants_identity_ck check (
    num_nonnulls(clerk_user_id, client_contact_id, external_email) = 1
  ),
  constraint interview_participants_type_matches_ck check (
    (participant_type = 'recruiter'      and clerk_user_id     is not null) or
    (participant_type = 'client_contact' and client_contact_id is not null) or
    (participant_type = 'external'       and external_email    is not null)
  ),
  foreign key (interview_id, tenant_id)
    references public.interviews (id, tenant_id) on delete cascade,
  foreign key (client_contact_id, tenant_id)
    references public.client_contacts (id, tenant_id) on delete cascade
);

create index interview_participants_interview_idx
  on public.interview_participants (tenant_id, interview_id);

-- ---------------------------------------------------------------------------
-- offers
--
-- Edits are captured as before/after JSONB in audit_logs (see 0006) rather than
-- in a separate versions table -- the audit trail is required anyway, so a second
-- history mechanism would only be a second thing to keep correct.
-- ---------------------------------------------------------------------------

create table public.offers (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       text not null references public.tenants(id) on delete cascade,
  application_id  uuid not null,
  salary          numeric(12, 2) not null,
  currency        text not null default 'USD',
  bonus           numeric(12, 2),
  equity          text,
  start_date      date,
  status          text not null default 'draft'
                    check (status in ('draft', 'sent', 'accepted', 'declined', 'withdrawn', 'expired')),
  sent_at         timestamptz,
  responded_at    timestamptz,
  expires_at      timestamptz,
  notes           text,
  created_by      text,
  approved_by     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (application_id, tenant_id)
    references public.applications (id, tenant_id) on delete cascade
);

create index offers_tenant_idx     on public.offers (tenant_id);
create index offers_app_idx        on public.offers (tenant_id, application_id);
create index offers_status_idx     on public.offers (tenant_id, status);

create trigger offers_touch_updated_at
  before update on public.offers
  for each row execute function app.touch_updated_at();
