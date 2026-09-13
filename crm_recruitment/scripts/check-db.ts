import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mljuvasmpxwsjlldogwa.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1sanV2YXNtcHh3c2psbGRvZ3dhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4ODYzMzM2NSwiZXhwIjoyMTA0MjA5MzY1fQ.tLblg18UpwgTxi8VDK0JUQASr3YnnK8DtUcOFbc87wc'

const supabase = createClient(url, serviceKey)

async function main() {
  console.log('Connecting to Supabase at:', url)
  const { data: tenants, error: tErr } = await supabase.from('tenants').select('*')
  if (tErr) {
    console.error('Error querying tenants:', tErr.message, tErr.code)
  } else {
    console.log('Found tenants:', tenants)
  }

  const { data: stages, error: sErr } = await supabase.from('pipeline_stages').select('*')
  if (sErr) {
    console.error('Error querying pipeline_stages:', sErr.message, sErr.code)
  } else {
    console.log('Found pipeline stages count:', stages?.length)
  }
}

main().catch(console.error)
