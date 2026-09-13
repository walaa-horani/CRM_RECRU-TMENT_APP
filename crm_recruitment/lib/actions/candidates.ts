'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireTenant } from '@/lib/auth/tenant'
import { BillingError, assertWritable } from '@/lib/billing/entitlements'
import { createCandidate } from '@/lib/services/candidates'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createCandidateSchema } from '@/lib/validation/candidates'

/**
 * Server Actions for candidates.
 *
 * The order of the four steps below is the whole point, and it is the order
 * every future action should copy:
 *
 *   1. requireTenant()  -- who is calling, and for which agency. From the Clerk
 *                          session; never from the form.
 *   2. assertWritable() -- is this agency allowed to write at all right now
 *                          (billing status, grace period).
 *   3. Zod              -- is this input a candidate.
 *   4. service          -- do it, under RLS.
 *
 * Steps 2 and 4 are both enforced in Postgres as well. That is deliberate
 * duplication: the database is the control, and these calls exist to turn a
 * bare RLS refusal into a sentence a recruiter can act on.
 */

export type CandidateFormState = {
  status: 'idle' | 'success' | 'error'
  message?: string
  /** Keyed by form field name, so the client can render errors inline. */
  fieldErrors?: Record<string, string[]>
  createdId?: string
}

export async function createCandidateAction(
  _prev: CandidateFormState,
  formData: FormData,
): Promise<CandidateFormState> {
  const { tenantId, userId } = await requireTenant()

  try {
    await assertWritable()
  } catch (error) {
    if (error instanceof BillingError) {
      return { status: 'error', message: error.message }
    }
    throw error
  }

  const parsed = createCandidateSchema.safeParse({
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    headline: formData.get('headline'),
    location: formData.get('location'),
    currentTitle: formData.get('currentTitle'),
    currentCompany: formData.get('currentCompany'),
    source: formData.get('source'),
    skills: formData.get('skills'),
    salaryExpectation: formData.get('salaryExpectation'),
    currency: formData.get('currency') || undefined,
  })

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Check the highlighted fields.',
      // z.flattenError is the Zod 4 form of the old error.flatten().
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  const supabase = createServerSupabaseClient()
  const result = await createCandidate(supabase, tenantId, userId, parsed.data)

  if (!result.ok) {
    return {
      status: 'error',
      message: result.message,
      fieldErrors: result.code === 'duplicate_email' ? { email: [result.message] } : undefined,
    }
  }

  revalidatePath('/crm')
  return { status: 'success', message: 'Candidate added.', createdId: result.id }
}
