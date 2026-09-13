import { z } from 'zod'
import { STAGE_KINDS, type StageKind } from './candidates'
export type { StageKind }

export const REJECTED_REASONS = [
  'salary_mismatch',
  'culture_fit',
  'failed_technical',
  'client_rejected',
  'candidate_declined',
  'candidate_ghosted',
  'counter_offer_accepted',
  'other',
] as const

export type RejectedReason = (typeof REJECTED_REASONS)[number]

const trimmed = z.string().trim()

export const moveStageSchema = z
  .object({
    applicationId: z.string().uuid(),
    targetStageId: z.string().uuid(),
    targetStageKind: z.enum(STAGE_KINDS),
    expectedStageId: z.string().uuid(),
    expectedUpdatedAt: z.string(),
    rejectedReason: z.enum(REJECTED_REASONS).or(trimmed.max(100)).optional(),
    note: trimmed.max(500).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.targetStageKind === 'withdrawn' && (!val.rejectedReason || val.rejectedReason.trim() === '')) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'A rejection or withdrawal reason is required when moving to Withdrawn.',
        path: ['rejectedReason'],
      })
    }
  })

export type MoveStageInput = z.input<typeof moveStageSchema>
export type MoveStageValues = z.output<typeof moveStageSchema>

export const listBoardSchema = z.object({
  jobId: z.string().uuid().optional(),
})

export type ListBoardParams = z.output<typeof listBoardSchema>
