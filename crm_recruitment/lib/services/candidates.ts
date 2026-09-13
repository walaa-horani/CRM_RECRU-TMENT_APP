import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'

import type { Database } from '@/lib/supabase/types'
import type {
  CreateCandidateValues,
  ListCandidatesParams,
  StageKind,
} from '@/lib/validation/candidates'

/**
 * Candidate reads and writes.
 *
 * Per AGENTS.md this layer has no HTTP awareness: no NextRequest, no cookies,
 * no redirects. It takes an already-authenticated client and an already-
 * resolved tenant id, which also makes it directly callable from an Astra tool
 * later -- where the tenant id is a fixed server value the model never chooses.
 *
 * Every query is written as if RLS did not exist AND as if it did. The explicit
 * `.eq('tenant_id', tenantId)` is not the security boundary -- the policies are
 * -- but it keeps the tenant index in play and makes the intent readable at the
 * call site. If the two ever disagree, RLS wins and the result is empty rather
 * than wrong.
 */

export type TenantClient = SupabaseClient<Database>

export type CandidateListItem = {
  id: string
  fullName: string
  initials: string
  email: string | null
  headline: string | null
  currentTitle: string | null
  skills: string[]
  resumePath: string | null
  createdAt: string
  /** From the candidate's most recent application, if any. */
  stage: StageKind | null
  jobTitle: string | null
  clientName: string | null
}

export type CandidateList = {
  items: CandidateListItem[]
  /** Total matching candidates, ignoring limit/offset. Drives pagination. */
  total: number
}

export async function listCandidates(
  db: TenantClient,
  tenantId: string,
  params: ListCandidatesParams,
): Promise<CandidateList> {
  let query = db
    .from('candidates')
    .select(
      'id, full_name, email, headline, current_title, skills, resume_path, created_at',
      { count: 'exact' },
    )
    .eq('tenant_id', tenantId)

  if (params.q) {
    // The term has already been stripped of PostgREST filter syntax by the Zod
    // schema; see the note there. Anything reaching this line is inert.
    query = query.or(`full_name.ilike.%${params.q}%,email.ilike.%${params.q}%`)
  }

  const {
    data: candidates,
    count,
    error,
  } = await query
    .order('created_at', { ascending: false })
    .range(params.offset, params.offset + params.limit - 1)

  if (error) throw error
  if (!candidates || candidates.length === 0) return { items: [], total: count ?? 0 }

  const pipeline = await latestApplications(
    db,
    tenantId,
    candidates.map((c) => c.id),
  )

  const items: CandidateListItem[] = candidates.map((c) => {
    const application = pipeline.get(c.id)
    return {
      id: c.id,
      fullName: c.full_name,
      initials: initialsOf(c.full_name),
      email: c.email,
      headline: c.headline,
      currentTitle: c.current_title,
      skills: c.skills ?? [],
      resumePath: c.resume_path,
      createdAt: c.created_at,
      stage: application?.stage ?? null,
      jobTitle: application?.jobTitle ?? null,
      clientName: application?.clientName ?? null,
    }
  })

  // Stage belongs to the APPLICATION, not to the candidate -- one person can be
  // at 'offer' with one client and 'screening' with another. So a stage filter
  // is applied to the page here rather than to the query, and `total` stays the
  // candidate count. Push it into SQL when the pipeline board needs it; this
  // list does not.
  const filtered = params.stage
    ? items.filter((item) => item.stage === params.stage)
    : items

  return { items: filtered, total: count ?? filtered.length }
}

type PipelinePosition = {
  stage: StageKind
  jobTitle: string | null
  clientName: string | null
}

/**
 * The most recent application per candidate, with its job and client.
 *
 * Three round trips instead of one nested PostgREST select, on purpose:
 * applications reach candidates through a COMPOSITE foreign key
 * (candidate_id, tenant_id), which PostgREST's relationship detection does not
 * embed reliably -- and a silently unresolved embed renders as blank stages
 * rather than as an error. Each query here is tenant-filtered and index-covered.
 */
async function latestApplications(
  db: TenantClient,
  tenantId: string,
  candidateIds: string[],
): Promise<Map<string, PipelinePosition>> {
  const result = new Map<string, PipelinePosition>()

  const { data: applications, error } = await db
    .from('applications')
    .select('candidate_id, job_id, stage_kind, applied_at')
    .eq('tenant_id', tenantId)
    .in('candidate_id', candidateIds)
    .order('applied_at', { ascending: false })

  if (error) throw error
  if (!applications || applications.length === 0) return result

  // Newest first, so the first row per candidate wins.
  const newest = new Map<string, (typeof applications)[number]>()
  for (const application of applications) {
    if (!newest.has(application.candidate_id)) {
      newest.set(application.candidate_id, application)
    }
  }

  const jobIds = Array.from(new Set(Array.from(newest.values()).map((a) => a.job_id)))
  const { data: jobs, error: jobsError } = await db
    .from('jobs')
    .select('id, title, client_id')
    .eq('tenant_id', tenantId)
    .in('id', jobIds)

  if (jobsError) throw jobsError

  const clientIds = Array.from(new Set((jobs ?? []).map((j) => j.client_id)))
  let clientNames = new Map<string, string>()

  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await db
      .from('clients')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', clientIds)

    if (clientsError) throw clientsError
    clientNames = new Map((clients ?? []).map((c) => [c.id, c.name]))
  }

  const jobsById = new Map((jobs ?? []).map((j) => [j.id, j]))

  for (const [candidateId, application] of newest) {
    const job = jobsById.get(application.job_id)
    result.set(candidateId, {
      stage: application.stage_kind,
      jobTitle: job?.title ?? null,
      clientName: job ? (clientNames.get(job.client_id) ?? null) : null,
    })
  }

  return result
}

export type CreateCandidateResult =
  | { ok: true; id: string }
  | { ok: false; code: 'duplicate_email' | 'forbidden'; message: string }

export async function createCandidate(
  db: TenantClient,
  tenantId: string,
  userId: string,
  values: CreateCandidateValues,
): Promise<CreateCandidateResult> {
  const { data, error } = await db
    .from('candidates')
    .insert({
      // Not taken from `values`. The schema has no field for it -- see the note
      // in lib/validation/candidates.ts.
      tenant_id: tenantId,
      full_name: values.fullName,
      email: values.email,
      phone: values.phone,
      headline: values.headline,
      location: values.location,
      current_title: values.currentTitle,
      current_company: values.currentCompany,
      source: values.source,
      skills: values.skills,
      salary_expectation: values.salaryExpectation,
      currency: values.currency,
      owner_user_id: userId,
      created_by: userId,
    })
    .select('id')
    .single()

  if (error) {
    // 23505 is the partial unique index on (tenant_id, email). It is scoped per
    // tenant, so this means a duplicate inside THIS agency -- two agencies
    // holding the same person is normal and has to stay possible.
    if (error.code === '23505') {
      return {
        ok: false,
        code: 'duplicate_email',
        message: 'A candidate with that email already exists in your agency.',
      }
    }
    // 42501 is an RLS refusal: wrong role, or the tenant is read-only for
    // billing reasons. Both are policy decisions, not bugs -- so they become a
    // message rather than a stack trace.
    if (error.code === '42501') {
      return {
        ok: false,
        code: 'forbidden',
        message: 'You do not have permission to add candidates.',
      }
    }
    throw error
  }

  return { ok: true, id: data.id }
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return parts
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
