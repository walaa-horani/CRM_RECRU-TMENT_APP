const secretKey = process.env.CLERK_SECRET_KEY || 'sk_test_uHdYwJjvQ7Q94nFduTYE1fgk0HQPYkqK2Nm7bL6tpL'

async function checkClerk() {
  console.log('Fetching Clerk organizations and users...')
  const orgsRes = await fetch('https://api.clerk.com/v1/organizations', {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const orgs = await orgsRes.json()
  console.log('Clerk Organizations:', orgs)

  const usersRes = await fetch('https://api.clerk.com/v1/users', {
    headers: { Authorization: `Bearer ${secretKey}` },
  })
  const users = await usersRes.json()
  console.log('Clerk Users:', users)
}

checkClerk().catch(console.error)
