/**
 * The application's view of the database schema.
 *
 * `database.types.ts` is GENERATED -- `pnpm db:types` overwrites it from the
 * linked Supabase project, so nothing hand-written may live there. This file is
 * the hand-written half: it re-exports the generated schema under the names the
 * app uses, and is the only place to add types the generator cannot know about.
 *
 * The row aliases below exist so call sites read as domain nouns (`Candidate`)
 * rather than as lookups (`Tables<'candidates'>`), and so a column renamed in a
 * migration surfaces as a type error here first.
 */

import type { Database as GeneratedDatabase, Tables } from './database.types'

/**
 * Postgres does not record whether a function parameter accepts NULL, so the
 * generator types every RPC argument as non-nullable. Ours genuinely take NULL
 * -- Clerk omits `slug` on some organization events, and a Pro subscription
 * carries no seat quantity at all -- and the SQL coalesces or branches on it.
 *
 * So the three sync functions get their argument types widened back to the
 * truth. Widening only these three keeps the strictness everywhere else: a
 * `null` passed to any other RPC is still a type error.
 */
type NullableArgs<F extends { Args: Record<string, unknown> }> = Omit<F, 'Args'> & {
  Args: { [K in keyof F['Args']]: F['Args'][K] | null }
}

type PublicSchema = GeneratedDatabase['public']
type GeneratedFunctions = PublicSchema['Functions']

export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<PublicSchema, 'Functions'> & {
    Functions: Omit<
      GeneratedFunctions,
      'clerk_sync_organization' | 'clerk_sync_membership' | 'clerk_sync_subscription'
    > & {
      clerk_sync_organization: NullableArgs<GeneratedFunctions['clerk_sync_organization']>
      clerk_sync_membership: NullableArgs<GeneratedFunctions['clerk_sync_membership']>
      clerk_sync_subscription: NullableArgs<GeneratedFunctions['clerk_sync_subscription']>
    }
  }
}

export type Tenant = Tables<'tenants'>
export type Membership = Tables<'memberships'>
export type Client = Tables<'clients'>
export type ClientContact = Tables<'client_contacts'>
export type Job = Tables<'jobs'>
export type Candidate = Tables<'candidates'>
export type PipelineStage = Tables<'pipeline_stages'>
export type Application = Tables<'applications'>
export type ApplicationStageEvent = Tables<'application_stage_events'>
export type Interview = Tables<'interviews'>
export type InterviewParticipant = Tables<'interview_participants'>
export type Offer = Tables<'offers'>
export type AuditLog = Tables<'audit_logs'>
export type CandidateEmbedding = Tables<'candidate_embeddings'>
export type JobEmbedding = Tables<'job_embeddings'>
export type AiConversation = Tables<'ai_conversations'>
export type AiMessage = Tables<'ai_messages'>
export type WebhookEvent = Tables<'webhook_events'>
export type TenantTombstone = Tables<'tenant_tombstones'>

/** The pipeline's canonical stages. A real Postgres enum, so the generator has it. */
export type StageKind = Database['public']['Enums']['stage_kind']

/**
 * Agency roles. A CHECK constraint rather than an enum, so the generator types
 * the column as plain `string` and this narrowing has to be written by hand.
 * It must stay in step with `memberships_role_ck` in 0002.
 */
export type OrgRole = 'admin' | 'recruiter' | 'coordinator'

/** Plan and billing state. Also CHECK constraints -- see 0012 and 0014. */
export type Plan = 'free' | 'pro'
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'canceled'

/**
 * What the three clerk_sync_* RPCs return. The functions return `text`, so the
 * generator cannot narrow it; these four strings are the whole vocabulary, and
 * the webhook route branches on them.
 */
export type ClerkSyncOutcome = 'applied' | 'duplicate' | 'stale' | 'tombstoned'
