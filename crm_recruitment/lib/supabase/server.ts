import 'server-only'

import { auth } from '@clerk/nextjs/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './types'

/**
 * The Supabase client every user-facing code path must use.
 *
 * It authenticates as the signed-in Clerk user by handing Supabase the Clerk
 * session token, so every query runs under that user's RLS context. Supabase's
 * third-party auth integration verifies the token against the Clerk issuer; no
 * JWT template is involved (that flow is deprecated).
 *
 * Consequences worth knowing:
 *   - Tenant scoping is automatic. Policies read the active organization from
 *     the token, so a query never needs (and must never accept) a tenant_id
 *     from the caller.
 *   - A user with no active Clerk organization has no org claim, so every
 *     tenant-scoped table returns zero rows rather than erroring. Callers that
 *     need to distinguish "empty agency" from "no agency selected" should check
 *     the session, not the row count.
 *
 * Do not cache the returned client across requests: it closes over the current
 * request's token.
 */
export function createServerSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'),
    {
      async accessToken() {
        return (await auth()).getToken()
      },
    },
  )
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  return value
}
