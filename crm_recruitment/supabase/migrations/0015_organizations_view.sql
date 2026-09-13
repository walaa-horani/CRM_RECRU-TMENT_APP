-- 0015_organizations_view.sql
-- Direct organizations view mirroring public.tenants for Supabase Table Editor.

create or replace view public.organizations as
select
  id,
  name,
  slug,
  plan,
  subscription_status,
  seats_purchased,
  grace_period_ends_at,
  created_at,
  updated_at
from public.tenants;

comment on view public.organizations is
  'Direct view of all organizations, their live plans, subscription statuses, and seat limits.';

grant select on public.organizations to authenticated, anon, service_role;
