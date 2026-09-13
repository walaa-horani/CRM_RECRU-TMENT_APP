import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, PipelineStage, StageKind } from '@/lib/supabase/types'
import type { MoveStageValues } from '@/lib/validation/pipeline'

export type TenantClient = SupabaseClient<Database>

export interface BoardCard {
  id: string
  candidateId: string
  fullName: string
  initials: string
  headline: string | null
  currentTitle: string | null
  skills: string[]
  stageId: string
  stageKind: StageKind
  status: string
  appliedAt: string
  stageEnteredAt: string
  updatedAt: string
  jobId: string
  jobTitle: string | null
  clientName: string | null
}

export async function listPipelineStages(
  db: TenantClient,
  tenantId: string,
): Promise<PipelineStage[]> {
  const { data, error } = await db
    .from('pipeline_stages')
    .select('*')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })

  if (error) throw error
  return data ?? []
}

export async function listBoardApplications(
  db: TenantClient,
  tenantId: string,
  jobId?: string,
): Promise<BoardCard[]> {
  let query = db
    .from('applications')
    .select('id, candidate_id, job_id, stage_id, stage_kind, status, applied_at, stage_entered_at, updated_at')
    .eq('tenant_id', tenantId)

  if (jobId) {
    query = query.eq('job_id', jobId)
  }

  const { data: applications, error } = await query.order('stage_entered_at', { ascending: false })

  if (error) throw error
  if (!applications || applications.length === 0) return []

  const candidateIds = Array.from(new Set(applications.map((a) => a.candidate_id)))
  const jobIds = Array.from(new Set(applications.map((a) => a.job_id)))

  const [{ data: candidates, error: candError }, { data: jobs, error: jobsError }] = await Promise.all([
    db
      .from('candidates')
      .select('id, full_name, headline, current_title, skills')
      .eq('tenant_id', tenantId)
      .in('id', candidateIds),
    db
      .from('jobs')
      .select('id, title, client_id')
      .eq('tenant_id', tenantId)
      .in('id', jobIds),
  ])

  if (candError) throw candError
  if (jobsError) throw jobsError

  const clientIds = Array.from(new Set((jobs ?? []).map((j) => j.client_id)))
  let clientMap = new Map<string, string>()

  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await db
      .from('clients')
      .select('id, name')
      .eq('tenant_id', tenantId)
      .in('id', clientIds)

    if (clientsError) throw clientsError
    clientMap = new Map((clients ?? []).map((c) => [c.id, c.name]))
  }

  const candidateMap = new Map((candidates ?? []).map((c) => [c.id, c]))
  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]))

  return applications.map((app) => {
    const candidate = candidateMap.get(app.candidate_id)
    const job = jobMap.get(app.job_id)
    const fullName = candidate?.full_name ?? 'Unknown Candidate'

    return {
      id: app.id,
      candidateId: app.candidate_id,
      fullName,
      initials: initialsOf(fullName),
      headline: candidate?.headline ?? null,
      currentTitle: candidate?.current_title ?? null,
      skills: candidate?.skills ?? [],
      stageId: app.stage_id,
      stageKind: app.stage_kind,
      status: app.status,
      appliedAt: app.applied_at,
      stageEnteredAt: app.stage_entered_at,
      updatedAt: app.updated_at,
      jobId: app.job_id,
      jobTitle: job?.title ?? null,
      clientName: job ? (clientMap.get(job.client_id) ?? null) : null,
    }
  })
}

export type MoveStageResult =
  | { ok: true; id: string; stageKind: StageKind; updatedAt: string }
  | {
      ok: false
      code: 'illegal_transition' | 'conflict' | 'forbidden' | 'not_found'
      message: string
    }

export async function moveApplicationStage(
  db: TenantClient,
  tenantId: string,
  userId: string,
  values: MoveStageValues,
): Promise<MoveStageResult> {
  // Execute update guarded by Optimistic Concurrency Control (OCC)
  const { data, error } = await db
    .from('applications')
    .update({
      stage_id: values.targetStageId,
      stage_kind: values.targetStageKind,
      rejected_reason: values.rejectedReason ?? null,
    })
    .eq('id', values.applicationId)
    .eq('tenant_id', tenantId)
    .eq('stage_id', values.expectedStageId)
    .eq('updated_at', values.expectedUpdatedAt)
    .select('id, stage_kind, updated_at')
    .maybeSingle()

  if (error) {
    // 23514 is the check_violation raised by app.enforce_stage_transition() trigger
    if (error.code === '23514') {
      return {
        ok: false,
        code: 'illegal_transition',
        message: error.message || 'This stage transition is not permitted by pipeline policy.',
      }
    }
    // 42501 is an RLS refusal
    if (error.code === '42501') {
      return {
        ok: false,
        code: 'forbidden',
        message: 'You do not have permission to move candidate stages.',
      }
    }
    throw error
  }

  // If no row was updated, check if it was due to a concurrent move or if application is missing
  if (!data) {
    const { data: current } = await db
      .from('applications')
      .select('stage_id, stage_kind, updated_at')
      .eq('id', values.applicationId)
      .eq('tenant_id', tenantId)
      .maybeSingle()

    if (!current) {
      return {
        ok: false,
        code: 'not_found',
        message: 'Application record was not found.',
      }
    }

    return {
      ok: false,
      code: 'conflict',
      message: 'This candidate was updated by another team member. The board has been refreshed with latest data.',
    }
  }

  // If moving to interviewing, ensure an interview record exists in public.interviews
  if (values.targetStageKind === 'interviewing') {
    const { data: existingIv } = await db
      .from('interviews')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('application_id', values.applicationId)
      .maybeSingle()

    if (!existingIv) {
      await db.from('interviews').insert({
        tenant_id: tenantId,
        application_id: values.applicationId,
        round: 1,
        scheduled_at: new Date(Date.now() + 2 * 86400000).toISOString(),
        duration_minutes: 60,
        mode: 'video',
        status: 'scheduled',
        created_by: userId,
      })
    }
  }

  return {
    ok: true,
    id: data.id,
    stageKind: data.stage_kind,
    updatedAt: data.updated_at,
  }
}

function initialsOf(name: string): string {
  const parts = name.split(/\s+/).filter(Boolean)
  return parts
    .map((part) => part[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
