-- 0003_core_entities.sql
-- clients (employer companies), their contacts, jobs, and candidates.
--
-- Every table here carries `unique (id, tenant_id)`. That redundant-looking
-- constraint is what lets child tables declare a COMPOSITE foreign key
-- `(parent_id, tenant_id) references parent(id, tenant_id)`, which makes a
-- cross-tenant reference a foreign key violation rather than something only RLS
-- would have caught. Defence in depth behind RLS, not a replacement for it.

-- ---------------------------------------------------------------------------
-- clients: the employer companies an agency recruits for
-- ---------------------------------------------------------------------------

create table public.clients (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(id) on delete cascade,
  name           text not null,
  domain         extensions.citext,
  industry       text,
  status         text not null default 'prospect'
                   check (status in ('prospect', 'active', 'on_hold', 'archived')),
  notes          text,
  owner_user_id  text,                              -- Clerk user id of the account owner
  created_by     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, tenant_id)
);

create index clients_tenant_idx on public.clients (tenant_id);
create unique index clients_tenant_name_uk on public.clients (tenant_id, lower(name));

create trigger clients_touch_updated_at
  before update on public.clients
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- client_contacts: hiring managers and other people at the employer
-- ---------------------------------------------------------------------------

create table public.client_contacts (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   text not null references public.tenants(id) on delete cascade,
  client_id   uuid not null,
  full_name   text not null,
  email       extensions.citext,
  phone       text,
  title       text,
  is_primary  boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (id, tenant_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete cascade
);

create index client_contacts_tenant_idx on public.client_contacts (tenant_id);
create index client_contacts_client_idx on public.client_contacts (tenant_id, client_id);

create trigger client_contacts_touch_updated_at
  before update on public.client_contacts
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- jobs: an opening at a client
-- ---------------------------------------------------------------------------

create table public.jobs (
  id                 uuid primary key default gen_random_uuid(),
  tenant_id          text not null references public.tenants(id) on delete cascade,
  client_id          uuid not null,
  title              text not null,
  description        text,
  location           text,
  remote_type        text check (remote_type in ('onsite', 'hybrid', 'remote')),
  employment_type    text check (employment_type in ('permanent', 'contract', 'temp', 'internship')),
  salary_min         numeric(12, 2),
  salary_max         numeric(12, 2),
  currency           text default 'USD',
  openings           integer not null default 1 check (openings > 0),
  status             text not null default 'draft'
                       check (status in ('draft', 'open', 'on_hold', 'filled', 'closed')),
  owner_user_id      text,
  created_by         text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint jobs_salary_range_ck check (
    salary_min is null or salary_max is null or salary_min <= salary_max
  ),
  unique (id, tenant_id),
  foreign key (client_id, tenant_id)
    references public.clients (id, tenant_id) on delete cascade
);

create index jobs_tenant_idx        on public.jobs (tenant_id);
create index jobs_tenant_client_idx on public.jobs (tenant_id, client_id);
create index jobs_tenant_status_idx on public.jobs (tenant_id, status);

create trigger jobs_touch_updated_at
  before update on public.jobs
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- candidates
--
-- Deliberately duplicated per tenant: the same human applying through two
-- agencies is two unrelated rows with no shared key. That is the isolation
-- property this project wants. The cost is that a GDPR erasure request cannot be
-- satisfied with one delete -- see the erasure job noted in the plan.
-- ---------------------------------------------------------------------------

create table public.candidates (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           text not null references public.tenants(id) on delete cascade,
  full_name           text not null,
  email               extensions.citext,
  phone               text,
  headline            text,
  location            text,
  current_title       text,
  current_company     text,
  source              text,                        -- 'referral', 'linkedin', 'inbound', ...
  -- Object key in the private `resumes` bucket. Always built server-side as
  -- {tenant_id}/{candidate_id}/{filename}; never from a client-supplied path.
  resume_path         text,
  resume_text         text,                        -- extracted text, feeds embeddings
  skills              text[] not null default '{}',
  salary_expectation  numeric(12, 2),
  currency            text default 'USD',
  owner_user_id       text,
  created_by          text,
  gdpr_consent_at     timestamptz,
  delete_after        timestamptz,                 -- retention deadline, swept by a job
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (id, tenant_id)
);

create index candidates_tenant_idx on public.candidates (tenant_id);
create unique index candidates_tenant_email_uk
  on public.candidates (tenant_id, email) where email is not null;
create index candidates_skills_idx on public.candidates using gin (skills);

create trigger candidates_touch_updated_at
  before update on public.candidates
  for each row execute function app.touch_updated_at();
