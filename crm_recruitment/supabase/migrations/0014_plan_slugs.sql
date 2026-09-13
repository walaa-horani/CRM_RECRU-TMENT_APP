-- 0014_plan_slugs.sql
-- The Clerk plan slugs, made explicit.
--
-- The slugs configured in the Clerk dashboard are:
--
--   pro       -> the paid plan. Feature key `ai_agent`. Per-seat billing, no
--                member limit, so subscription events carry no seat quantity.
--   free_org  -> the free plan. Feature key `2_seats`. Clerk enforces a member
--                limit of 2 (its dashboard refuses a limit of 0, so "no free
--                tier members" is not expressible there and is not the design).
--
-- Note that the free slug is `free_org`, NOT `free`. 0012 mapped slugs with
-- `case when p_plan = 'pro' then 'pro' else 'free' end`, which happens to give
-- the right answer for both -- but only because everything unrecognised falls
-- to free. That is a silent downgrade waiting to happen: add `pro_annual` in
-- the dashboard, or rename `pro`, and every paying agency loses AI at the next
-- billing event with nothing in the logs to say why.
--
-- So the mapping becomes data. Adding a plan is an insert here, not a change to
-- a CASE buried in a webhook handler, and an unrecognised slug still degrades
-- to free -- but says so.
--
-- `tenants.plan` stays the canonical two-value vocabulary ('free' | 'pro'); the
-- vendor's slug never leaks into the entitlement functions.

create table if not exists app.plan_slugs (
  slug            text primary key,
  plan            text not null check (plan in ('free', 'pro')),
  -- NULL means unlimited. See 0013.
  default_seats   integer,
  created_at      timestamptz not null default now()
);

comment on table app.plan_slugs is
  'Clerk plan slug -> canonical plan + seat policy. Edit here when a plan is added or renamed in the Clerk dashboard.';

insert into app.plan_slugs (slug, plan, default_seats) values
  ('pro',      'pro',  null),
  ('free_org', 'free', 2)
on conflict (slug) do update
  set plan          = excluded.plan,
      default_seats = excluded.default_seats;

-- Nothing user-facing reads this; it exists for the service-role webhook path.
revoke all on app.plan_slugs from public, anon, authenticated;

comment on column public.tenants.plan is
  'Canonical plan: free | pro. NOT the raw Clerk slug -- see app.plan_slugs for the mapping (the free slug is `free_org`).';

-- app.current_plan() returns the RAW slug from the `pla` claim, so it yields
-- 'free_org', not 'free'. It is a diagnostic only; never compare it to
-- tenants.plan without mapping it first.
comment on function app.current_plan() is
  'Raw Clerk plan slug from the `pla` claim (e.g. free_org). Diagnostic only -- entitlements read the tenants mirror.';

-- The `fea` claim carries `o:ai_agent` on Pro and `o:2_seats` on Free.
-- app.has_feature() can read them, but no policy does, deliberately: a feature
-- added to the Free plan in the dashboard would otherwise silently open the AI
-- gate. Entitlement is the mirror, gated on plan.

create or replace function public.clerk_sync_subscription(
  p_svix_id      text,
  p_event_type   text,
  p_org_id       text,
  p_plan         text,
  p_status       text,
  p_seats        integer,
  p_grace_until  timestamptz,
  p_updated_at   timestamptz
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_slug   text := lower(btrim(coalesce(p_plan, '')));
  v_plan   text;
  v_seats  integer;
  v_known  boolean;
  v_status text;
begin
  insert into public.webhook_events (svix_id, event_type)
  values (p_svix_id, p_event_type)
  on conflict (svix_id) do nothing;

  if not found then
    return 'duplicate';
  end if;

  if exists (select 1 from public.tenant_tombstones t where t.tenant_id = p_org_id) then
    return 'tombstoned';
  end if;

  select s.plan, s.default_seats, true
    into v_plan, v_seats, v_known
    from app.plan_slugs s
   where s.slug = v_slug;

  if not coalesce(v_known, false) then
    -- Degrade rather than fail: a 500 here would put Svix into a permanent
    -- retry loop over a dashboard rename. But make it loud -- this is the path
    -- that quietly takes AI away from a paying agency.
    raise warning 'clerk_sync_subscription: unknown plan slug % (org %), treating as free', v_slug, p_org_id;
    v_plan  := 'free';
    v_seats := 2;
  end if;

  v_status := case
    when p_status in ('active', 'trialing', 'past_due', 'canceled') then p_status
    else 'active'
  end;

  -- An explicit quantity from Clerk always wins; otherwise the plan's seat
  -- policy applies. Pro is unlimited (NULL) because Clerk bills per seat and
  -- caps nothing, so its events carry no quantity at all.
  if p_seats is not null then
    v_seats := p_seats;
  end if;

  update public.tenants
     set plan                   = v_plan,
         subscription_status    = v_status,
         seats_purchased        = v_seats,
         grace_period_ends_at   = p_grace_until,
         plan_source_updated_at = p_updated_at,
         updated_at             = now()
   where id = p_org_id
     and plan_source_updated_at < p_updated_at;

  if not found then
    return 'stale';
  end if;

  return 'applied';
end
$$;

revoke all on function
  public.clerk_sync_subscription(text, text, text, text, text, integer, timestamptz, timestamptz)
from public, anon, authenticated;

grant execute on function
  public.clerk_sync_subscription(text, text, text, text, text, integer, timestamptz, timestamptz)
to service_role;
