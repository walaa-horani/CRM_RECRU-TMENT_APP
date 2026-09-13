import 'server-only'

import { tool } from 'ai'
import { z } from 'zod'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import {
  matchCandidatesForJob,
  searchCandidatesByText,
} from '@/lib/services/matching'

export type TenantClient = SupabaseClient<Database>

/**
 * Creates tools for Astra (Vercel AI SDK streamText).
 *
 * CRITICAL RULE (SKILLS.md Rule 4):
 * Any tool the AI agent (Astra) calls MUST receive tenant_id as a fixed value from
 * the server session. The LLM itself NEVER chooses, supplies, or sees tenant_id.
 */
export function createAstraTools(db: TenantClient, tenantId: string) {
  return {
    listOpenJobs: tool({
      description: 'Lists all open job requisitions currently active in the agency with their titles and IDs.',
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const { data: jobs, error } = await db
            .from('jobs')
            .select('id, title, location, salary_min, salary_max, status')
            .eq('tenant_id', tenantId)
            .eq('status', 'open')

          if (error) throw error

          return {
            count: jobs?.length ?? 0,
            jobs: (jobs ?? []).map((j) => ({
              id: j.id,
              title: j.title,
              location: j.location,
              salaryRange: `$${j.salary_min ? Number(j.salary_min) / 1000 : 0}k - $${j.salary_max ? Number(j.salary_max) / 1000 : 0}k`,
            })),
          }
        } catch (err) {
          console.error('Tool listOpenJobs error:', err)
          return { error: 'Failed to retrieve open jobs.' }
        }
      },
    }),

    suggestMatchedCandidates: tool({
      description:
        'Suggests top matching candidates for an open job opening using semantic vector matching.',
      inputSchema: z.object({
        jobId: z.string().uuid().optional().describe('The UUID of the job opening to match candidates against. If omitted, matches against the first active open job.'),
        minSimilarity: z.number().min(0).max(1).default(0.4).describe('Minimum cosine similarity threshold (0.0 to 1.0)'),
        limit: z.number().int().min(1).max(15).default(5).describe('Maximum number of candidates to return'),
      }),
      execute: async ({ jobId, minSimilarity, limit }) => {
        try {
          let targetJobId = jobId
          let targetJobTitle = ''

          if (!targetJobId) {
            const { data: openJobs } = await db
              .from('jobs')
              .select('id, title')
              .eq('tenant_id', tenantId)
              .eq('status', 'open')
              .limit(1)

            if (!openJobs || openJobs.length === 0) {
              return {
                count: 0,
                message: 'No open jobs found in your agency to match candidates for.',
                matches: [],
              }
            }
            targetJobId = openJobs[0].id
            targetJobTitle = openJobs[0].title
          }

          const matches = await matchCandidatesForJob(db, tenantId, targetJobId, {
            limit,
            minSimilarity,
          })

          if (matches.length === 0) {
            return {
              count: 0,
              jobTitle: targetJobTitle,
              message: 'No candidates in your agency match this job opening with the specified similarity threshold.',
              matches: [],
            }
          }

          return {
            count: matches.length,
            jobTitle: targetJobTitle,
            message: `Found ${matches.length} matching candidate(s) for this position.`,
            matches: matches.map((m) => ({
              id: m.candidate.id,
              name: m.candidate.fullName,
              title: m.candidate.currentTitle,
              headline: m.candidate.headline,
              skills: m.candidate.skills,
              similarityScore: `${m.similarityPercentage}%`,
            })),
          }
        } catch (err) {
          console.error('Tool suggestMatchedCandidates error:', err)
          return { error: 'Failed to retrieve candidate matches.' }
        }
      },
    }),

    searchCandidates: tool({
      description:
        'Searches agency candidates using free-text semantic query (skills, tech stack, experience, etc).',
      inputSchema: z.object({
        query: z.string().min(2).describe('Semantic search query, e.g. "Senior React and TypeScript developer with GraphQL experience"'),
        limit: z.number().int().min(1).max(15).default(5).describe('Maximum candidates to return'),
      }),
      execute: async ({ query, limit }) => {
        try {
          const matches = await searchCandidatesByText(db, tenantId, query, { limit })

          if (matches.length === 0) {
            return {
              count: 0,
              message: `No candidates found matching query: "${query}".`,
              matches: [],
            }
          }

          return {
            count: matches.length,
            query,
            matches: matches.map((m) => ({
              id: m.candidate.id,
              name: m.candidate.fullName,
              title: m.candidate.currentTitle,
              headline: m.candidate.headline,
              skills: m.candidate.skills,
              similarityScore: `${m.similarityPercentage}%`,
            })),
          }
        } catch (err) {
          console.error('Tool searchCandidates error:', err)
          return { error: 'Failed to search candidates.' }
        }
      },
    }),

    summarizeInterviews: tool({
      description:
        'Summarizes candidate interview status, panel ratings, and feedback notes for candidate or job.',
      inputSchema: z.object({
        candidateId: z.string().uuid().optional().describe('UUID of candidate to inspect'),
        jobId: z.string().uuid().optional().describe('UUID of job opening to inspect'),
      }),
      execute: async ({ candidateId, jobId }) => {
        try {
          let query = db
            .from('interviews')
            .select('id, application_id, scheduled_at, status, feedback, rating')
            .eq('tenant_id', tenantId)

          const { data: interviews, error } = await query
          if (error) throw error

          if (!interviews || interviews.length === 0) {
            return { message: 'No interview records found for this agency.' }
          }

          // Get applications to join candidate and job
          const appIds = interviews.map((i) => i.application_id)
          const { data: apps } = await db
            .from('applications')
            .select('id, candidate_id, job_id, stage_kind')
            .eq('tenant_id', tenantId)
            .in('id', appIds)

          const appMap = new Map((apps ?? []).map((a) => [a.id, a]))

          // Filter by candidate or job if requested
          const filtered = interviews.filter((inv) => {
            const app = appMap.get(inv.application_id)
            if (!app) return false
            if (candidateId && app.candidate_id !== candidateId) return false
            if (jobId && app.job_id !== jobId) return false
            return true
          })

          return {
            totalInterviews: filtered.length,
            records: filtered.map((inv) => ({
              id: inv.id,
              date: inv.scheduled_at,
              status: inv.status,
              rating: inv.rating ? `${inv.rating} / 5` : 'Pending rating',
              feedback: inv.feedback || 'No written feedback yet',
            })),
          }
        } catch (err) {
          console.error('Tool summarizeInterviews error:', err)
          return { error: 'Failed to summarize interviews.' }
        }
      },
    }),

    draftClientEmail: tool({
      description:
        'Fetches candidate and job details to draft a tailored introduction or update email to a hiring manager.',
      inputSchema: z.object({
        candidateId: z.string().uuid().describe('Candidate UUID'),
        jobId: z.string().uuid().describe('Job opening UUID'),
        emailType: z.enum(['intro', 'interview_schedule', 'offer_presentation']).describe('Purpose of the email'),
      }),
      execute: async ({ candidateId, jobId, emailType }) => {
        try {
          const [{ data: candidate }, { data: job }] = await Promise.all([
            db
              .from('candidates')
              .select('id, full_name, email, headline, current_title, skills, salary_expectation')
              .eq('tenant_id', tenantId)
              .eq('id', candidateId)
              .maybeSingle(),
            db
              .from('jobs')
              .select('id, title, client_id, location, salary_min, salary_max')
              .eq('tenant_id', tenantId)
              .eq('id', jobId)
              .maybeSingle(),
          ])

          if (!candidate || !job) {
            return { error: 'Candidate or Job not found in your agency.' }
          }

          let clientName = 'Hiring Manager'
          if (job.client_id) {
            const { data: client } = await db
              .from('clients')
              .select('name')
              .eq('tenant_id', tenantId)
              .eq('id', job.client_id)
              .maybeSingle()
            if (client?.name) clientName = client.name
          }

          return {
            emailType,
            clientName,
            jobTitle: job.title,
            jobLocation: job.location,
            candidate: {
              name: candidate.full_name,
              title: candidate.current_title,
              headline: candidate.headline,
              skills: candidate.skills,
              salaryExpectation: candidate.salary_expectation,
            },
            guidance: 'Draft a concise, professional, recruiter-crafted email. Highlight key matching skills.',
          }
        } catch (err) {
          console.error('Tool draftClientEmail error:', err)
          return { error: 'Failed to prepare email context.' }
        }
      },
    }),
  }
}
