import 'server-only'

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './types'

/**
 * DANGER: this client uses the service role key and therefore BYPASSES ROW
 * LEVEL SECURITY ENTIRELY. It can read and write every agency's data.
 *
 * It exists for exactly one reason: the Clerk webhook is the only writer for
 * `tenants` and `memberships`, and it runs with no user session, so there is no
 * JWT for RLS to work from.
 *
 * Permitted callers:
 *   - `app/api/webhooks/clerk/route.ts`
 *   - future background jobs that legitimately cross tenants (the GDPR erasure
 *     sweep), which must run outside any user request and log what they touched
 *
 * Forbidden everywhere else. A user-facing request path that reaches for this
 * client has silently discarded every isolation guarantee in the schema. The
 * ESLint rule in `eslint.config.mjs` fails the build on any import outside the
 * webhook directory; treat a rule violation as a design error, not as something
 * to add to the allowlist.
 *
 * If you need tenant-scoped data in a request, use `createServerSupabaseClient`
 * from `./server` instead.
 */
export function createWebhookSupabaseClient(): SupabaseClient<Database> {
  return createClient<Database>(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      auth: {
        // No session to persist or refresh: this is a machine-to-machine client.
        persistSession: false,
        autoRefreshToken: false,
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
