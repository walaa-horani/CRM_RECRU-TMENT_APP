'use server'

import { z } from 'zod'
import { requireTenant } from '@/lib/auth/tenant'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  matchCandidatesForJob,
  matchJobsForCandidate,
  type MatchedCandidate,
  type MatchedJob,
} from '@/lib/services/matching'
import {
  candidateToEmbeddingText,
  jobToEmbeddingText,
  syncCandidateEmbedding,
  syncJobEmbedding,
} from '@/lib/embeddings'

const matchQuerySchema = z.object({
  id: z.string().uuid(),
  limit: z.number().min(1).max(30).optional(),
  minSimilarity: z.number().min(0).max(1).optional(),
})

export type MatchCandidateResult =
  | { status: 'success'; matches: MatchedCandidate[] }
  | { status: 'error'; message: string }

export type MatchJobResult =
  | { status: 'success'; matches: MatchedJob[] }
  | { status: 'error'; message: string }

/**
 * Server action to match candidates for a specific job opening.
 * Enforces tenant boundary from the Clerk session.
 */
export async function matchCandidatesForJobAction(
  jobId: string,
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<MatchCandidateResult> {
  const { tenantId } = await requireTenant()

  const parsed = matchQuerySchema.safeParse({ id: jobId, ...options })
  if (!parsed.success) {
    return { status: 'error', message: 'Invalid job identifier.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const matches = await matchCandidatesForJob(supabase, tenantId, parsed.data.id, {
      limit: parsed.data.limit,
      minSimilarity: parsed.data.minSimilarity,
    })

    return { status: 'success', matches }
  } catch (error) {
    console.error('matchCandidatesForJobAction error:', error)
    return { status: 'error', message: 'Failed to retrieve semantic matches.' }
  }
}

/**
 * Server action to match jobs for a specific candidate.
 */
export async function matchJobsForCandidateAction(
  candidateId: string,
  options: { limit?: number; minSimilarity?: number } = {},
): Promise<MatchJobResult> {
  const { tenantId } = await requireTenant()

  const parsed = matchQuerySchema.safeParse({ id: candidateId, ...options })
  if (!parsed.success) {
    return { status: 'error', message: 'Invalid candidate identifier.' }
  }

  try {
    const supabase = createServerSupabaseClient()
    const matches = await matchJobsForCandidate(supabase, tenantId, parsed.data.id, {
      limit: parsed.data.limit,
      minSimilarity: parsed.data.minSimilarity,
    })

    return { status: 'success', matches }
  } catch (error) {
    console.error('matchJobsForCandidateAction error:', error)
    return { status: 'error', message: 'Failed to retrieve job matches.' }
  }
}

/**
 * Server action to ensure embeddings are generated/synced for a candidate.
 */
export async function syncCandidateVectorAction(candidateId: string): Promise<{ ok: boolean; message?: string }> {
  const { tenantId } = await requireTenant()

  try {
    const supabase = createServerSupabaseClient()
    const { data: candidate, error } = await supabase
      .from('candidates')
      .select('id, full_name, headline, current_title, skills, location')
      .eq('tenant_id', tenantId)
      .eq('id', candidateId)
      .single()

    if (error || !candidate) {
      return { ok: false, message: 'Candidate not found.' }
    }

    const text = candidateToEmbeddingText({
      fullName: candidate.full_name,
      headline: candidate.headline,
      currentTitle: candidate.current_title,
      skills: candidate.skills,
      location: candidate.location,
    })

    await syncCandidateEmbedding(supabase, candidate.id, tenantId, text)
    return { ok: true }
  } catch (err) {
    console.error('syncCandidateVectorAction error:', err)
    return { ok: false, message: 'Failed to sync vector.' }
  }
}

/**
 * Server action to ensure embeddings are generated/synced for a job opening.
 */
export async function syncJobVectorAction(jobId: string): Promise<{ ok: boolean; message?: string }> {
  const { tenantId } = await requireTenant()

  try {
    const supabase = createServerSupabaseClient()
    const { data: job, error } = await supabase
      .from('jobs')
      .select('id, title, location, salary_min, salary_max, description')
      .eq('tenant_id', tenantId)
      .eq('id', jobId)
      .single()

    if (error || !job) {
      return { ok: false, message: 'Job not found.' }
    }

    const text = jobToEmbeddingText({
      title: job.title,
      location: job.location,
      salaryMin: job.salary_min ? Number(job.salary_min) / 1000 : null,
      salaryMax: job.salary_max ? Number(job.salary_max) / 1000 : null,
      description: job.description,
    })

    await syncJobEmbedding(supabase, job.id, tenantId, text)
    return { ok: true }
  } catch (err) {
    console.error('syncJobVectorAction error:', err)
    return { ok: false, message: 'Failed to sync vector.' }
  }
}
