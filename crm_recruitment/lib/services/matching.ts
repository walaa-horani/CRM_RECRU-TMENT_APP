import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { generateEmbedding } from '@/lib/embeddings'

export type TenantClient = SupabaseClient<Database>

export type MatchedCandidate = {
  candidateId: string
  similarity: number
  similarityPercentage: number
  candidate: {
    id: string
    fullName: string
    email: string | null
    headline: string | null
    currentTitle: string | null
    skills: string[]
    location: string | null
  }
}

export type MatchedJob = {
  jobId: string
  similarity: number
  similarityPercentage: number
  job: {
    id: string
    title: string
    clientName: string
    location: string | null
    salaryMin: number | null
    salaryMax: number | null
    status: string
  }
}

/**
 * Executes semantic matching between open job openings and candidates using pgvector.
 * Calls public.match_candidates_for_job RPC under the authenticated caller's RLS session.
 * Guarantees tenant pre-filtering before cosine similarity calculation.
 */
export async function matchCandidatesForJob(
  db: TenantClient,
  tenantId: string,
  jobId: string,
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<MatchedCandidate[]> {
  const { limit = 10, minSimilarity = 0.0 } = options

  // 1. Call RPC wrapper
  const { data: matches, error } = await db.rpc('match_candidates_for_job', {
    p_job_id: jobId,
    p_limit: limit,
    p_min_similarity: minSimilarity,
  })

  if (error) {
    console.error('Failed to match candidates for job:', error)
    throw error
  }

  if (!matches || matches.length === 0) {
    return []
  }

  const candidateIds = matches.map((m) => m.candidate_id)

  // 2. Fetch full candidate entity details under tenant RLS
  const { data: candidates, error: candError } = await db
    .from('candidates')
    .select('id, full_name, email, headline, current_title, skills, location')
    .eq('tenant_id', tenantId)
    .in('id', candidateIds)

  if (candError) throw candError

  const candMap = new Map((candidates ?? []).map((c) => [c.id, c]))

  return matches
    .map((m) => {
      const c = candMap.get(m.candidate_id)
      if (!c) return null
      return {
        candidateId: m.candidate_id,
        similarity: m.similarity,
        similarityPercentage: Math.max(0, Math.min(100, Math.round(m.similarity * 100))),
        candidate: {
          id: c.id,
          fullName: c.full_name,
          email: c.email,
          headline: c.headline,
          currentTitle: c.current_title,
          skills: c.skills ?? [],
          location: c.location,
        },
      }
    })
    .filter((item): item is MatchedCandidate => item !== null)
}

/**
 * Reverses matching: finds the best open jobs for a candidate profile.
 */
export async function matchJobsForCandidate(
  db: TenantClient,
  tenantId: string,
  candidateId: string,
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<MatchedJob[]> {
  const { limit = 10, minSimilarity = 0.0 } = options

  const { data: matches, error } = await db.rpc('match_jobs_for_candidate', {
    p_candidate_id: candidateId,
    p_limit: limit,
    p_min_similarity: minSimilarity,
  })

  if (error) {
    console.error('Failed to match jobs for candidate:', error)
    throw error
  }

  if (!matches || matches.length === 0) {
    return []
  }

  const jobIds = matches.map((m) => m.job_id)

  const { data: jobs, error: jobsError } = await db
    .from('jobs')
    .select('id, title, client_id, location, salary_min, salary_max, status')
    .eq('tenant_id', tenantId)
    .in('id', jobIds)

  if (jobsError) throw jobsError

  const clientIds = Array.from(new Set((jobs ?? []).map((j) => j.client_id)))
  let clientMap = new Map<string, string>()

  if (clientIds.length > 0) {
    const { data: clients } = await db
      .from('clients')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', clientIds)
    clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]))
  }

  const jobsMap = new Map((jobs ?? []).map((j) => [j.id, j]))

  return matches
    .map((m) => {
      const j = jobsMap.get(m.job_id)
      if (!j) return null
      return {
        jobId: m.job_id,
        similarity: m.similarity,
        similarityPercentage: Math.max(0, Math.min(100, Math.round(m.similarity * 100))),
        job: {
          id: j.id,
          title: j.title,
          clientName: clientMap.get(j.client_id) || 'Client',
          location: j.location,
          salaryMin: j.salary_min ? Number(j.salary_min) / 1000 : null,
          salaryMax: j.salary_max ? Number(j.salary_max) / 1000 : null,
          status: j.status,
        },
      }
    })
    .filter((item): item is MatchedJob => item !== null)
}

/**
 * Free-text semantic candidate search for Astra.
 * Generates an embedding for user query and executes search_candidates_by_embedding RPC.
 */
export async function searchCandidatesByText(
  db: TenantClient,
  tenantId: string,
  queryText: string,
  options: { limit?: number } = {},
): Promise<MatchedCandidate[]> {
  const { limit = 10 } = options

  // Generate 1536-dim vector via centralized embeddings service
  const vector = await generateEmbedding(queryText)
  const vectorStr = `[${vector.join(',')}]`

  const { data: matches, error } = await db.rpc('search_candidates_by_embedding', {
    p_embedding: vectorStr,
    p_limit: limit,
  })

  if (error) {
    console.error('Failed to search candidates by embedding:', error)
    throw error
  }

  if (!matches || matches.length === 0) {
    return []
  }

  const candidateIds = matches.map((m) => m.candidate_id)

  const { data: candidates, error: candError } = await db
    .from('candidates')
    .select('id, full_name, email, headline, current_title, skills, location')
    .eq('tenant_id', tenantId)
    .in('id', candidateIds)

  if (candError) throw candError

  const candMap = new Map((candidates ?? []).map((c) => [c.id, c]))

  return matches
    .map((m) => {
      const c = candMap.get(m.candidate_id)
      if (!c) return null
      return {
        candidateId: m.candidate_id,
        similarity: m.similarity,
        similarityPercentage: Math.max(0, Math.min(100, Math.round(m.similarity * 100))),
        candidate: {
          id: c.id,
          fullName: c.full_name,
          email: c.email,
          headline: c.headline,
          currentTitle: c.current_title,
          skills: c.skills ?? [],
          location: c.location,
        },
      }
    })
    .filter((item): item is MatchedCandidate => item !== null)
}
