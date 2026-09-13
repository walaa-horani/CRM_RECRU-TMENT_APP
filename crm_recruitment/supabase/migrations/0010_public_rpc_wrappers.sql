-- 0010_public_rpc_wrappers.sql
-- PostgREST only exposes the schemas listed in the project's API settings, and
-- `public` is the only one there by default. The match functions live in `app`,
-- so supabase.rpc() cannot reach them.
--
-- Rather than depend on a dashboard setting that is invisible in this repo and
-- easy to lose on a project rebuild, expose thin wrappers in `public`. The
-- helper internals stay in `app`.
--
-- These are SECURITY INVOKER, like the functions they call. A wrapper marked
-- definer would re-open exactly the cross-tenant hole that 0007 is careful to
-- avoid, and it would be an easy thing to add by reflex when a call fails for an
-- unrelated permissions reason.

create or replace function public.match_candidates_for_job(
  p_job_id         uuid,
  p_limit          integer default 20,
  p_min_similarity double precision default 0.0
)
returns table (candidate_id uuid, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select * from app.match_candidates_for_job(p_job_id, p_limit, p_min_similarity)
$$;

create or replace function public.match_jobs_for_candidate(
  p_candidate_id   uuid,
  p_limit          integer default 20,
  p_min_similarity double precision default 0.0
)
returns table (job_id uuid, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select * from app.match_jobs_for_candidate(p_candidate_id, p_limit, p_min_similarity)
$$;

create or replace function public.search_candidates_by_embedding(
  p_embedding extensions.vector(1536),
  p_limit     integer default 10
)
returns table (candidate_id uuid, similarity double precision)
language sql
stable
set search_path = ''
as $$
  select * from app.search_candidates_by_embedding(p_embedding, p_limit)
$$;

-- Called by the Clerk webhook over PostgREST on organization.created. Granted to
-- service_role ONLY: seeding a board is not something a signed-in user does, and
-- an agency that has customised its stages must not be able to trigger a reseed.
create or replace function public.seed_default_pipeline_stages(p_tenant_id text)
returns void
language sql
set search_path = ''
as $$
  select app.seed_default_pipeline_stages(p_tenant_id)
$$;

revoke all on function public.seed_default_pipeline_stages(text)
  from public, anon, authenticated;
grant execute on function public.seed_default_pipeline_stages(text) to service_role;

revoke all on function
  public.match_candidates_for_job(uuid, integer, double precision),
  public.match_jobs_for_candidate(uuid, integer, double precision),
  public.search_candidates_by_embedding(extensions.vector, integer)
from public, anon;

grant execute on function
  public.match_candidates_for_job(uuid, integer, double precision),
  public.match_jobs_for_candidate(uuid, integer, double precision),
  public.search_candidates_by_embedding(extensions.vector, integer)
to authenticated;
