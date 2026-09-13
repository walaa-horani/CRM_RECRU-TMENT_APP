# Schema isolation tests

These exercise tenant isolation directly against Postgres by impersonating real
callers — setting the role to `authenticated` and installing a Clerk-shaped JWT —
rather than trusting that the application layer passes the right `tenant_id`.

## Files

| File | Purpose |
|---|---|
| `00_shim_supabase.sql` | **Local harness only.** Recreates the parts of Supabase the migrations depend on (`auth.jwt()`, the `anon`/`authenticated`/`service_role` roles, a minimal `storage` schema). Never apply this to a Supabase project. |
| `01_seed.sql` | Two agencies with deliberately confusable data: the same client name, the same candidate email, and 40 filler candidates per side. |
| `02_isolation.sql` | Tenant isolation assertions. Any failure raises with the prefix `TEST FAILED`. |
| `03_webhook_sync.sql` | Clerk sync: idempotency, out-of-order delivery, and mid-session revocation. |
| `04_billing.sql` | Free vs Pro entitlements, read-only downgrade, and the AI gate. |
| `run.sh` | Drops, re-applies everything, seeds, runs the suite. |

## Running against a throwaway container

```bash
docker run -d --name crm-schema-test -e POSTGRES_PASSWORD=postgres \
  -p 55432:5432 pgvector/pgvector:pg17

docker cp supabase/. crm-schema-test:/sql
docker exec crm-schema-test bash /sql/tests/run.sh
```

Requires pgvector ≥ 0.8 for `hnsw.iterative_scan`; the image above ships 0.8.6.

## Running against Supabase

Skip the shim — Supabase provides all of it natively:

```bash
supabase db reset          # applies supabase/migrations in order
psql "$DATABASE_URL" -f supabase/tests/01_seed.sql
psql "$DATABASE_URL" -f supabase/tests/02_isolation.sql
```

## What is covered

1. Every tenant-scoped table has RLS enabled and at least one policy. The table
   list is **generated from the catalog**, not hand-maintained, so a table added
   later without RLS fails this test rather than slipping through.
2. Cross-tenant reads return zero rows, on every tenant-scoped table.
3. The positive control — org_a really does see its own data, so the policies
   are not simply denying everything.
4. A session with no active Clerk organization sees nothing (fails closed).
5. `tenant_id` cannot be reassigned to another agency on UPDATE.
6. `audit_logs` rejects insert, update and delete.
7. The audit triggers actually fired on the seeded writes.
8. Offer creation is recruiter/admin only; a coordinator is refused.
9. A coordinator cannot promote themselves in `memberships`.
10. A cross-tenant foreign key is rejected by the composite FK, independently of RLS.
11. The stage machine: forward-only, `withdrawn` from anywhere, terminal stages sealed.
12. Vector search returns only the caller's candidates, and returns the full
    requested `limit`, even though the other agency owns the nearest vectors.
13. Astra conversation history is private per user, not merely per tenant.
14. Storage is isolated by the tenant path prefix, in both directions.
15. The `public` RPC wrappers (the path `supabase.rpc()` actually takes) behave
    identically to the `app.*` functions they wrap, and `seed_default_pipeline_stages`
    is unreachable for a signed-in user.

### Clerk sync (`03_webhook_sync.sql`)

16. A redelivered event (same `svix-id`, different payload) is deduped and the
    replayed payload is not applied.
17. An out-of-order event carrying an older Clerk `updated_at` is rejected as
    stale and does not clobber newer data.
18. A deleted organization cannot be resurrected by a late event.
19. Roles map to admin/recruiter/coordinator; unrecognised roles — including
    Clerk's built-in `org:member` — degrade to least privilege.
20. **Revocation.** A removed member holding a still-valid token that names the
    agency gets zero rows and cannot write. This is the ≤60s stale-claim window,
    closed.
21. The inverse: a member whose `organizationMembership.created` has not arrived
    yet keeps access. The mirror may only subtract access, never gate it.
22. Re-adding a removed member restores access.
23. A membership event arriving before its organization event resolves correctly.
24. Both event spellings (`organizationMembership.*` and `organization_membership.*`)
    revoke identically — the wrong one would turn a removal into a reinstatement.

### Billing (`04_billing.sql`)

Seeded state: `org_a` is Pro/active, `org_b` is Free/active.

25. **The headline.** A Free tenant holding a fully valid admin session token
    writes directly to `ai_conversations` / `ai_messages` and calls the match
    RPC — bypassing every route and every button. All refused at the database.
26. The inverse: Pro succeeds, so the gate is not simply denying everyone.
27. **Free is not read-only.** Full CRM writes still work on Free — writability
    keys off subscription *status*, never off plan. Conflating the two axes
    would silently turn Free into a read-only CRM.
28. `past_due` inside the grace window: writes work, AI does not.
29. `past_due` beyond grace: read-only, reads intact, and admins can still read
    `audit_logs` — the `has_role` vs `can_write` split.
30. Cancelled: all candidates still readable, every write refused.
31. Billing webhook dedupe and ordering; a replayed cancel does not downgrade.
32. Upgrade restores AI; `seats_used` counts active members only.
33. Catalog-driven: every `ai_*` / `*_embeddings` INSERT policy gates on
    `ai_enabled()`, so an AI table added later without one fails this suite.
34. Pro carries **no** seat cap: Clerk bills per seat and sends no quantity, so
    `NULL` must mean unlimited rather than inheriting the Free default of 2.
    Free with no quantity lands on 2; an explicit quantity always wins.
35. The real dashboard slugs — `pro` and **`free_org`** — map to the canonical
    plan, case and whitespace included, and an unrecognised slug degrades to
    free *with a warning* instead of wedging the webhook.
36. The `fea` claim (`ai_agent` on Pro, `2_seats` on Free) is never the gate:
    no policy reads it, and a session presenting `o:ai_agent` on a Free tenant
    still gets no AI. Attaching a feature to Free in the dashboard grants
    nothing.

## Known gaps

- **Test 12 does not yet prove scale behaviour.** Verified with `EXPLAIN ANALYZE`:
  at this row count the planner chooses a bitmap scan over the tenant index, not
  the HNSW index. The test therefore confirms correctness and completeness but
  does not exercise the post-filter shortfall that `hnsw.iterative_scan` exists to
  prevent. Re-run against production-scale data before relying on that setting.
- The suite runs as `authenticated` with a synthetic JWT. It does not test Clerk
  token issuance, the third-party auth handshake, or real webhook delivery —
  signature verification in particular is exercised only by `verifyWebhook` at
  runtime, not here.
- Test 20 proves the database closes on removal. It does not prove the *UI*
  reacts; that path runs through `lib/auth/tenant.ts` and needs a browser test.
- The billing tests drive `clerk_sync_subscription` directly. Clerk's real
  billing event names and payload shape are **not** verified here — subscribe in
  the dashboard and read the actual strings out of the handler's log line.
- Seat limits are only partly testable here: `app.seats_used()` counts active
  members, but pending Clerk invitations are added in
  `lib/billing/entitlements.ts` and need a Clerk fixture to cover.
- Supabase Realtime authorization is a separate surface and is not covered here.
