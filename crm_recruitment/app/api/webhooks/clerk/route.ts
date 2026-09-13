import { clerkClient } from '@clerk/nextjs/server'
import { verifyWebhook } from '@clerk/nextjs/webhooks'
import type { NextRequest } from 'next/server'

import { createWebhookSupabaseClient } from '@/lib/supabase/admin'

/**
 * Clerk -> Supabase sync.
 *
 * This is the ONLY place `tenants` and `memberships` are written. Clerk is the
 * source of truth for identity; those two tables are a mirror, and every other
 * code path treats them as read-only (there is no write policy for
 * `authenticated` at all). Writing org or user state anywhere else causes drift.
 *
 * It is also the only sanctioned use of the service role key in the app: the
 * request carries no user session, so there is no JWT for RLS to work from.
 *
 * Three delivery properties drive the design, and all three are handled in SQL
 * rather than here (see 0011_clerk_sync.sql), because each needs a
 * check-then-write to be atomic:
 *
 *   1. Verification. An unverified body never reaches the database layer.
 *   2. At-least-once. Svix retries on any non-2xx and on timeouts, including
 *      after a success whose ack it never saw. `svix-id` is recorded and
 *      replays return 'duplicate'.
 *   3. Out-of-order. Retries interleave, so a stale update can land after a
 *      newer one. Every write is guarded on the Clerk object's updated_at and
 *      a late arrival returns 'stale'.
 *
 * Status codes are the retry protocol: 2xx stops redelivery, 4xx/5xx schedules
 * another attempt. So a bad signature is a permanent 400, while a transient
 * database failure is a 500 and will be retried.
 */
export async function POST(req: NextRequest) {
  let evt: Awaited<ReturnType<typeof verifyWebhook>>

  try {
    // Verifies the Svix signature against CLERK_WEBHOOK_SIGNING_SECRET.
    evt = await verifyWebhook(req)
  } catch (err) {
    console.error('[clerk-webhook] signature verification failed', err)
    // Deliberately 400, not 500: an unverifiable body will never become
    // verifiable, so retrying it is pointless.
    return new Response('Invalid signature', { status: 400 })
  }

  // The stable per-message id Svix reuses across retries. Without it there is no
  // way to tell a retry from a genuine second event.
  const svixId = req.headers.get('svix-id')
  if (!svixId) {
    console.error('[clerk-webhook] verified payload with no svix-id header')
    return new Response('Missing svix-id', { status: 400 })
  }

  const supabase = createWebhookSupabaseClient()

  // Widened to `string` deliberately. Clerk's SDK types spell membership events
  // 'organizationMembership.created', while its dashboard, logs and JSON
  // payloads use 'organization_membership.created' -- and verifyWebhook does
  // `type: payload.type`, passing the wire value through untouched. Switching on
  // the narrow union alone would drop the other spelling into `default` and sync
  // nothing, silently. Both spellings are handled below.
  //
  // The cost is losing TypeScript's narrowing of evt.data, so membership fields
  // are read through an explicit shape instead.
  const eventType: string = evt.type

  try {
    switch (eventType) {
      case 'organization.created':
      case 'organization.updated':
      case 'organization.deleted': {
        const { data, error } = await supabase.rpc('clerk_sync_organization', {
          p_svix_id: svixId,
          p_event_type: eventType,
          p_org_id: evt.data.id ?? null,
          p_name: 'name' in evt.data ? evt.data.name : null,
          p_slug: 'slug' in evt.data ? (evt.data.slug ?? null) : null,
          p_updated_at: clerkTimestamp(evt.data),
        })
        if (error) throw error
        logOutcome(eventType, svixId, data)
        break
      }

      case 'organizationMembership.created':
      case 'organizationMembership.updated':
      case 'organizationMembership.deleted':
      case 'organization_membership.created':
      case 'organization_membership.updated':
      case 'organization_membership.deleted': {
        const membership = evt.data as unknown as ClerkMembershipData
        const user = membership.public_user_data

        const { data, error } = await supabase.rpc('clerk_sync_membership', {
          p_svix_id: svixId,
          p_event_type: eventType,
          p_org_id: membership.organization.id,
          p_user_id: user.user_id,
          p_email: user.identifier ?? null,
          p_full_name:
            [user.first_name, user.last_name].filter(Boolean).join(' ') || null,
          // Raw Clerk role ('org:admin'). Normalisation lives in SQL next to the
          // CHECK constraint, so there is one definition of what a role is.
          p_role: membership.role,
          p_updated_at: clerkTimestamp(membership),
        })
        if (error) throw error
        logOutcome(eventType, svixId, data)

        if (eventType.endsWith('.deleted') && data === 'applied') {
          await maybeRevokeSessions(user.user_id)
        }
        break
      }

      default: {
        // Billing events. Matched by prefix rather than by an exact list
        // because Clerk's billing event names are not stable across its docs,
        // dashboard and SDK types -- and getting one wrong here means a
        // downgrade that never reaches the database. The payload shape varies
        // by event, so every field is read defensively.
        if (/^subscription/i.test(eventType)) {
          const sub = evt.data as unknown as ClerkSubscriptionData

          // Ignore single item termination events so an old ended item (e.g. Free tier ending on upgrade)
          // does not overwrite the newly activated Pro subscription.
          if (
            eventType.startsWith('subscriptionItem.') &&
            (eventType.endsWith('.ended') ||
              eventType.endsWith('.canceled') ||
              eventType.endsWith('.abandoned'))
          ) {
            console.info(
              `[clerk-webhook] acknowledged ${eventType} (${svixId}) without overwriting active plan`,
            )
            break
          }

          let { orgId, rawPlan, seats, status } = extractSubscriptionDetails(sub)

          if (!orgId) {
            console.warn(
              `[clerk-webhook] ${eventType} (${svixId}) received without an organization ID -- acknowledging without sync`,
            )
            break
          }

          // Fetch authoritative live subscription from Clerk if secret key is present
          const secretKey = process.env.CLERK_SECRET_KEY
          if (secretKey && orgId.startsWith('org_')) {
            try {
              const res = await fetch(
                `https://api.clerk.com/v1/organizations/${orgId}/billing/subscription`,
                { headers: { Authorization: `Bearer ${secretKey}` } },
              )
              if (res.ok) {
                const liveSub = await res.json()
                const liveItems = liveSub.subscription_items ?? []
                const activeItem =
                  liveItems.find((it: any) => it.status === 'active') ??
                  liveItems.find(
                    (it: any) => it.status !== 'ended' && it.status !== 'canceled',
                  )

                if (activeItem?.plan?.slug) {
                  rawPlan = activeItem.plan.slug
                  status = liveSub.status ?? status
                  seats = activeItem.seats?.quantity ?? activeItem.quantity ?? seats
                }
              }
            } catch (fetchErr) {
              console.warn('[clerk-webhook] live clerk subscription check fallback', fetchErr)
            }
          }

          // Normalize plan slug to match app.plan_slugs entries ('pro', 'free_org')
          let normalizedPlan = rawPlan
          if (rawPlan) {
            const lower = rawPlan.toLowerCase().trim()
            if (lower === 'free' || lower.includes('free')) {
              normalizedPlan = 'free_org'
            } else if (lower.includes('pro')) {
              normalizedPlan = 'pro'
            }
          }

          const { data, error } = await supabase.rpc('clerk_sync_subscription', {
            p_svix_id: svixId,
            p_event_type: eventType,
            p_org_id: orgId,
            p_plan: normalizedPlan,
            p_status: normalizeSubscriptionStatus(status),
            p_seats: seats,
            p_grace_until: gracePeriodEnd(status),
            p_updated_at: clerkTimestamp(sub),
          })
          if (error) throw error
          logOutcome(eventType, svixId, data)
          break
        }

        // Unsubscribed event types are acknowledged rather than retried. Warn
        // for anything org-shaped, since reaching here means a spelling this
        // handler does not know about and a sync that silently did nothing.
        if (/^organization/i.test(eventType)) {
          console.warn(
            `[clerk-webhook] unhandled organization event '${eventType}' (${svixId}) - not synced`,
          )
        }
        break
      }
    }
  } catch (err) {
    console.error(`[clerk-webhook] failed handling ${eventType} (${svixId})`, err)
    // 500 so Svix retries. Safe: the sync functions are idempotent, and the
    // dedupe row is written in the same transaction as the change, so a failed
    // attempt rolls both back and the retry is treated as a first delivery.
    return new Response('Handler error', { status: 500 })
  }

  return new Response('ok', { status: 200 })
}

/**
 * The membership payload fields this handler reads. Declared explicitly because
 * widening the switch to `string` gives up narrowing on evt.data.
 */
type ClerkMembershipData = {
  role: string
  updated_at?: number
  organization: { id: string }
  public_user_data: {
    user_id: string
    identifier?: string | null
    first_name?: string | null
    last_name?: string | null
  }
}

/**
 * The subscription and subscription item payload fields this handler reads.
 * Covers both Clerk camelCase and snake_case representations across
 * subscription.* and subscriptionItem.* webhook payloads.
 */
type ClerkSubscriptionData = {
  id?: string
  status?: string
  updated_at?: number
  quantity?: number
  organization_id?: string
  organizationId?: string
  payer_id?: string
  payerId?: string
  payer?: {
    organization_id?: string
    organizationId?: string
    id?: string
    type?: string
  }
  plan?: { slug?: string; key?: string }
  plan_slug?: string
  items?: Array<{ quantity?: number; plan?: { slug?: string; key?: string } }>
  subscription_items?: Array<{ quantity?: number; plan?: { slug?: string; key?: string } }>
  subscriptionItems?: Array<{ quantity?: number; plan?: { slug?: string; key?: string } }>
  subscription?: {
    status?: string
    payer_id?: string
    payerId?: string
    organization_id?: string
    organizationId?: string
    payer?: { organization_id?: string; organizationId?: string; id?: string }
    plan?: { slug?: string; key?: string }
    items?: Array<{ quantity?: number; plan?: { slug?: string } }>
  }
}

function extractSubscriptionDetails(data: ClerkSubscriptionData) {
  const orgId =
    data.payer?.organization_id ??
    data.payer?.organizationId ??
    data.organization_id ??
    data.organizationId ??
    (typeof data.payer_id === 'string' && data.payer_id.startsWith('org_') ? data.payer_id : null) ??
    (typeof data.payerId === 'string' && data.payerId.startsWith('org_') ? data.payerId : null) ??
    (data.payer?.id?.startsWith('org_') ? data.payer.id : null) ??
    data.subscription?.payer?.organization_id ??
    data.subscription?.payer?.organizationId ??
    data.subscription?.organization_id ??
    data.subscription?.organizationId ??
    (typeof data.subscription?.payer_id === 'string' && data.subscription?.payer_id.startsWith('org_')
      ? data.subscription.payer_id
      : null) ??
    (typeof data.subscription?.payerId === 'string' && data.subscription?.payerId.startsWith('org_')
      ? data.subscription.payerId
      : null) ??
    ''

  const rawPlan =
    data.plan?.slug ??
    data.plan?.key ??
    data.plan_slug ??
    data.items?.[0]?.plan?.slug ??
    data.items?.[0]?.plan?.key ??
    data.subscription_items?.[0]?.plan?.slug ??
    data.subscription_items?.[0]?.plan?.key ??
    data.subscriptionItems?.[0]?.plan?.slug ??
    data.subscription?.plan?.slug ??
    data.subscription?.items?.[0]?.plan?.slug ??
    null

  const seats =
    data.quantity ??
    data.items?.[0]?.quantity ??
    data.subscription_items?.[0]?.quantity ??
    data.subscriptionItems?.[0]?.quantity ??
    data.subscription?.items?.[0]?.quantity ??
    null

  const status = data.status ?? data.subscription?.status ?? 'active'

  return { orgId, rawPlan, seats, status }
}

/**
 * Maps Clerk's subscription status onto the four this schema models. Anything
 * unrecognised becomes 'active' rather than blocking the tenant: an unknown
 * status is our gap in knowledge, and locking a paying agency out of its own
 * pipeline over it would be the worse failure.
 *
 * AI entitlement is not at risk from this leniency -- that is gated on
 * plan = 'pro' as well, which comes from the plan slug, not from here.
 */
function normalizeSubscriptionStatus(status: string | undefined): string {
  switch (status) {
    case 'active':
    case 'trialing':
    case 'past_due':
    case 'canceled':
      return status
    case 'cancelled':
      return 'canceled'
    case 'incomplete_expired':
    case 'unpaid':
      return 'past_due'
    default:
      return 'active'
  }
}

/**
 * Writes are kept alive for a grace window after a payment failure. Cutting a
 * recruiting agency off mid-placement over an expired card loses the customer,
 * not just the payment. AI is revoked immediately regardless -- it is gated on
 * subscription_status directly, not on this window.
 */
function gracePeriodEnd(status: string | undefined): string | null {
  if (normalizeSubscriptionStatus(status) !== 'past_due') return null
  const days = Number(process.env.BILLING_GRACE_PERIOD_DAYS ?? 14)
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
}

/**
 * Clerk sends updated_at as epoch milliseconds. It is the ordering key for the
 * staleness guard, so a missing value must sort oldest rather than newest --
 * otherwise an event with no timestamp would win every comparison and clobber
 * good data.
 */
function clerkTimestamp(data: unknown): string {
  const updatedAt =
    typeof data === 'object' && data !== null && 'updated_at' in data
      ? (data as { updated_at?: unknown }).updated_at
      : undefined

  return typeof updatedAt === 'number'
    ? new Date(updatedAt).toISOString()
    : new Date(0).toISOString()
}

function logOutcome(eventType: string, svixId: string, outcome: unknown) {
  // 'duplicate' and 'stale' are normal and expected at low volume. A sustained
  // rate of either means retries are backing up or events are being replayed.
  console.info(`[clerk-webhook] ${eventType} ${svixId} -> ${String(outcome)}`)
}

/**
 * Optional immediate sign-out when someone is removed from an agency.
 *
 * Off by default, and the app is already safe without it: the moment this
 * webhook marks the mirror row 'removed', app.current_tenant_id() returns NULL
 * and the database is closed to that user (see 0011_clerk_sync.sql), and their
 * token drops the org claim within 60 seconds regardless.
 *
 * The reason it is not on by default is that revocation is per SESSION, not per
 * organization: a recruiter who works for two agencies and is removed from one
 * would be signed out of the other as well. Turn it on when that is the
 * behaviour you want -- for example when agencies share no staff, or when
 * policy demands an immediate hard sign-out on removal.
 *
 * Failures here are logged, never thrown: the mirror write has already
 * committed, and returning 500 would replay the whole event to undo nothing.
 */
async function maybeRevokeSessions(userId: string) {
  if (process.env.CLERK_REVOKE_SESSIONS_ON_REMOVAL !== 'true') return

  try {
    const client = await clerkClient()
    const { data: sessions } = await client.sessions.getSessionList({
      userId,
      status: 'active',
    })

    await Promise.all(
      sessions.map((session) =>
        client.sessions
          .revokeSession(session.id)
          .catch((err) =>
            console.error(`[clerk-webhook] revoke failed for ${session.id}`, err),
          ),
      ),
    )
    console.info(`[clerk-webhook] revoked ${sessions.length} session(s) for ${userId}`)
  } catch (err) {
    console.error(`[clerk-webhook] session revocation failed for ${userId}`, err)
  }
}
