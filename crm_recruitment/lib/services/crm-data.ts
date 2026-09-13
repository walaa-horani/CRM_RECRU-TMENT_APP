import 'server-only'

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import type {
  AuditEntry,
  Candidate,
  Client,
  ClientCandidate,
  Interview,
  Job,
  Offer,
  Plan,
  Role,
  Stage,
  TeamMember,
  Tenant,
  TenantStage,
} from '@/lib/crm/data'

export type TenantClient = SupabaseClient<Database>

export async function loadTenantCrmData(
  db: TenantClient,
  tenantId: string,
): Promise<Tenant> {
  // 1. Tenant info
  const { data: tenantRow } = await db
    .from('tenants')
    .select('id, name, plan')
    .eq('id', tenantId)
    .maybeSingle()

  const tenantName = tenantRow?.name || 'Recruitment Agency'
  const plan: Plan = (tenantRow?.plan === 'free' ? 'free' : 'pro') as Plan

  // 2. Memberships / Team
  const { data: memberRows } = await db
    .from('memberships')
    .select('clerk_user_id, full_name, email, role, status')
    .eq('tenant_id', tenantId)

  const team: TeamMember[] = (memberRows ?? []).map((m, i) => {
    const name = m.full_name || 'Team Member'
    return {
      id: m.clerk_user_id || `${tenantId}-u${i}`,
      name,
      initials: initials(name),
      email: m.email || 'recruiter@agency.com',
      role: (m.role as Role) || 'recruiter',
      status: m.status === 'active' ? 'active' : 'invited',
    }
  })

  // 3. Pipeline Stages
  const { data: stageRows } = await db
    .from('pipeline_stages')
    .select('id, kind, label, position')
    .eq('tenant_id', tenantId)
    .order('position', { ascending: true })

  const stages: TenantStage[] = (stageRows ?? []).map((s) => ({
    id: s.id,
    kind: s.kind as Stage,
    label: s.label,
    position: s.position,
  }))

  // 4. Clients, Jobs & Contacts
  const { data: clientRows } = await db
    .from('clients')
    .select('id, name, industry, status')
    .eq('tenant_id', tenantId)

  const clientIds = (clientRows ?? []).map((c) => c.id)

  const [{ data: contactRows }, { data: jobRows }] = await Promise.all([
    clientIds.length > 0
      ? db
          .from('client_contacts')
          .select('client_id, full_name')
          .eq('tenant_id', tenantId)
          .in('client_id', clientIds)
      : Promise.resolve({ data: [] }),
    db
      .from('jobs')
      .select('id, client_id, title, location, salary_min, salary_max, status')
      .eq('tenant_id', tenantId),
  ])

  const contactMap = new Map<string, string>()
  for (const contact of contactRows ?? []) {
    if (!contactMap.has(contact.client_id)) {
      contactMap.set(contact.client_id, contact.full_name)
    }
  }

  const clientMap = new Map<string, string>()
  for (const c of clientRows ?? []) {
    clientMap.set(c.id, c.name)
  }

  const openJobsCount = new Map<string, number>()
  for (const j of jobRows ?? []) {
    if (j.status === 'open') {
      openJobsCount.set(j.client_id, (openJobsCount.get(j.client_id) || 0) + 1)
    }
  }

  // 5. Jobs
  const jobs: Job[] = (jobRows ?? []).map((j) => ({
    id: j.id,
    title: j.title,
    clientId: j.client_id,
    clientName: clientMap.get(j.client_id) || 'Client',
    location: j.location || 'Remote',
    salaryMin: j.salary_min ? Number(j.salary_min) / 1000 : 90,
    salaryMax: j.salary_max ? Number(j.salary_max) / 1000 : 140,
    status: j.status === 'open' ? 'open' : 'closed',
  }))

  const jobMap = new Map<string, Job>()
  for (const j of jobs) {
    jobMap.set(j.id, j)
  }

  // 6. Candidates & Applications (Single Source of Truth: applications.stage_kind)
  const { data: candRows } = await db
    .from('candidates')
    .select('id, full_name, email, current_title, skills, created_at')
    .eq('tenant_id', tenantId)

  const { data: appRows } = await db
    .from('applications')
    .select('id, candidate_id, job_id, stage_id, stage_kind, applied_at, updated_at')
    .eq('tenant_id', tenantId)

  const appByCandidate = new Map<string, (typeof appRows extends (infer T)[] | null ? T : never)>()
  const appMap = new Map<string, (typeof appRows extends (infer T)[] | null ? T : never)>()
  for (const app of appRows ?? []) {
    appByCandidate.set(app.candidate_id, app)
    appMap.set(app.id, app)
  }

  const candMap = new Map<string, string>()
  const candidates: Candidate[] = (candRows ?? []).map((c) => {
    const app = appByCandidate.get(c.id)
    const job = app ? jobMap.get(app.job_id) : undefined
    const name = c.full_name
    candMap.set(c.id, name)

    return {
      id: app ? app.id : c.id, // Application ID for board actions
      candidateId: c.id,
      applicationId: app?.id,
      stageId: app?.stage_id,
      updatedAt: app?.updated_at,
      name,
      initials: initials(name),
      title: c.current_title || job?.title || 'Professional',
      stage: (app?.stage_kind as Stage) || 'source', // SINGLE SOURCE OF TRUTH: applications.stage_kind
      tags: c.skills ?? ['Qualified'],
      appliedDate: app?.applied_at ? new Date(app.applied_at).getTime() : new Date(c.created_at).getTime(),
      email: c.email || 'candidate@mail.com',
      resumeName: `${name.replace(/\s+/g, '_')}_CV.pdf`,
      jobTitle: job?.title || 'Open Position',
      clientName: job?.clientName || 'Partner Client',
    }
  })

  // 7. Clients with linked pipeline candidates (single source of truth stage)
  const clients: Client[] = (clientRows ?? []).map((c) => {
    const clientJobIds = new Set((jobRows ?? []).filter((j) => j.client_id === c.id).map((j) => j.id))
    const clientApps = (appRows ?? []).filter((a) => clientJobIds.has(a.job_id))

    const clientCandidates: ClientCandidate[] = clientApps.map((a) => {
      const cand = (candRows ?? []).find((cd) => cd.id === a.candidate_id)
      const job = (jobRows ?? []).find((j) => j.id === a.job_id)
      const candName = cand?.full_name || 'Candidate'
      return {
        id: a.id,
        candidateId: a.candidate_id,
        candidateName: candName,
        initials: initials(candName),
        jobTitle: job?.title || 'Role',
        stage: (a.stage_kind as Stage) || 'source', // SINGLE SOURCE OF TRUTH: applications.stage_kind
        appliedDate: new Date(a.applied_at).getTime(),
      }
    })

    return {
      id: c.id,
      name: c.name,
      industry: c.industry || 'Technology',
      openJobs: openJobsCount.get(c.id) || 0,
      contact: contactMap.get(c.id) || 'Hiring Manager',
      candidates: clientCandidates,
      activity: [
        {
          actor: team[0]?.name || 'Admin',
          action: 'Job posted',
          ts: Date.now() - 3 * 86400000,
        },
      ],
    }
  })

  // 8. Interviews (Single Source of Truth: applications.stage_kind)
  const { data: interviewRows } = await db
    .from('interviews')
    .select('id, application_id, scheduled_at, timezone, status, feedback, rating')
    .eq('tenant_id', tenantId)

  const interviews: Interview[] = (interviewRows ?? []).map((inv) => {
    const app = appMap.get(inv.application_id)
    const candName = app ? (candMap.get(app.candidate_id) || 'Candidate') : 'Candidate'
    const job = app ? jobMap.get(app.job_id) : undefined

    return {
      id: inv.id,
      applicationId: inv.application_id,
      candidateId: app?.candidate_id || inv.application_id,
      candidateName: candName,
      jobTitle: job?.title || 'Role',
      clientName: job?.clientName || 'Client',
      stage: (app?.stage_kind as Stage) || 'interviewing', // SINGLE SOURCE OF TRUTH: applications.stage_kind
      panel: ['Lead Engineer', 'Engineering Manager'],
      date: new Date(inv.scheduled_at).getTime(),
      timezone: inv.timezone || 'UTC',
      status: inv.status === 'completed' ? 'completed' : 'upcoming',
      feedback: inv.feedback
        ? {
            rating: inv.rating || 4,
            summary: inv.feedback,
            by: team[0]?.name || 'Interviewer',
          }
        : null,
    }
  })

  // 9. Offers
  const { data: offerRows } = await db
    .from('offers')
    .select('id, application_id, salary, status, created_at, approved_by')
    .eq('tenant_id', tenantId)

  const offers: Offer[] = (offerRows ?? []).map((off) => {
    const app = appMap.get(off.application_id)
    const candName = app ? (candMap.get(app.candidate_id) || 'Candidate') : 'Candidate'
    const job = app ? jobMap.get(app.job_id) : undefined
    const sal = off.salary ? Number(off.salary) / 1000 : 120

    return {
      id: off.id,
      candidateId: app?.candidate_id || off.application_id,
      candidateName: candName,
      clientName: job?.clientName || 'Client',
      jobTitle: job?.title || 'Role',
      salary: sal,
      thresholdMin: sal - 10,
      withinThreshold: true,
      status: off.status === 'accepted' ? 'approved' : 'draft',
      createdBy: team[0]?.name || 'Recruiter',
      createdAt: new Date(off.created_at).getTime(),
      approvedBy: off.approved_by || null,
      approvedAt: off.approved_by ? new Date(off.created_at).getTime() : null,
    }
  })

  // 10. Audit Logs
  const { data: auditRows } = await db
    .from('audit_logs')
    .select('actor_user_id, action, entity_type, entity_id, created_at')
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false })
    .limit(25)

  const audit: AuditEntry[] = (auditRows ?? []).map((a) => ({
    actor: a.actor_user_id || 'System',
    action: a.action,
    entity: `${a.entity_type}:${a.entity_id?.slice(0, 8)}`,
    ts: new Date(a.created_at).getTime(),
  }))

  return {
    id: tenantId,
    name: tenantName,
    plan,
    team: team.length > 0 ? team : [
      {
        id: `${tenantId}-u1`,
        name: 'Walaa Horani',
        initials: 'WH',
        email: 'walaa.horani@gmail.com',
        role: 'admin',
        status: 'active',
      },
    ],
    clients,
    jobs,
    candidates,
    interviews,
    offers,
    audit,
    stages: stages.length > 0 ? stages : undefined,
  }
}

function initials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((p) => p[0] ?? '')
    .join('')
    .slice(0, 2)
    .toUpperCase()
}
