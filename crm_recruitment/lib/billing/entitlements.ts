import 'server-only'

import { clerkClient } from '@clerk/nextjs/server'

import { requireTenant } from '@/lib/auth/tenant'
import { createServerSupabaseClient } from '@/lib/supabase/server'

export type Plan = 'free' | 'pro'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

export type Entitlements = {
  tenantId: string
  plan: Plan
  status: SubscriptionStatus
  /** Pro and paying. Revoked on past_due immediately, grace period or not. */
  aiEnabled: boolean
  /** False only for cancelled tenants, or past_due beyond the grace window. */
  writable: boolean
  seatsUsed: number
  /** NULL means unlimited (the Pro plan). Never treat it as zero. */
  seatsPurchased: number | null
  graceEndsAt: Date | null
}

/**
 * Thrown when an action is refused for billing reasons rather than permission
 * ones. Carries 402 so route handlers can return it directly and the client can
 * distinguish "you cannot" from "your plan cannot".
 */
export class BillingError extends Error {
  readonly status = 402
  constructor(
    readonly code:
      | 'ai_not_entitled'
      | 'tenant_read_only'
      | 'seat_limit_reached',
    message: string,
    readonly detail: Record<string, unknown> = {},
  ) {
    super(message)
    this.name = 'BillingError'
  }
}

/**
 * Resolves the caller's billing state.
 *
 * Reads the `tenants` mirror rather than the `pla` session-token claim. Clerk
 * refreshes tokens every 60 seconds, so the claim is up to a minute stale --
 * meaning a just-downgraded tenant still presents `pla: "o:pro"` for a minute.
 * The mirror is written by the billing webhook and is current within ~200ms.
 *
 * This is only ever the *reporting* layer. The enforcement lives in RLS
 * (0012_billing.sql), where `app.ai_enabled()` and `app.tenant_writable()` read
 * the same mirror. Everything below exists to produce a good error message, not
 * to be the control -- if it is bypassed the database still refuses.
 */
export async function getEntitlements(): Promise<Entitlements> {
  const { tenantId } = await requireTenant()
  const supabase = createServerSupabaseClient()

  const { data: tenant, error } = await supabase
    .from('tenants')
    .select('plan, subscription_status, seats_purchased, grace_period_ends_at')
    .eq('id', tenantId)
    .maybeSingle()

  if (error) throw error

  // No mirror row yet means the organization.created webhook has not landed.
  // Mirror the database's posture: writable, but not AI-entitled. Optimistic on
  // the cheap thing, closed on the expensive one.
  const plan = (tenant?.plan ?? 'free') as Plan
  const status = (tenant?.subscription_status ?? 'active') as SubscriptionStatus
  const graceEndsAt = tenant?.grace_period_ends_at
    ? new Date(tenant.grace_period_ends_at)
    : null

  return {
    tenantId,
    plan,
    status,
    aiEnabled: plan === 'pro' && (status === 'active' || status === 'trialing'),
    writable:
      status === 'active' ||
      status === 'trialing' ||
      (status === 'past_due' && graceEndsAt !== null && graceEndsAt > new Date()),
    seatsUsed: await countSeatsUsed(tenantId),
    // `?? 2` would be wrong here: null means unlimited, not "unknown, assume
    // the Free default". Pro carries no seat cap because Clerk bills per seat.
    seatsPurchased: tenant?.seats_purchased ?? null,
    graceEndsAt,
  }
}

/**
 * Seats in use: active members PLUS pending invitations.
 *
 * Counting only accepted members would let three admins send three invites
 * against one remaining seat and all succeed, since none of them has been
 * accepted yet at the moment of the check.
 */
async function countSeatsUsed(tenantId: string): Promise<number> {
  const supabase = createServerSupabaseClient()

  const { count: activeMembers } = await supabase
    .from('memberships')
    .select('clerk_user_id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'active')

  let pending = 0
  try {
    const client = await clerkClient()
    const invitations = await client.organizations.getOrganizationInvitationList({
      organizationId: tenantId,
      status: ['pending'],
    })
    pending = invitations.totalCount
  } catch (err) {
    // Clerk being unreachable must not silently under-count seats and let an
    // agency over-provision. Fail toward refusing the invite.
    console.error(`[billing] could not list pending invitations for ${tenantId}`, err)
    throw new BillingError(
      'seat_limit_reached',
      'Could not verify seat availability. Please try again.',
      { reason: 'invitation_lookup_failed' },
    )
  }

  return (activeMembers ?? 0) + pending
}

/** Call before any AI agent invocation. RLS enforces this too; this is the message. */
export async function assertAiEntitlement(): Promise<Entitlements> {
  const entitlements = await getEntitlements()
  if (!entitlements.aiEnabled) {
    throw new BillingError(
      'ai_not_entitled',
      entitlements.plan === 'pro'
        ? 'The AI agent is unavailable while your subscription payment is outstanding.'
        : 'The AI agent is available on the Pro plan.',
      { plan: entitlements.plan, status: entitlements.status },
    )
  }
  return entitlements
}

/** Call before mutations in Server Actions, for a clear error instead of an RLS denial. */
export async function assertWritable(): Promise<Entitlements> {
  const entitlements = await getEntitlements()
  if (!entitlements.writable) {
    throw new BillingError(
      'tenant_read_only',
      entitlements.status === 'canceled'
        ? 'Your subscription has ended. Your data is intact and can still be read and exported.'
        : 'Your account is read-only until the outstanding payment is settled.',
      { status: entitlements.status, graceEndsAt: entitlements.graceEndsAt },
    )
  }
  return entitlements
}

/** Call before inviting a member. Unlike the others, RLS cannot enforce this. */
export async function assertSeatAvailable(): Promise<Entitlements> {
  const entitlements = await getEntitlements()

  // Unlimited. Clerk still bills per seat, so adding a member costs money --
  // but it is never refused.
  if (entitlements.seatsPurchased === null) return entitlements

  if (entitlements.seatsUsed >= entitlements.seatsPurchased) {
    throw new BillingError(
      'seat_limit_reached',
      `All ${entitlements.seatsPurchased} seats are in use. Add seats to invite another recruiter.`,
      {
        seatsUsed: entitlements.seatsUsed,
        seatsPurchased: entitlements.seatsPurchased,
        upgradeUrl: '/settings/billing',
      },
    )
  }
  return entitlements
}
