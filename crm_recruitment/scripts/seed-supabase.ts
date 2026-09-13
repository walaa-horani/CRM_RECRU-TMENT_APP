import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { buildCrmData, type Stage } from '../lib/crm/data'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mljuvasmpxwsjlldogwa.supabase.co'
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sanV2YXNtcHh3c2psbGRvZ3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYzMzM2NSwiZXhwIjoyMTA0MjA5MzY1fQ.tLblg18UpwgTxi8VDK0JUQASr3YnnK8DtUcOFbc87wc'

const db = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
})

interface TenantTarget {
  id: string
  name: string
  plan: 'free' | 'pro'
  sourceSeedKey: 't1' | 't2' | 't3'
  adminUser?: { id: string; email: string; name: string }
}

async function seed() {
  console.log('--- STARTING COMPREHENSIVE SUPABASE SEED ---')
  const mockData = buildCrmData()

  // Targets: Real Clerk organizations + Demo tenants
  const targets: TenantTarget[] = [
    {
      id: 'org_3IwpLQozweG7ikRIBUJIW0Gpb5Z',
      name: "Walaa's Organization",
      plan: 'pro',
      sourceSeedKey: 't1',
      adminUser: {
        id: 'user_3IwpKUuInbYN6B4ubibn4hefvMr',
        email: 'walaa.horani@gmail.com',
        name: 'Walaa Horani',
      },
    },
    {
      id: 'org_3IwppzwtuLhw52L15WFeXoswKCH',
      name: 'my second org',
      plan: 'pro',
      sourceSeedKey: 't2',
      adminUser: {
        id: 'user_3Iwpo98mQ4MW1IzGolSYwqZnPys',
        email: 'walaa@secondorg.com',
        name: 'walaa horani',
      },
    },
    {
      id: 't1',
      name: 'Skyline Talent Partners',
      plan: 'pro',
      sourceSeedKey: 't1',
      adminUser: {
        id: 'user_t1_admin',
        email: 'admin@skylinetalent.com',
        name: 'Skyline Admin',
      },
    },
    {
      id: 't2',
      name: 'Vertex Staffing Group',
      plan: 'free',
      sourceSeedKey: 't2',
      adminUser: {
        id: 'user_t2_admin',
        email: 'admin@vertexstaffing.com',
        name: 'Vertex Admin',
      },
    },
    {
      id: 't3',
      name: 'Meridian Recruiting Co.',
      plan: 'pro',
      sourceSeedKey: 't3',
      adminUser: {
        id: 'user_t3_admin',
        email: 'admin@meridianrecruiting.com',
        name: 'Meridian Admin',
      },
    },
  ]

  for (const target of targets) {
    console.log(`\n==> Seeding Tenant: ${target.name} (${target.id})`)
    const source = mockData[target.sourceSeedKey]
    const adminId = target.adminUser?.id || 'system_seed'

    // 1. Tenants table
    const { error: tErr } = await db.from('tenants').upsert({
      id: target.id,
      name: target.name,
      slug: target.name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      plan: target.plan,
      seats_purchased: target.plan === 'pro' ? null : 2,
      subscription_status: 'active',
      updated_at: new Date().toISOString(),
    })
    if (tErr) console.error(`Error inserting tenant ${target.id}:`, tErr.message)

    // 2. Memberships
    if (target.adminUser) {
      const { error: mErr } = await db.from('memberships').upsert({
        tenant_id: target.id,
        clerk_user_id: target.adminUser.id,
        email: target.adminUser.email,
        full_name: target.adminUser.name,
        role: 'admin',
        status: 'active',
        updated_at: new Date().toISOString(),
      })
      if (mErr) console.error(`Error inserting admin membership:`, mErr.message)
    }

    // Additional team members from mock
    for (let i = 0; i < source.team.length; i++) {
      const member = source.team[i]
      const memberClerkId = target.adminUser && i === 0 ? target.adminUser.id : `${target.id}_u_${i}`
      await db.from('memberships').upsert({
        tenant_id: target.id,
        clerk_user_id: memberClerkId,
        email: member.email,
        full_name: member.name,
        role: member.role,
        status: member.status,
        updated_at: new Date().toISOString(),
      })
    }

    // 3. Pipeline Stages
    const canonicalStages: { kind: Stage; label: string; position: number; is_terminal: boolean }[] = [
      { kind: 'source', label: 'Sourced', position: 1, is_terminal: false },
      { kind: 'screening', label: 'Screening', position: 2, is_terminal: false },
      { kind: 'interviewing', label: 'Interviewing', position: 3, is_terminal: false },
      { kind: 'offer', label: 'Offer Extended', position: 4, is_terminal: false },
      { kind: 'placed', label: 'Placed / Hired', position: 5, is_terminal: true },
      { kind: 'withdrawn', label: 'Withdrawn', position: 6, is_terminal: true },
    ]

    const stageMap = new Map<Stage, string>()

    for (const stage of canonicalStages) {
      // Check if exists
      const { data: existing } = await db
        .from('pipeline_stages')
        .select('id')
        .eq('tenant_id', target.id)
        .eq('kind', stage.kind)
        .maybeSingle()

      if (existing) {
        stageMap.set(stage.kind, existing.id)
      } else {
        const stageId = randomUUID()
        const { error: psErr } = await db.from('pipeline_stages').insert({
          id: stageId,
          tenant_id: target.id,
          kind: stage.kind,
          label: stage.label,
          position: stage.position,
          is_terminal: stage.is_terminal,
        })
        if (psErr) {
          console.error(`Error inserting pipeline stage ${stage.kind}:`, psErr.message)
        } else {
          stageMap.set(stage.kind, stageId)
        }
      }
    }
    console.log(`Pipeline stages ready: ${stageMap.size} stages.`)

    // 4. Clients & Contacts
    const clientUuidMap = new Map<string, string>()
    for (const c of source.clients) {
      const clientUuid = randomUUID()
      clientUuidMap.set(c.name, clientUuid)

      const { error: cErr } = await db.from('clients').insert({
        id: clientUuid,
        tenant_id: target.id,
        name: c.name,
        domain: `${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        industry: c.industry,
        status: 'active',
        created_by: adminId,
        owner_user_id: adminId,
      })
      if (cErr) {
        console.error(`Error inserting client ${c.name}:`, cErr.message)
        continue
      }

      // Add primary contact
      await db.from('client_contacts').insert({
        id: randomUUID(),
        tenant_id: target.id,
        client_id: clientUuid,
        full_name: c.contact,
        email: `${c.contact.toLowerCase().replace(/\s+/g, '.')}@${c.name.toLowerCase().replace(/[^a-z0-9]/g, '')}.com`,
        is_primary: true,
        title: 'Hiring Manager',
      })
    }
    console.log(`Inserted ${clientUuidMap.size} clients.`)

    // 5. Jobs
    const jobUuidMap = new Map<string, { id: string; clientId: string }>()
    for (const j of source.jobs) {
      const clientUuid = clientUuidMap.get(j.clientName)
      if (!clientUuid) continue

      const jobUuid = randomUUID()
      jobUuidMap.set(j.title + '_' + j.clientName, { id: jobUuid, clientId: clientUuid })

      const { error: jErr } = await db.from('jobs').insert({
        id: jobUuid,
        tenant_id: target.id,
        client_id: clientUuid,
        title: j.title,
        description: `Looking for an experienced ${j.title} to join our growing team.`,
        location: j.location,
        remote_type: j.location === 'Remote' ? 'remote' : 'hybrid',
        employment_type: 'permanent',
        salary_min: j.salaryMin * 1000,
        salary_max: j.salaryMax * 1000,
        currency: 'USD',
        status: j.status === 'open' ? 'open' : 'closed',
        openings: 1,
        created_by: adminId,
        owner_user_id: adminId,
      })
      if (jErr) console.error(`Error inserting job ${j.title}:`, jErr.message)
    }
    console.log(`Inserted ${jobUuidMap.size} jobs.`)

    // 6. Candidates & Applications
    const candUuidMap = new Map<string, string>()
    const appUuidMap = new Map<string, string>()

    for (const c of source.candidates) {
      const candUuid = randomUUID()
      candUuidMap.set(c.name, candUuid)

      const salaryExp = 90000 + Math.floor(Math.random() * 60) * 1000

      const { error: candErr } = await db.from('candidates').insert({
        id: candUuid,
        tenant_id: target.id,
        full_name: c.name,
        email: `${c.name.toLowerCase().replace(/\s+/g, '.')}.${target.id.slice(0, 6)}@mail.com`,
        headline: `${c.title} • ${c.tags.join(', ')}`,
        current_title: c.title,
        skills: c.tags,
        salary_expectation: salaryExp,
        currency: 'USD',
        source: 'Sourced Lead',
        created_by: adminId,
        owner_user_id: adminId,
      })
      if (candErr) {
        console.error(`Error inserting candidate ${c.name}:`, candErr.message)
        continue
      }

      // Link application to job and stage
      const jobInfo = jobUuidMap.get(c.jobTitle + '_' + c.clientName) || Array.from(jobUuidMap.values())[0]
      const stageId = stageMap.get(c.stage) || stageMap.get('source')!

      if (jobInfo && stageId) {
        const appUuid = randomUUID()
        appUuidMap.set(c.name, appUuid)

        const appStatus = c.stage === 'placed' ? 'placed' : c.stage === 'withdrawn' ? 'withdrawn' : 'active'
        const rejectedReason = c.stage === 'withdrawn' ? 'Candidate withdrew interest' : null

        const { error: appErr } = await db.from('applications').insert({
          id: appUuid,
          tenant_id: target.id,
          candidate_id: candUuid,
          job_id: jobInfo.id,
          stage_id: stageId,
          stage_kind: c.stage,
          status: appStatus,
          rejected_reason: rejectedReason,
          created_by: adminId,
          owner_user_id: adminId,
          applied_at: new Date(c.appliedDate).toISOString(),
          stage_entered_at: new Date(c.appliedDate).toISOString(),
        })
        if (appErr) console.error(`Error inserting application for ${c.name}:`, appErr.message)
      }
    }
    console.log(`Inserted ${candUuidMap.size} candidates & ${appUuidMap.size} applications.`)

    // 7. Interviews
    let intCount = 0
    for (const int of source.interviews) {
      const appUuid = appUuidMap.get(int.candidateName)
      if (!appUuid) continue

      const { error: intErr } = await db.from('interviews').insert({
        id: randomUUID(),
        tenant_id: target.id,
        application_id: appUuid,
        round: 1,
        scheduled_at: new Date(int.date).toISOString(),
        duration_minutes: 60,
        timezone: int.timezone,
        mode: 'video',
        location_or_link: 'https://meet.google.com/crm-interview',
        status: int.status === 'upcoming' ? 'scheduled' : 'completed',
        feedback: int.feedback?.summary || null,
        rating: int.feedback?.rating || null,
        outcome: int.feedback && int.feedback.rating >= 4 ? 'advance' : 'hold',
        created_by: adminId,
      })
      if (!intErr) intCount++
    }
    console.log(`Inserted ${intCount} interviews.`)

    // 8. Offers
    let offCount = 0
    for (const off of source.offers) {
      const appUuid = appUuidMap.get(off.candidateName)
      if (!appUuid) continue

      const { error: offErr } = await db.from('offers').insert({
        id: randomUUID(),
        tenant_id: target.id,
        application_id: appUuid,
        salary: off.salary * 1000,
        currency: 'USD',
        bonus: 10000,
        status: off.status === 'approved' ? 'accepted' : 'draft',
        created_by: adminId,
        approved_by: off.approvedBy ? adminId : null,
        created_at: new Date(off.createdAt).toISOString(),
      })
      if (!offErr) offCount++
    }
    console.log(`Inserted ${offCount} offers.`)
  }

  console.log('\n--- SEEDING COMPLETED SUCCESSFULLY ---')
}

seed().catch((err) => {
  console.error('Fatal seed error:', err)
  process.exit(1)
})
