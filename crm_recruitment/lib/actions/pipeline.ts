'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

import { requireTenant } from '@/lib/auth/tenant'
import { BillingError, assertWritable } from '@/lib/billing/entitlements'
import { moveApplicationStage, type MoveStageResult } from '@/lib/services/pipeline'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { moveStageSchema, type MoveStageInput } from '@/lib/validation/pipeline'

export type MoveStageActionState =
  | { status: 'idle' }
  | { status: 'success'; id: string; stageKind: string; updatedAt: string }
  | { status: 'error'; message: string; code?: string; fieldErrors?: Record<string, string[]> }

export async function moveApplicationStageAction(
  input: MoveStageInput,
): Promise<MoveStageActionState> {
  const { tenantId, userId } = await requireTenant()

  try {
    await assertWritable()
  } catch (error) {
    if (error instanceof BillingError) {
      return { status: 'error', message: error.message, code: 'billing_read_only' }
    }
    throw error
  }

  const parsed = moveStageSchema.safeParse(input)

  if (!parsed.success) {
    return {
      status: 'error',
      message: 'Invalid stage movement parameters.',
      fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
    }
  }

  const supabase = createServerSupabaseClient()
  const result: MoveStageResult = await moveApplicationStage(supabase, tenantId, userId, parsed.data)

  if (!result.ok) {
    return {
      status: 'error',
      code: result.code,
      message: result.message,
    }
  }

  revalidatePath('/crm')
  return {
    status: 'success',
    id: result.id,
    stageKind: result.stageKind,
    updatedAt: result.updatedAt,
  }
}
