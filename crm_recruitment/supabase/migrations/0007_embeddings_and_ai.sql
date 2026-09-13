-- 0007_embeddings_and_ai.sql
-- Vector storage for candidate/job matching and Astra's context retrieval, plus
-- Astra's conversation history.
--
-- Embeddings live in sidecar tables rather than as columns on candidates/jobs.
-- A 1536-dimension vector is ~6KB; putting it on the parent row would drag it
-- into every board query and list view. Sidecars also give re-embedding a place
-- to record which model and which content hash produced the current vector.
--
-- Dimension is fixed at 1536 (OpenAI text-embedding-3-small). Changing embedding
-- models is a migration, not a config change, because the column type encodes the
-- dimension. All writes go through /lib/embeddings so the model stays consistent.

create table public.candidate_embeddings (
  candidate_id  uuid primary key,
  tenant_id     text not null references public.tenants(id) on delete cascade,
  embedding     extensions.vector(1536) not null,
  model         text not null,
  content_hash  text not null,                      -- skip re-embedding unchanged text
  updated_at    timestamptz not null default now(),
  foreign key (candidate_id, tenant_id)
    references public.candidates (id, tenant_id) on delete cascade
);

create index candidate_embeddings_tenant_idx on public.candidate_embeddings (tenant_id);
create index candidate_embeddings_hnsw_idx
  on public.candidate_embeddings using hnsw (embedding extensions.vector_cosine_ops);

create table public.job_embeddings (
  job_id        uuid primary key,
  tenant_id     text not null references public.tenants(id) on delete cascade,
  embedding     extensions.vector(1536) not null,
  model         text not null,
  content_hash  text not null,
  updated_at    timestamptz not null default now(),
  foreign key (job_id, tenant_id)
    references public.jobs (id, tenant_id) on delete cascade
);

create index job_embeddings_tenant_idx on public.job_embeddings (tenant_id);
create index job_embeddings_hnsw_idx
  on public.job_embeddings using hnsw (embedding extensions.vector_cosine_ops);

-- ---------------------------------------------------------------------------
-- Match functions
--
-- Two things about these are load-bearing:
--
-- 1. They are SECURITY INVOKER (the default -- note the absence of a
--    `security definer` clause, and do not add one). Marking a "system" helper
--    definer is a common instinct and here it would silently disable RLS and
--    merge every agency's candidates into one index scan.
--
-- 2. `hnsw.iterative_scan` is set per function and is not optional. RLS is a
--    filter, not a pre-filter: an HNSW scan finds its globally-best k rows and
--    only then are other tenants' rows dropped. Without iterative scanning a
--    small agency can ask for 20 matches and receive 3, because the index's top
--    20 belonged mostly to other tenants. Results are never cross-tenant wrong,
--    they are silently short. Requires pgvector >= 0.8; on an older build this
--    function will fail to create, which is the intended loud failure.
--
-- 3. search_path is 'extensions', not the empty string used elsewhere: the `<=>`
--    distance OPERATOR is resolved through search_path just like a bare type name
--    is, so an empty search_path makes these functions fail to resolve it. The
--    extensions schema is not user-writable, and every table reference below is
--    schema-qualified regardless.
--
-- The tenant predicate is written out explicitly even though RLS also applies.
-- Belt and braces, and it keeps the filter visible in EXPLAIN.
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
    and 1 - (je.embedding <=> ce.embedding) >= p_min_similarity
  order by je.embedding <=> ce.embedding
  limit p_limit
$$;

-- Free-text retrieval for Astra. The caller embeds the query through
-- /lib/embeddings and passes the vector; the tenant is never a parameter.
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
  order by ce.embedding <=> p_embedding
  limit p_limit
$$;

grant execute on function
  app.match_candidates_for_job(uuid, integer, double precision),
  app.match_jobs_for_candidate(uuid, integer, double precision),
  app.search_candidates_by_embedding(extensions.vector, integer)
to authenticated;

-- ---------------------------------------------------------------------------
-- Astra conversation history
-- ---------------------------------------------------------------------------

create table public.ai_conversations (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      text not null references public.tenants(id) on delete cascade,
  clerk_user_id  text not null,
  title          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (id, tenant_id)
);

create index ai_conversations_tenant_user_idx
  on public.ai_conversations (tenant_id, clerk_user_id, updated_at desc);

create trigger ai_conversations_touch_updated_at
  before update on public.ai_conversations
  for each row execute function app.touch_updated_at();

create table public.ai_messages (
  id               bigint generated always as identity primary key,
  tenant_id        text not null references public.tenants(id) on delete cascade,
  conversation_id  uuid not null,
  role             text not null check (role in ('user', 'assistant', 'system', 'tool')),
  content          text,
  tool_calls       jsonb,
  created_at       timestamptz not null default now(),
  foreign key (conversation_id, tenant_id)
    references public.ai_conversations (id, tenant_id) on delete cascade
);

create index ai_messages_conversation_idx
  on public.ai_messages (tenant_id, conversation_id, created_at);
