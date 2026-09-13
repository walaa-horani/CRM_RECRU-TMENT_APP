-- 04_billing.sql -- Free vs Pro entitlements.
--
-- Seeded state: org_a is Pro/active, org_b is Free/active.
-- Runs after 03_webhook_sync.sql and mutates org_a's billing state.

-- ===========================================================================
\echo '--- 25. THE HEADLINE: a Free tenant cannot trigger AI, route or no route'
-- ===========================================================================
do $$
declare
  v_conv_blocked boolean := false;
  v_msg_blocked  boolean := false;
  v_matches      bigint;
begin
  -- Set-up runs as the table owner so the conversation exists regardless of
  -- policy -- otherwise this test could pass for the wrong reason.
  insert into public.ai_conversations (id, tenant_id, clerk_user_id, title)
  values ('f1111111-1111-1111-1111-111111111111', 'org_b', 'user_b_admin', 'Seeded by owner');

  execute 'set local role authenticated';
  -- A completely legitimate session: real user, real org, admin role. The only
  -- thing they lack is the Pro plan. This is someone hitting the API directly,
  -- bypassing every button and every route guard.
  perform set_config('request.jwt.claims', tests.claims('user_b_admin','org_b','admin'), true);

  begin
    insert into public.ai_conversations (tenant_id, clerk_user_id, title)
    values ('org_b', 'user_b_admin', 'Free tenant should not get this');
  exception when others then v_conv_blocked := true;
  end;

  begin
    insert into public.ai_messages (tenant_id, conversation_id, role, content)
    values ('org_b', 'f1111111-1111-1111-1111-111111111111', 'user', 'find me a python dev');
  exception when others then v_msg_blocked := true;
  end;

  if not v_conv_blocked then
    raise exception 'TEST FAILED: Free tenant created an AI conversation';
  end if;
  if not v_msg_blocked then
    raise exception 'TEST FAILED: Free tenant wrote an AI message -- the agent call would have run';
  end if;

  -- Vector matching is Pro as well.
  select count(*) into v_matches
  from public.match_candidates_for_job('b2222222-2222-2222-2222-222222222222', 20);
  if v_matches <> 0 then
    raise exception 'TEST FAILED: Free tenant got % vector matches', v_matches;
  end if;

  raise notice 'PASS: Free tenant blocked from AI writes and vector matching at the database';
end
$$;

-- ===========================================================================
\echo '--- 26. the gate is not just denying everyone: Pro works'
-- ===========================================================================
do $$
declare v_matches bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  insert into public.ai_conversations (id, tenant_id, clerk_user_id, title)
  values ('f2222222-2222-2222-2222-222222222222', 'org_a', 'user_a_rec', 'Pro thread');

  insert into public.ai_messages (tenant_id, conversation_id, role, content)
  values ('org_a', 'f2222222-2222-2222-2222-222222222222', 'user', 'shortlist for the senior role');

  select count(*) into v_matches
  from public.match_candidates_for_job('a1111111-1111-1111-1111-111111111111', 20);
  if v_matches = 0 then
    raise exception 'TEST FAILED: Pro tenant got no vector matches';
  end if;

  raise notice 'PASS: Pro tenant has AI and vector matching';
end
$$;

-- ===========================================================================
\echo '--- 27. Free is NOT read-only: full CRM writes still work'
-- ===========================================================================
do $$
declare v_id uuid;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_b_admin','org_b','admin'), true);

  -- The decision was "Free caps seats, not records". Writability keys off
  -- subscription STATUS, never off plan -- if these two axes were conflated,
  -- Free would silently become a read-only CRM.
  insert into public.candidates (tenant_id, full_name, email)
  values ('org_b', 'Free Plan Candidate', 'freeplan@example.test')
  returning id into v_id;

  update public.candidates set headline = 'Edited on Free' where id = v_id;

  if not exists (select 1 from public.candidates where id = v_id and headline = 'Edited on Free') then
    raise exception 'TEST FAILED: Free tenant could not write candidates';
  end if;

  raise notice 'PASS: Free plan keeps full CRM write access';
end
$$;

-- ===========================================================================
\echo '--- 28. past_due inside the grace window: writes yes, AI no'
-- ===========================================================================
do $$
declare
  v_blocked boolean := false;
  v_id      uuid;
begin
  update public.tenants
     set subscription_status = 'past_due',
         grace_period_ends_at = now() + interval '14 days'
   where id = 'org_a';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  -- Grace protects the customer relationship, so the CRM keeps working.
  insert into public.candidates (tenant_id, full_name)
  values ('org_a', 'Written During Grace') returning id into v_id;
  if v_id is null then
    raise exception 'TEST FAILED: writes blocked during the grace period';
  end if;

  -- But AI costs money per call, so it is revoked on day 0, not day 15.
  begin
    insert into public.ai_messages (tenant_id, conversation_id, role, content)
    values ('org_a', 'f2222222-2222-2222-2222-222222222222', 'user', 'still paying?');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST FAILED: AI still available on a past_due account';
  end if;

  raise notice 'PASS: grace period keeps writes, revokes AI immediately';
end
$$;

-- ===========================================================================
\echo '--- 29. past_due beyond grace: read-only, and admins keep the audit trail'
-- ===========================================================================
do $$
declare
  v_blocked boolean := false;
  v_reads   bigint;
  v_audit   bigint;
begin
  update public.tenants
     set subscription_status = 'past_due',
         grace_period_ends_at = now() - interval '1 day'
   where id = 'org_a';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  begin
    insert into public.candidates (tenant_id, full_name) values ('org_a', 'After Grace');
  exception when others then v_blocked := true;
  end;
  if not v_blocked then
    raise exception 'TEST FAILED: writes still allowed after the grace period';
  end if;

  select count(*) into v_reads from public.candidates;
  if v_reads = 0 then
    raise exception 'TEST FAILED: read-only tenant cannot read its own candidates';
  end if;

  -- audit_logs_select is the one read policy that consults a role, so it uses
  -- has_role() and NOT can_write(). If read-only had been implemented by
  -- redefining has_role(), this count would be zero and admins would lose sight
  -- of their own audit trail exactly when they most need it.
  select count(*) into v_audit from public.audit_logs;
  if v_audit = 0 then
    raise exception 'TEST FAILED: admin lost audit_logs access on a read-only tenant';
  end if;

  raise notice 'PASS: read-only preserves reads and admin audit access (% rows)', v_audit;
end
$$;

-- ===========================================================================
\echo '--- 30. cancelled: data retained and readable, every write refused'
-- ===========================================================================
do $$
declare
  v_candidates bigint;
  v_ins boolean := false;
  v_upd boolean := false;
  v_del boolean := false;
begin
  update public.tenants
     set subscription_status = 'canceled', grace_period_ends_at = null
   where id = 'org_a';

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_admin','org_a','admin'), true);

  -- The whole point of retaining data is being able to read and export it.
  select count(*) into v_candidates from public.candidates;
  if v_candidates = 0 then
    raise exception 'TEST FAILED: cancelled tenant cannot read its candidates';
  end if;

  begin
    insert into public.candidates (tenant_id, full_name) values ('org_a', 'Nope');
  exception when others then v_ins := true;
  end;
  begin
    update public.candidates set headline = 'Nope' where tenant_id = 'org_a';
  exception when others then v_upd := true;
  end;
  begin
    delete from public.candidates where tenant_id = 'org_a';
  exception when others then v_del := true;
  end;

  -- UPDATE and DELETE are filtered by USING before WITH CHECK runs, so they
  -- affect zero rows rather than raising. Either outcome is a refused write;
  -- assert on the data, not on the exception.
  if not v_ins then
    raise exception 'TEST FAILED: cancelled tenant inserted a candidate';
  end if;
  if exists (select 1 from public.candidates where tenant_id = 'org_a' and headline = 'Nope') then
    raise exception 'TEST FAILED: cancelled tenant updated a candidate';
  end if;
  if (select count(*) from public.candidates) <> v_candidates then
    raise exception 'TEST FAILED: cancelled tenant deleted candidates';
  end if;

  raise notice 'PASS: cancelled tenant keeps % readable candidates, all writes refused', v_candidates;
end
$$;

-- ===========================================================================
\echo '--- 31. billing webhook: dedupe and ordering, same as the other streams'
-- ===========================================================================
do $$
declare
  v_first  text;
  v_replay text;
  v_stale  text;
  v_plan   text;
  v_status text;
begin
  execute 'reset role';

  v_first := public.clerk_sync_subscription(
    'msg_sub_1', 'subscription.updated', 'org_a',
    'pro', 'active', 12, null, now());

  v_replay := public.clerk_sync_subscription(
    'msg_sub_1', 'subscription.updated', 'org_a',
    'free_org', 'canceled', 2, null, now());

  v_stale := public.clerk_sync_subscription(
    'msg_sub_2', 'subscription.updated', 'org_a',
    'free_org', 'canceled', 2, null, now() - interval '1 hour');

  if v_first <> 'applied' then
    raise exception 'TEST FAILED: first subscription event returned %', v_first;
  end if;
  if v_replay <> 'duplicate' then
    raise exception 'TEST FAILED: replayed subscription event returned %', v_replay;
  end if;
  if v_stale <> 'stale' then
    raise exception 'TEST FAILED: stale subscription event returned %', v_stale;
  end if;

  select plan, subscription_status into v_plan, v_status
  from public.tenants where id = 'org_a';

  if v_plan <> 'pro' or v_status <> 'active' then
    raise exception
      'TEST FAILED: a replay or stale event downgraded the tenant to %/%', v_plan, v_status;
  end if;

  raise notice 'PASS: billing webhook deduped and ordered; a replayed cancel did not downgrade';
end
$$;

-- ===========================================================================
\echo '--- 32. upgrade restores AI, and seats_used counts active members only'
-- ===========================================================================
do $$
declare
  v_seats integer;
  v_msgs  bigint;
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', tests.claims('user_a_rec','org_a','recruiter'), true);

  -- org_a was restored to pro/active by the previous test.
  insert into public.ai_messages (tenant_id, conversation_id, role, content)
  values ('org_a', 'f2222222-2222-2222-2222-222222222222', 'user', 'back on pro');

  select count(*) into v_msgs from public.ai_messages where tenant_id = 'org_a';
  if v_msgs = 0 then
    raise exception 'TEST FAILED: AI still blocked after returning to Pro';
  end if;

  execute 'reset role';
  select app.seats_used('org_a') into v_seats;

  -- Members removed in 03 (user_snake) must not be counted; pending Clerk
  -- invitations are not mirrored here and are added by the application layer.
  if v_seats = 0 then
    raise exception 'TEST FAILED: seats_used returned 0 for a populated agency';
  end if;
  if exists (
    select 1 from public.memberships
    where tenant_id = 'org_a' and status <> 'active'
      and clerk_user_id = 'user_snake'
  ) and v_seats >= (select count(*) from public.memberships where tenant_id = 'org_a') then
    raise exception 'TEST FAILED: seats_used counted non-active members';
  end if;

  raise notice 'PASS: upgrade restores AI; seats_used = % (active members only)', v_seats;
end
$$;

-- ===========================================================================
\echo '--- 33. every AI-cost table is gated, including ones added later'
-- ===========================================================================
do $$
declare v_missing text;
begin
  -- Catalog-driven rather than a hand-written list, for the same reason test 1
  -- is: the failure mode this guards against is someone adding an AI table in
  -- six months and forgetting the entitlement check. A hand-maintained list
  -- would be forgotten in exactly the same breath.
  select string_agg(format('%s.%s', p.tablename, p.policyname), ', ')
    into v_missing
  from pg_policies p
  where p.schemaname = 'public'
    and p.cmd = 'INSERT'
    and (p.tablename like 'ai\_%' or p.tablename like '%\_embeddings')
    and coalesce(p.with_check, '') not like '%ai_enabled%';

  if v_missing is not null then
    raise exception
      'TEST FAILED: AI-cost table with no ai_enabled() gate on INSERT: %', v_missing;
  end if;

  raise notice 'PASS: all % AI-cost INSERT policies gate on ai_enabled()',
    (select count(*) from pg_policies
      where schemaname = 'public' and cmd = 'INSERT'
        and (tablename like 'ai\_%' or tablename like '%\_embeddings'));
end
$$;

-- ===========================================================================
\echo '--- 34. Pro means unlimited seats, not the Free default'
-- ===========================================================================
do $$
declare
  v_seats integer;
  v_free  integer;
begin
  execute 'reset role';

  -- Clerk's Pro plan is configured with per-seat billing and NO member cap, so
  -- a Pro subscription event carries no seat quantity. Coalescing that to the
  -- previous value would leave a paying agency on the Free default of 2 and
  -- refuse its third recruiter.
  perform public.clerk_sync_subscription(
    'msg_seats_pro', 'subscription.updated', 'org_a',
    'pro', 'active', null, null, now() + interval '1 minute');

  select seats_purchased into v_seats from public.tenants where id = 'org_a';
  if v_seats is not null then
    raise exception
      'TEST FAILED: Pro with no quantity got a seat cap of %, expected unlimited', v_seats;
  end if;

  -- Free with no quantity must land on 2, not inherit Pro's unlimited.
  perform public.clerk_sync_subscription(
    'msg_seats_free', 'subscription.updated', 'org_b',
    'free_org', 'active', null, null, now() + interval '1 minute');

  select seats_purchased into v_free from public.tenants where id = 'org_b';
  if v_free is distinct from 2 then
    raise exception 'TEST FAILED: Free got % seats, expected 2', v_free;
  end if;

  -- An explicit quantity always wins, so a seat-capped tier later needs no change.
  perform public.clerk_sync_subscription(
    'msg_seats_explicit', 'subscription.updated', 'org_a',
    'pro', 'active', 25, null, now() + interval '2 minutes');

  select seats_purchased into v_seats from public.tenants where id = 'org_a';
  if v_seats <> 25 then
    raise exception 'TEST FAILED: explicit quantity ignored, got %', v_seats;
  end if;

  -- Leave org_a unlimited for anything downstream.
  perform public.clerk_sync_subscription(
    'msg_seats_restore', 'subscription.updated', 'org_a',
    'pro', 'active', null, null, now() + interval '3 minutes');

  raise notice 'PASS: Pro = unlimited seats, Free = 2, explicit quantity wins';
end
$$;

-- ===========================================================================
\echo '--- 35. Clerk plan slugs map to the canonical plan'
-- ===========================================================================
-- The dashboard slugs are `pro` and `free_org`. `free_org` is the trap: it is
-- not spelled `free`, and 0012 only ever got it right because everything
-- unrecognised fell through to free. This pins the mapping and the fallback.
do $$
declare
  v_plan  text;
  v_seats integer;
begin
  execute 'reset role';

  perform public.clerk_sync_subscription(
    'msg_slug_free', 'subscription.updated', 'org_b',
    'free_org', 'active', null, null, now() + interval '10 minutes');

  select plan, seats_purchased into v_plan, v_seats
    from public.tenants where id = 'org_b';
  if v_plan <> 'free' or v_seats is distinct from 2 then
    raise exception 'TEST FAILED: free_org mapped to plan=%, seats=%', v_plan, v_seats;
  end if;

  -- Case and stray whitespace must not decide entitlement.
  perform public.clerk_sync_subscription(
    'msg_slug_pro_case', 'subscription.updated', 'org_b',
    '  PRO  ', 'active', null, null, now() + interval '11 minutes');

  select plan, seats_purchased into v_plan, v_seats
    from public.tenants where id = 'org_b';
  if v_plan <> 'pro' or v_seats is not null then
    raise exception 'TEST FAILED: "  PRO  " mapped to plan=%, seats=%', v_plan, v_seats;
  end if;

  -- An unknown slug degrades to free rather than wedging the webhook. It also
  -- raises a warning, which is the only signal that a dashboard rename has
  -- just taken AI away from a paying agency.
  perform public.clerk_sync_subscription(
    'msg_slug_unknown', 'subscription.updated', 'org_b',
    'pro_annual_2027', 'active', null, null, now() + interval '12 minutes');

  select plan, seats_purchased into v_plan, v_seats
    from public.tenants where id = 'org_b';
  if v_plan <> 'free' or v_seats is distinct from 2 then
    raise exception 'TEST FAILED: unknown slug mapped to plan=%, seats=%', v_plan, v_seats;
  end if;

  -- Restore the seeded state for anything downstream.
  perform public.clerk_sync_subscription(
    'msg_slug_restore', 'subscription.updated', 'org_b',
    'free_org', 'active', null, null, now() + interval '13 minutes');

  raise notice 'PASS: pro/free_org map correctly, unknown slugs degrade to free';
end
$$;

-- ===========================================================================
\echo '--- 36. The `fea` claim cannot open the AI gate'
-- ===========================================================================
-- Clerk`s feature keys are `ai_agent` (Pro) and `2_seats` (Free). Adding a
-- feature to the Free plan in the dashboard must not grant anything: no policy
-- reads `fea`, and entitlement comes from the mirror.
do $$
declare
  v_uses_feature integer;
begin
  select count(*) into v_uses_feature
    from pg_policies
   where schemaname = 'public'
     and (coalesce(qual, '') || ' ' || coalesce(with_check, '')) like '%has_feature%';

  if v_uses_feature > 0 then
    raise exception
      'TEST FAILED: % policies gate on the fea claim; a dashboard feature toggle would grant access', v_uses_feature;
  end if;

  -- And the claim really does carry the Free feature without granting AI.
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object(
    'sub', 'user_b_admin',
    'o', json_build_object('id', 'org_b', 'rol', 'admin'),
    'pla', 'o:free_org',
    'fea', 'o:2_seats,o:ai_agent'
  )::text, true);

  if (select app.ai_enabled()) then
    raise exception 'TEST FAILED: a forged fea claim enabled AI for a Free tenant';
  end if;

  execute 'reset role';
  raise notice 'PASS: fea claims are diagnostics, never the gate';
end
$$;

\echo ''
\echo '=== all billing tests passed ==='
