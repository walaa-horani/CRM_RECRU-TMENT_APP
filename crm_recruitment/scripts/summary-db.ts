import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mljuvasmpxwsjlldogwa.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sanV2YXNtcHh3c2psbGRvZ3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYzMzM2NSwiZXhwIjoyMTA0MjA5MzY1fQ.tLblg18UpwgTxi8VDK0JUQASr3YnnK8DtUcOFbc87wc'

const db = createClient(url, serviceKey)

async function summarize() {
  const tables = [
    'tenants',
    'memberships',
    'pipeline_stages',
    'clients',
    'client_contacts',
    'jobs',
    'candidates',
    'applications',
    'interviews',
    'offers',
    'audit_logs',
  ]

  console.log('--- SUPABASE DATABASE REAL ROW COUNTS ---')
  for (const table of tables) {
    const { count, error } = await db.from(table).select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`${table}: Error (${error.message})`)
    } else {
      console.log(`${table}: ${count} rows`)
    }
  }
}

summarize().catch(console.error)
