'use server'

import { auth, clerkClient } from '@clerk/nextjs/server'
import { createWebhookSupabaseClient } from '@/lib/supabase/admin'

export interface OrganizationItem {
  id: string
  name: string
  slug: string | null
  imageUrl: string | null
  plan: 'free' | 'pro'
  subscriptionStatus: string
  seatsPurchased: number | null
  role: string | null
  membersCount?: number
  isCurrent: boolean
}

export async function getOrganizationsWithPlans(): Promise<OrganizationItem[]> {
  const { userId, orgId } = await auth()
  if (!userId) return []

  const client = await clerkClient()

  // 1. Get user memberships from Clerk
  const { data: userMemberships } = await client.users.getOrganizationMembershipList({
    userId,
  })

  // 2. Query Supabase for real tenant rows using admin client
  const supabase = createWebhookSupabaseClient()
  const { data: tenants } = await supabase
    .from('tenants')
    .select('id, name, slug, plan, subscription_status, seats_purchased, updated_at')
    .order('created_at', { ascending: false })

  const tenantMap = new Map((tenants ?? []).map((t) => [t.id, t]))

  // 3. Map user's Clerk organizations with their Supabase tier
  const orgItems: OrganizationItem[] = userMemberships.map((m) => {
    const org = m.organization
    const tenant = tenantMap.get(org.id)

    return {
      id: org.id,
      name: org.name,
      slug: org.slug ?? null,
      imageUrl: org.imageUrl ?? null,
      plan: (tenant?.plan === 'pro' ? 'pro' : 'free') as 'free' | 'pro',
      subscriptionStatus: tenant?.subscription_status ?? 'active',
      seatsPurchased: tenant?.seats_purchased ?? null,
      role: m.role.replace('org:', ''),
      membersCount: org.membersCount,
      isCurrent: org.id === orgId,
    }
  })

  // 4. Include other registered tenants from Supabase so all agencies are visible
  const userOrgIdSet = new Set(orgItems.map((o) => o.id))
  for (const t of tenants ?? []) {
    if (!userOrgIdSet.has(t.id)) {
      orgItems.push({
        id: t.id,
        name: t.name,
        slug: t.slug,
        imageUrl: null,
        plan: (t.plan === 'pro' ? 'pro' : 'free') as 'free' | 'pro',
        subscriptionStatus: t.subscription_status ?? 'active',
        seatsPurchased: t.seats_purchased ?? null,
        role: null,
        isCurrent: t.id === orgId,
      })
    }
  }

  return orgItems
}
