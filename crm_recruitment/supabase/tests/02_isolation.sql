-- 02_isolation.sql -- the tests that actually matter.
--
-- Each block impersonates a real caller by setting the role to `authenticated`
-- and installing a Clerk-shaped JWT, then asserts on what that caller can see
-- and do. A failure raises with the prefix TEST FAILED.

create schema if not exists tests;

-- Builds a Clerk v2 session token for the given identity.
create or replace function tests.claims(p_user text, p_org text, p_role text)
returns text
language sql
immutable
as $fn$
  select case
    when p_org is null then
      json_build_object('sub', p_user, 'role', 'authenticated')::text
    else
      json_build_object(
        'sub', p_user, 'role', 'authenticated', 'v', 2,
        'o', json_build_object('id', p_org, 'rol', p_role)
      )::text
  end
$fn$;

-- Every tenant-scoped table, generated rather than hand-listed so a table added
-- later without RLS fails this suite instead of slipping through unnoticed.
create or replace view tests.tenant_tables as
  select c.relname as table_name, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and exists (
      select 1 from pg_attribute a
      where a.attrelid = c.oid and a.attname = 'tenant_id'
        and a.attnum > 0 and not a.attisdropped
    );

-- Tables that carry a tenant_id but are deliberately unreachable by any user:
-- infrastructure written only by the Clerk webhook over service_role. They are
-- exempt from the "must have a policy" rule below, but test 1 holds them to a
-- STRICTER bar instead -- RLS on, zero policies, no grants to `authenticated`.
--
-- Adding a name here is a decision about tenant isolation. A new table that is
-- merely forgotten still fails test 1.
create or replace view tests.service_role_only_tables as
  select * from (values
    ('tenant_tombstones'),
    ('webhook_events')
  ) as t(table_name);

-- The suite impersonates `authenticated`, so the harness objects must be
-- reachable from that role too.
grant usage on schema tests to authenticated;
grant select on tests.tenant_tables, tests.service_role_only_tables to authenticated;
grant execute on function tests.claims(text, text, text) to authenticated;

-- ===========================================================================
\echo '--- 1. every tenant-scoped table has RLS enabled and at least one policy'
-- ===========================================================================
do $$
declare
  v_missing text;
begin
  select string_agg(table_name, ', ') into v_missing
  from tests.tenant_tables where not relrowsecurity;
  if v_missing is not null then
    raise exception 'TEST FAILED: RLS not enabled on: %', v_missing;
  end if;

  select string_agg(t.table_name, ', ') into v_missing
  from tests.tenant_tables t
  where not exists (
    select 1 from pg_policies p
    where p.schemaname = 'public' and p.tablename = t.table_name
  )
  and t.table_name not in (select table_name from tests.service_role_only_tables);
  if v_missing is not null then
    raise exception 'TEST FAILED: no policy on: %', v_missing;
  end if;

  -- Exempt tables must be sealed, not merely skipped: any policy at all, or any
  -- grant to `authenticated`, means they are reachable and the exemption is wrong.
  select string_agg(e.table_name, ', ') into v_missing
  from tests.service_role_only_tables e
  where exists (
      select 1 from pg_policies p
      where p.schemaname = 'public' and p.tablename = e.table_name
    )
    or exists (
      select 1 from information_schema.role_table_grants g
      where g.table_schema = 'public'
        and g.table_name = e.table_name
        and g.grantee = 'authenticated'
    );
  if v_missing is not null then
    raise exception 'TEST FAILED: service-role-only table is reachable: %', v_missing;
  end if;

  raise notice 'PASS: % tenant-scoped tables with RLS + policies, % sealed service-role-only',
    (select count(*) from tests.tenant_tables
      where table_name not in (select table_name from tests.service_role_only_tables)),
    (select count(*) from tests.service_role_only_tables);
end
$$;

-- ===========================================================================
\echo '--- 2. cross-tenant reads return zero rows, on every table'
-- ===========================================================================
do $$
declare
  r        record;
  v_count  bigint;
  v_leaks  text := '';
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  -- Service-role-only tables are excluded: `authenticated` has no grant on
  -- them at all, so this loop would raise permission-denied rather than report
  -- a leak. Test 1 proves they are sealed.
  for r in
    select table_name from tests.tenant_tables
    where table_name not in (select table_name from tests.service_role_only_tables)
  loop
    execute format('select count(*) from public.%I where tenant_id <> %L', r.table_name, 'org_a')
      into v_count;
    if v_count > 0 then
      v_leaks := v_leaks || format('%s(%s) ', r.table_name, v_count);
    end if;
  end loop;

  if v_leaks <> '' then
    raise exception 'TEST FAILED: cross-tenant rows visible: %', v_leaks;
  end if;
  raise notice 'PASS: no cross-tenant rows visible from org_a';
end
$$;

-- ===========================================================================
\echo '--- 3. org_a sees its own data (policies are not just denying everything)'
-- ===========================================================================
do $$
declare v_c bigint; v_j bigint; v_cl bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  select count(*) into v_c  from public.candidates;
  select count(*) into v_j  from public.jobs;
  select count(*) into v_cl from public.clients;

  if v_c <> 41 or v_j <> 1 or v_cl <> 1 then
    raise exception 'TEST FAILED: org_a expected 41/1/1 candidates/jobs/clients, got %/%/%',
      v_c, v_j, v_cl;
  end if;
  raise notice 'PASS: org_a sees its own 41 candidates, 1 job, 1 client';
end
$$;

-- ===========================================================================
\echo '--- 4. a user with no active organization sees nothing'
-- ===========================================================================
do $$
declare v_count bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin', null, null), true);

  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'TEST FAILED: no-active-org user saw % candidates', v_count;
  end if;
  raise notice 'PASS: no-active-org session fails closed';
end
$$;

-- ===========================================================================
\echo '--- 5. re-homing a row to another tenant is rejected'
-- ===========================================================================
do $$
declare v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  begin
    update public.candidates set tenant_id = 'org_b'
    where id = 'c1111111-1111-1111-1111-111111111111';
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: recruiter re-homed a candidate to org_b';
  end if;
  raise notice 'PASS: tenant_id cannot be reassigned across agencies';
end
$$;

-- ===========================================================================
\echo '--- 6. audit_logs is unwritable and immutable'
-- ===========================================================================
do $$
declare v_ins boolean := false; v_upd boolean := false; v_del boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  begin
    insert into public.audit_logs (tenant_id, action, entity_type)
    values ('org_a','forged.event','candidate');
  exception when others then v_ins := true;
  end;

  begin
    update public.audit_logs set action = 'tampered' where tenant_id = 'org_a';
  exception when others then v_upd := true;
  end;

  begin
    delete from public.audit_logs where tenant_id = 'org_a';
  exception when others then v_del := true;
  end;

  if not (v_ins and v_upd and v_del) then
    raise exception 'TEST FAILED: audit_logs writable (insert=% update=% delete=%)',
      v_ins, v_upd, v_del;
  end if;
  raise notice 'PASS: audit_logs rejects insert, update and delete';
end
$$;

-- ===========================================================================
\echo '--- 7. the audit trail actually recorded the seeded writes'
-- ===========================================================================
do $$
declare v_count bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  select count(*) into v_count from public.audit_logs
  where action in ('client.created','job.created');

  if v_count < 2 then
    raise exception 'TEST FAILED: expected client.created and job.created audit rows, found %',
      v_count;
  end if;
  raise notice 'PASS: audit triggers fired on seeded client/job creation';
end
$$;

-- ===========================================================================
\echo '--- 8. a coordinator cannot create an offer; a recruiter can'
-- ===========================================================================
do $$
declare v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_coord','org_a','coordinator'), true);

  begin
    insert into public.offers (tenant_id, application_id, salary)
    values ('org_a', 'd1111111-1111-1111-1111-111111111111', 100000);
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: coordinator created an offer';
  end if;

  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);
  insert into public.offers (tenant_id, application_id, salary)
  values ('org_a', 'd1111111-1111-1111-1111-111111111111', 100000);

  raise notice 'PASS: offer creation is recruiter/admin only';
end
$$;

-- ===========================================================================
\echo '--- 9. memberships cannot be self-promoted'
-- ===========================================================================
do $$
declare v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_coord','org_a','coordinator'), true);

  begin
    update public.memberships set role = 'admin' where clerk_user_id = 'user_a_coord';
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: coordinator promoted themselves to admin';
  end if;
  raise notice 'PASS: memberships is read-only to clients';
end
$$;

-- ===========================================================================
\echo '--- 10. a cross-tenant foreign key is rejected independently of RLS'
-- ===========================================================================
do $$
declare v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  begin
    -- org_b's client id, inserted under org_a's tenant_id
    insert into public.client_contacts (tenant_id, client_id, full_name)
    values ('org_a', '22222222-2222-2222-2222-222222222222', 'Smuggled Contact');
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: cross-tenant client_id accepted';
  end if;
  raise notice 'PASS: composite FK blocks cross-tenant parent references';
end
$$;

-- ===========================================================================
\echo '--- 11. the stage machine: legal move allowed, skip and terminal rejected'
-- ===========================================================================
do $$
declare
  v_skip     boolean := false;
  v_terminal boolean := false;
  v_stage    public.stage_kind;
  v_events   bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  -- illegal: source -> offer
  begin
    update public.applications a
    set stage_id = s.id, stage_kind = s.kind
    from public.pipeline_stages s
    where a.id = 'd1111111-1111-1111-1111-111111111111'
      and s.tenant_id = 'org_a' and s.kind = 'offer';
  exception when others then v_skip := true;
  end;

  if not v_skip then
    raise exception 'TEST FAILED: source -> offer was allowed';
  end if;

  -- legal: source -> screening
  update public.applications a
  set stage_id = s.id, stage_kind = s.kind
  from public.pipeline_stages s
  where a.id = 'd1111111-1111-1111-1111-111111111111'
    and s.tenant_id = 'org_a' and s.kind = 'screening';

  select stage_kind into v_stage from public.applications
  where id = 'd1111111-1111-1111-1111-111111111111';

  if v_stage <> 'screening' then
    raise exception 'TEST FAILED: legal transition did not apply, stage is %', v_stage;
  end if;

  -- history recorded both the insert and the transition
  select count(*) into v_events from public.application_stage_events
  where application_id = 'd1111111-1111-1111-1111-111111111111';

  if v_events < 2 then
    raise exception 'TEST FAILED: expected insert + transition stage events, found %', v_events;
  end if;

  -- withdrawn is legal from any live stage
  update public.applications a
  set stage_id = s.id, stage_kind = s.kind
  from public.pipeline_stages s
  where a.id = 'd1111111-1111-1111-1111-111111111111'
    and s.tenant_id = 'org_a' and s.kind = 'withdrawn';

  -- but a terminal stage cannot be left
  begin
    update public.applications a
    set stage_id = s.id, stage_kind = s.kind
    from public.pipeline_stages s
    where a.id = 'd1111111-1111-1111-1111-111111111111'
      and s.tenant_id = 'org_a' and s.kind = 'screening';
  exception when others then v_terminal := true;
  end;

  if not v_terminal then
    raise exception 'TEST FAILED: moved an application out of a terminal stage';
  end if;

  raise notice 'PASS: stage machine enforces forward-only + withdrawn + terminal';
end
$$;

-- ===========================================================================
\echo '--- 12. vector search: tenant-clean AND full-length'
-- ===========================================================================
do $$
declare
  v_rows    bigint;
  v_foreign bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  select count(*) into v_rows
  from app.match_candidates_for_job('a1111111-1111-1111-1111-111111111111', 20);

  select count(*) into v_foreign
  from app.match_candidates_for_job('a1111111-1111-1111-1111-111111111111', 20) m
  join public.candidates c on c.id = m.candidate_id
  where c.tenant_id <> 'org_a';

  if v_foreign > 0 then
    raise exception 'TEST FAILED: % org_b candidates returned to org_a', v_foreign;
  end if;

  -- org_b owns the 40 vectors nearest the query. A search that post-filters
  -- would come back short here; a correct pre-filter returns the full 20.
  --
  -- CAVEAT, verified with EXPLAIN ANALYZE: at this row count the planner picks a
  -- bitmap scan over candidate_embeddings_tenant_idx, NOT the HNSW index. So this
  -- assertion proves tenant correctness and result completeness, but it does not
  -- yet exercise the HNSW post-filter shortfall -- that only appears once a table
  -- is large enough for the planner to choose the vector index. Re-run this
  -- against production-scale data before trusting hnsw.iterative_scan.
  if v_rows <> 20 then
    raise exception 'TEST FAILED: expected 20 matches, got % (post-filter shortfall)', v_rows;
  end if;

  raise notice 'PASS: vector search returned 20 org_a-only matches despite org_b owning the nearest vectors';
end
$$;

-- ===========================================================================
\echo '--- 13. Astra conversations are private to the individual recruiter'
-- ===========================================================================
do $$
declare v_count bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  insert into public.ai_conversations (id, tenant_id, clerk_user_id, title)
  values ('e1111111-1111-1111-1111-111111111111', 'org_a', 'user_a_rec', 'Private thread');

  -- a colleague in the SAME agency
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);
  select count(*) into v_count from public.ai_conversations;

  if v_count <> 0 then
    raise exception 'TEST FAILED: colleague saw % Astra threads belonging to another user', v_count;
  end if;
  raise notice 'PASS: Astra history is per-user, not per-tenant';
end
$$;

-- ===========================================================================
\echo '--- 14. storage: own tenant prefix writable, other tenant prefix not'
-- ===========================================================================
do $$
declare v_blocked boolean := false; v_count bigint;
begin
  execute 'set local role authenticated';

  -- org_b uploads a resume
  perform set_config('request.jwt.claims', tests.claims('user_b_admin','org_b','admin'), true);
  insert into storage.objects (bucket_id, name)
  values ('resumes', 'org_b/c2222222-2222-2222-2222-222222222222/cv.pdf');

  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  -- org_a cannot see it
  select count(*) into v_count from storage.objects;
  if v_count <> 0 then
    raise exception 'TEST FAILED: org_a saw % storage objects belonging to org_b', v_count;
  end if;

  -- and cannot write into org_b's prefix
  begin
    insert into storage.objects (bucket_id, name)
    values ('resumes', 'org_b/c2222222-2222-2222-2222-222222222222/planted.pdf');
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: org_a wrote into the org_b storage prefix';
  end if;

  -- its own prefix works
  insert into storage.objects (bucket_id, name)
  values ('resumes', 'org_a/c1111111-1111-1111-1111-111111111111/cv.pdf');

  raise notice 'PASS: storage isolated by tenant path prefix';
end
$$;

-- ===========================================================================
\echo '--- 15. public RPC wrappers are callable and correctly restricted'
-- ===========================================================================
do $$
declare
  v_rows    bigint;
  v_foreign bigint;
  v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  -- PostgREST only exposes `public`, so this is the path supabase.rpc() takes.
  -- It must behave identically to the app.* function it wraps.
  select count(*) into v_rows
  from public.match_candidates_for_job('a1111111-1111-1111-1111-111111111111', 20);

  select count(*) into v_foreign
  from public.match_candidates_for_job('a1111111-1111-1111-1111-111111111111', 20) m
  join public.candidates c on c.id = m.candidate_id
  where c.tenant_id <> 'org_a';

  if v_foreign > 0 or v_rows <> 20 then
    raise exception 'TEST FAILED: public wrapper returned % rows, % of them foreign', v_rows, v_foreign;
  end if;

  -- Seeding a board is a service_role operation. A signed-in user must not be
  -- able to reach it, or an agency could reseed stages it has customised.
  begin
    perform public.seed_default_pipeline_stages('org_a');
  exception when others then v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'TEST FAILED: authenticated user executed seed_default_pipeline_stages';
  end if;

  raise notice 'PASS: public RPC wrappers tenant-clean; seed function is service_role only';
end
$$;

\echo ''
\echo '=== all isolation tests passed ==='
