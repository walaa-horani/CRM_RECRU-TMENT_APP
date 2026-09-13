-- 03_webhook_sync.sql -- Clerk webhook sync: idempotency, ordering, revocation.
--
-- Runs after 02_isolation.sql and mutates the seeded agencies.

-- ===========================================================================
\echo '--- 16. a redelivered event is applied exactly once'
-- ===========================================================================
do $$
declare
  v_first  text;
  v_second text;
  v_name   text;
begin
  v_first := public.clerk_sync_organization(
    'msg_dedupe_1', 'organization.updated', 'org_a',
    'Alpha Recruiting Renamed', 'alpha', now());

  -- Same svix-id, different payload: this is what a Svix retry looks like when
  -- the original 200 was lost.
  v_second := public.clerk_sync_organization(
    'msg_dedupe_1', 'organization.updated', 'org_a',
    'SHOULD NOT BE APPLIED', 'alpha', now());

  if v_first <> 'applied' then
    raise exception 'TEST FAILED: first delivery returned %', v_first;
  end if;
  if v_second <> 'duplicate' then
    raise exception 'TEST FAILED: replay returned % instead of duplicate', v_second;
  end if;

  select name into v_name from public.tenants where id = 'org_a';
  if v_name <> 'Alpha Recruiting Renamed' then
    raise exception 'TEST FAILED: replay changed the row to %', v_name;
  end if;

  raise notice 'PASS: redelivered event deduped on svix-id, payload not reapplied';
end
$$;

-- ===========================================================================
\echo '--- 17. an out-of-order (stale) event does not clobber newer data'
-- ===========================================================================
do $$
declare
  v_outcome text;
  v_name    text;
begin
  -- Arrives late, carrying an older Clerk updated_at than what we hold.
  v_outcome := public.clerk_sync_organization(
    'msg_stale_1', 'organization.updated', 'org_a',
    'Stale Name From An Old Retry', 'alpha', now() - interval '1 hour');

  if v_outcome <> 'stale' then
    raise exception 'TEST FAILED: stale event returned %', v_outcome;
  end if;

  select name into v_name from public.tenants where id = 'org_a';
  if v_name <> 'Alpha Recruiting Renamed' then
    raise exception 'TEST FAILED: stale event overwrote the name with %', v_name;
  end if;

  raise notice 'PASS: out-of-order event rejected, newer data intact';
end
$$;

-- ===========================================================================
\echo '--- 18. a deleted organization cannot be resurrected by a late event'
-- ===========================================================================
do $$
declare
  v_outcome text;
  v_exists  boolean;
begin
  perform public.clerk_sync_organization(
    'msg_del_org', 'organization.deleted', 'org_gone', null, null, now());

  -- A stale update for the same org, redelivered after the delete.
  v_outcome := public.clerk_sync_organization(
    'msg_late_update', 'organization.updated', 'org_gone',
    'Zombie Agency', 'zombie', now() + interval '1 hour');

  if v_outcome <> 'tombstoned' then
    raise exception 'TEST FAILED: late update after delete returned %', v_outcome;
  end if;

  select exists (select 1 from public.tenants where id = 'org_gone') into v_exists;
  if v_exists then
    raise exception 'TEST FAILED: deleted organization was recreated';
  end if;

  raise notice 'PASS: tombstone blocks resurrection of a deleted agency';
end
$$;

-- ===========================================================================
\echo '--- 19. roles map onto admin/recruiter/coordinator, unknown ones degrade'
-- ===========================================================================
do $$
declare v_role text;
begin
  perform public.clerk_sync_membership(
    'msg_role_1', 'organizationMembership.created', 'org_a', 'user_a_new',
    'new@alpha.test', 'Nia New', 'org:recruiter', now());
  select role into v_role from public.memberships
  where tenant_id = 'org_a' and clerk_user_id = 'user_a_new';
  if v_role <> 'recruiter' then
    raise exception 'TEST FAILED: org:recruiter mapped to %', v_role;
  end if;

  -- Clerk's built-in role, which this app does not model.
  perform public.clerk_sync_membership(
    'msg_role_2', 'organizationMembership.updated', 'org_a', 'user_a_new',
    'new@alpha.test', 'Nia New', 'org:member', now() + interval '1 second');
  select role into v_role from public.memberships
  where tenant_id = 'org_a' and clerk_user_id = 'user_a_new';
  if v_role <> 'coordinator' then
    raise exception 'TEST FAILED: unknown org:member mapped to %, expected least privilege', v_role;
  end if;

  raise notice 'PASS: role mapping correct, unknown roles degrade to coordinator';
end
$$;

-- ===========================================================================
\echo '--- 20. REVOCATION: removal closes the database before the token expires'
-- ===========================================================================
do $$
declare
  v_before  bigint;
  v_after   bigint;
  v_status  text;
  v_blocked boolean := false;
begin
  execute 'set local role authenticated';
  -- A token that still names org_a, exactly as it would for the ~60 seconds
  -- between removal and the next Clerk token refresh.
  perform set_config('request.jwt.claims', tests.claims('user_a_new','org_a','coordinator'), true);

  select count(*) into v_before from public.candidates;
  if v_before = 0 then
    raise exception 'TEST FAILED: active member could not see candidates to begin with';
  end if;

  -- An admin removes them, mid-session.
  execute 'reset role';
  perform public.clerk_sync_membership(
    'msg_remove_1', 'organizationMembership.deleted', 'org_a', 'user_a_new',
    null, null, 'org:coordinator', now() + interval '2 seconds');

  select status into v_status from public.memberships
  where tenant_id = 'org_a' and clerk_user_id = 'user_a_new';
  if v_status <> 'removed' then
    raise exception 'TEST FAILED: membership status is % after removal', v_status;
  end if;

  -- Same unchanged token. The claim still says org_a.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_new','org_a','coordinator'), true);

  select count(*) into v_after from public.candidates;
  if v_after <> 0 then
    raise exception
      'TEST FAILED: removed user still sees % candidates on an unexpired token', v_after;
  end if;

  -- Writes too, not just reads.
  begin
    insert into public.candidates (tenant_id, full_name) values ('org_a', 'Ghost Write');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST FAILED: removed user wrote a candidate';
  end if;

  raise notice 'PASS: removal revokes read and write immediately, without waiting for token refresh';
end
$$;

-- ===========================================================================
\echo '--- 21. webhook lag must not lock out a legitimately added member'
-- ===========================================================================
do $$
declare v_count bigint;
begin
  execute 'set local role authenticated';
  -- Valid token for org_a, but organizationMembership.created has not arrived,
  -- so there is no mirror row at all. This must still work: the mirror is only
  -- ever allowed to subtract access, never to be a prerequisite for it.
  perform set_config('request.jwt.claims', tests.claims('user_a_unsynced','org_a','recruiter'), true);

  select count(*) into v_count from public.candidates;
  if v_count = 0 then
    raise exception
      'TEST FAILED: member with no mirror row was locked out; revocation check is not deny-only';
  end if;

  raise notice 'PASS: unsynced member keeps access (deny-only), % candidates visible', v_count;
end
$$;

-- ===========================================================================
\echo '--- 22. re-adding a removed member restores access'
-- ===========================================================================
do $$
declare v_count bigint;
begin
  perform public.clerk_sync_membership(
    'msg_readd_1', 'organizationMembership.created', 'org_a', 'user_a_new',
    'new@alpha.test', 'Nia New', 'org:recruiter', now() + interval '10 seconds');

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_new','org_a','recruiter'), true);

  select count(*) into v_count from public.candidates;
  if v_count = 0 then
    raise exception 'TEST FAILED: re-added member still locked out';
  end if;

  raise notice 'PASS: re-adding a member restores access';
end
$$;

-- ===========================================================================
\echo '--- 23. a membership event for an unknown org creates a usable stub'
-- ===========================================================================
do $$
declare v_outcome text; v_name text;
begin
  -- Membership and organization events race; Svix does not order them.
  v_outcome := public.clerk_sync_membership(
    'msg_race_1', 'organizationMembership.created', 'org_racy', 'user_racy',
    'racy@example.test', 'Racy User', 'org:admin', now());
  if v_outcome <> 'applied' then
    raise exception 'TEST FAILED: membership before organization returned %', v_outcome;
  end if;

  -- The real organization.created lands afterwards and fills in the name.
  perform public.clerk_sync_organization(
    'msg_race_2', 'organization.created', 'org_racy', 'Racy Agency', 'racy', now());

  select name into v_name from public.tenants where id = 'org_racy';
  if v_name <> 'Racy Agency' then
    raise exception 'TEST FAILED: stub tenant not filled in, name is %', v_name;
  end if;

  if not exists (
    select 1 from public.pipeline_stages where tenant_id = 'org_racy' and kind = 'source'
  ) then
    raise exception 'TEST FAILED: late organization.created did not seed the board';
  end if;

  raise notice 'PASS: out-of-order membership-before-organization resolves correctly';
end
$$;

-- ===========================================================================
\echo '--- 24. the snake_case event spelling also revokes (never reinstates)'
-- ===========================================================================
do $$
declare
  v_status text;
  v_count  bigint;
begin
  -- Clerk spells membership events 'organizationMembership.deleted' in its SDK
  -- types but 'organization_membership.deleted' in the dashboard and in JSON
  -- payloads, and verifyWebhook forwards the wire value verbatim. If the sync
  -- function matched one spelling by equality, the other would fall through to
  -- the upsert and set a REMOVED member back to 'active' -- turning a removal
  -- into a reinstatement. This pins the suffix matching that prevents it.
  perform public.clerk_sync_membership(
    'msg_snake_add', 'organization_membership.created', 'org_a', 'user_snake',
    'snake@alpha.test', 'Snake Case', 'org:recruiter', now());

  perform public.clerk_sync_membership(
    'msg_snake_del', 'organization_membership.deleted', 'org_a', 'user_snake',
    null, null, 'org:recruiter', now() + interval '1 second');

  select status into v_status from public.memberships
  where tenant_id = 'org_a' and clerk_user_id = 'user_snake';

  if v_status <> 'removed' then
    raise exception
      'TEST FAILED: snake_case delete left status %, expected removed', v_status;
  end if;

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_snake','org_a','recruiter'), true);
  select count(*) into v_count from public.candidates;
  if v_count <> 0 then
    raise exception 'TEST FAILED: snake_case-removed user still sees % candidates', v_count;
  end if;

  raise notice 'PASS: both event spellings revoke identically';
end
$$;

\echo ''
\echo '=== all webhook sync tests passed ==='
