-- 01_seed.sql -- two agencies with overlapping-looking data. Runs as the table
-- owner, which bypasses RLS, exactly as the Clerk webhook's service_role does.

-- org_a is Pro (AI enabled), org_b is Free. The contrast is what the billing
-- tests in 04 exercise; the isolation tests in 02 need org_a on Pro because
-- vector matching is a Pro feature.
insert into public.tenants (id, name, slug, plan, seats_purchased, subscription_status) values
  ('org_a', 'Alpha Recruiting', 'alpha', 'pro',  10, 'active'),
  ('org_b', 'Beta Talent',      'beta',  'free',  2, 'active');

select app.seed_default_pipeline_stages('org_a');
select app.seed_default_pipeline_stages('org_b');

insert into public.memberships (tenant_id, clerk_user_id, email, full_name, role) values
  ('org_a', 'user_a_admin',  'admin@alpha.test',  'Ada Admin',        'admin'),
  ('org_a', 'user_a_rec',    'rec@alpha.test',    'Rey Recruiter',    'recruiter'),
  ('org_a', 'user_a_coord',  'coord@alpha.test',  'Cory Coordinator', 'coordinator'),
  ('org_b', 'user_b_admin',  'admin@beta.test',   'Bo Admin',         'admin');

insert into public.clients (id, tenant_id, name, domain, status, created_by) values
  ('11111111-1111-1111-1111-111111111111', 'org_a', 'Acme Corp',  'acme.test',  'active', 'user_a_admin'),
  ('22222222-2222-2222-2222-222222222222', 'org_b', 'Acme Corp',  'acme.test',  'active', 'user_b_admin');

insert into public.jobs (id, tenant_id, client_id, title, status, created_by) values
  ('a1111111-1111-1111-1111-111111111111', 'org_a', '11111111-1111-1111-1111-111111111111', 'Senior Engineer', 'open', 'user_a_admin'),
  ('b2222222-2222-2222-2222-222222222222', 'org_b', '22222222-2222-2222-2222-222222222222', 'Senior Engineer', 'open', 'user_b_admin');

-- Same human, both agencies. Two unrelated rows by design.
insert into public.candidates (id, tenant_id, full_name, email, created_by) values
  ('c1111111-1111-1111-1111-111111111111', 'org_a', 'Jane Doe',  'jane@example.test', 'user_a_rec'),
  ('c2222222-2222-2222-2222-222222222222', 'org_b', 'Jane Doe',  'jane@example.test', 'user_b_admin');

-- Filler candidates on both sides. org_b's are positioned ON the query vector
-- and org_a's are orthogonal to it, so a global top-k index scan is dominated
-- entirely by org_b -- which is exactly the condition that exposes an RLS
-- post-filter as a short result set.
insert into public.candidates (id, tenant_id, full_name, email)
select gen_random_uuid(), 'org_b', 'Filler B ' || g, 'fillerb' || g || '@example.test'
from generate_series(1, 40) g;

insert into public.candidates (id, tenant_id, full_name, email)
select gen_random_uuid(), 'org_a', 'Filler A ' || g, 'fillera' || g || '@example.test'
from generate_series(1, 40) g;

insert into public.applications (id, tenant_id, candidate_id, job_id, stage_id, stage_kind, created_by)
select 'd1111111-1111-1111-1111-111111111111', 'org_a',
       'c1111111-1111-1111-1111-111111111111', 'a1111111-1111-1111-1111-111111111111',
       s.id, s.kind, 'user_a_rec'
from public.pipeline_stages s where s.tenant_id = 'org_a' and s.kind = 'source';

insert into public.applications (id, tenant_id, candidate_id, job_id, stage_id, stage_kind, created_by)
select 'd2222222-2222-2222-2222-222222222222', 'org_b',
       'c2222222-2222-2222-2222-222222222222', 'b2222222-2222-2222-2222-222222222222',
       s.id, s.kind, 'user_b_admin'
from public.pipeline_stages s where s.tenant_id = 'org_b' and s.kind = 'source';

-- Test-only helper: a 1536-d unit vector with a 1 in position p_dim. Cosine
-- distance ignores magnitude, so vectors must differ in DIRECTION to be
-- distinguishable -- scaling one vector would leave it parallel and identical.
create or replace function public.test_unit_vector(p_dim integer)
returns extensions.vector
language sql
immutable
as $$
  select (
    select array_agg(case when i = p_dim then 1.0::real else 0.0::real end order by i)
    from generate_series(1, 1536) i
  )::extensions.vector
$$;

-- Jobs sit on dimension 1. org_b candidates sit on dimension 1 (similarity 1.0);
-- org_a candidates sit on dimension 2 (similarity 0.0).
insert into public.job_embeddings (job_id, tenant_id, embedding, model, content_hash)
select j.id, j.tenant_id, public.test_unit_vector(1), 'text-embedding-3-small', md5(j.id::text)
from public.jobs j;

insert into public.candidate_embeddings (candidate_id, tenant_id, embedding, model, content_hash)
select c.id, c.tenant_id,
       public.test_unit_vector(case when c.tenant_id = 'org_b' then 1 else 2 end),
       'text-embedding-3-small', md5(c.id::text)
from public.candidates c;

insert into storage.buckets (id, name, public) values ('resumes','resumes',false) on conflict do nothing;
