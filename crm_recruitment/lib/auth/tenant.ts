import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { redirect } from 'next/navigation'

import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { OrgRole } from '@/lib/supabase/types'

export type TenantContext = {
  tenantId: string
  userId: string
  /** The role RLS will actually enforce for this request. See below. */
  role: OrgRole
}

export type TenantResolution =
  | { status: 'ok'; context: TenantContext }
  | { status: 'signed-out' }
  | { status: 'no-active-org' }
  | { status: 'revoked'; tenantId: string }

/**
 * Resolves the caller's agency, or explains why they do not have one.
 *
 * The problem this exists to solve: Clerk session tokens are short-lived and
 * refresh every 60 seconds, so an org claim can be up to a minute stale. For
 * that minute a user who has just been removed from an agency still presents a
 * token that names it.
 *
 * The database already handles this -- app.current_tenant_id() consults the
 * membership mirror and starts returning NULL as soon as the webhook lands, so
 * queries return nothing and writes are refused. But "every query silently
 * returns zero rows" renders as an empty dashboard, which looks like data loss
 * rather than a permissions change. This turns that into an explicit state the
 * UI can speak to.
 *
 * The mirror is used here strictly to DENY. It can revoke access the token
 * would have allowed; it can never grant access the token does not. That
 * direction matters: it keeps Clerk authoritative for authorization, and it
 * means a webhook that has not arrived yet cannot let anyone in.
 */
export async function resolveTenant(): Promise<TenantResolution> {
  const { userId, orgId, orgRole } = await auth()

  if (!userId) return { status: 'signed-out' }
  if (!orgId) return { status: 'no-active-org' }

  const supabase = createServerSupabaseClient()

  const { data: membership } = await supabase
    .from('memberships')
    .select('role, status')
    .eq('tenant_id', orgId)
    .eq('clerk_user_id', userId)
    .maybeSingle()

  // Known-revoked. Note this is also reachable when the row is absent *and* the
  // read itself returned nothing because RLS has already closed the tenant --
  // both mean the same thing to the caller.
  if (membership && membership.status !== 'active') {
    return { status: 'revoked', tenantId: orgId }
  }

  return {
    status: 'ok',
    context: {
      tenantId: orgId,
      userId,
      // Take the LOWER of the token's role and the mirror's. A demotion that
      // has not reached the token yet should not keep rendering admin controls.
      //
      // Worth being precise about the limit: this narrows the UI only. RLS
      // policies still read the role from the token, so for up to 60 seconds
      // after a demotion the database would accept a write this UI has already
      // stopped offering. Closing that fully means having the write policies
      // consult the mirror too -- a deliberate trade, since it adds an index
      // probe per statement.
      // The mirror's role is a CHECK constraint, not an enum, so it arrives
      // as plain `string`. Narrow it through the same funnel as the token's --
      // an unrecognised value degrades to coordinator rather than widening.
      role: leastPrivileged(
        normalizeRole(orgRole),
        membership ? normalizeRole(membership.role) : null,
      ),
    },
  }
}

/**
 * Same as `resolveTenant`, but for pages and Server Actions that cannot proceed
 * without an agency. Redirects instead of returning a failure state.
 */
export async function requireTenant(): Promise<TenantContext> {
  const resolution = await resolveTenant()

  switch (resolution.status) {
    case 'ok':
      return resolution.context
    case 'signed-out':
      redirect('/sign-in')
    case 'no-active-org':
      redirect('/select-organization')
    case 'revoked':
      redirect('/access-revoked')
  }
}

const ROLE_RANK: Record<OrgRole, number> = {
  coordinator: 0,
  recruiter: 1,
  admin: 2,
}

function normalizeRole(clerkRole: string | null | undefined): OrgRole {
  const role = (clerkRole ?? '').replace(/^org:/, '')
  return role === 'admin' || role === 'recruiter' || role === 'coordinator'
    ? role
    : 'coordinator'
}

function leastPrivileged(a: OrgRole, b: OrgRole | null | undefined): OrgRole {
  if (!b) return a
  return ROLE_RANK[b] < ROLE_RANK[a] ? b : a
}
