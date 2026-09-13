-- 0013_seat_limits.sql
-- NULL seats_purchased means UNLIMITED.
--
-- The Pro plan is configured in Clerk with per-seat billing and no member cap,
-- so a subscription event for Pro carries no seat quantity. 0012 handled that
-- with `coalesce(p_seats, seats_purchased)`, which keeps whatever was there
-- before -- and for a tenant created by the organization webhook that is the
-- column default of 2. The result: a Pro agency paying for unlimited seats gets
-- refused at its third recruiter.
--
-- Seat policy is a product decision, not something to infer from the shape of a
-- webhook payload, so it is derived from the plan explicitly:
--
--   free -> 2 seats     (matches the Custom limit set on the Free plan in Clerk)
--   pro  -> unlimited   (NULL; Clerk bills per seat and caps nothing)
--
-- An explicit quantity from Clerk always wins, so introducing a seat-capped
-- tier later needs no change here.

comment on column public.tenants.seats_purchased is
  'Seat entitlement. NULL means unlimited -- do not treat it as zero or as unknown.';

-- Existing Pro tenants were given the default of 2 by 0012. Correct them.
update public.tenants
   set seats_purchased = null
 where plan = 'pro' and seats_purchased = 2;

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
  v_plan   text;
  v_status text;
  v_seats  integer;
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

  -- Unknown plan slugs fall back to 'free' rather than failing the constraint:
  -- a plan renamed in the Clerk dashboard should downgrade access, not wedge
  -- the webhook into a permanent retry loop.
  v_plan := case when p_plan = 'pro' then 'pro' else 'free' end;
  v_status := case
    when p_status in ('active', 'trialing', 'past_due', 'canceled') then p_status
    else 'active'
  end;

  -- An explicit quantity wins. Otherwise the plan decides, and Pro means
  -- unlimited rather than "keep whatever was there".
  v_seats := case
    when p_seats is not null then p_seats
    when v_plan = 'pro'      then null
    else 2
  end;

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
