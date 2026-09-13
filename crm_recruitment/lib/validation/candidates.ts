import { z } from 'zod'

/**
 * Zod schemas for everything that reaches the candidates table.
 *
 * Note what is NOT in any of these: `tenant_id`. It is not an optional field or
 * a validated one -- it is absent by construction, so there is no shape of
 * request body that can carry it. The tenant comes from the Clerk session on
 * the server and nowhere else (AGENTS.md rule 2), and RLS refuses the write if
 * the two ever disagree.
 */

export const STAGE_KINDS = [
  'source',
  'screening',
  'interviewing',
  'offer',
  'placed',
  'withdrawn',
] as const

export type StageKind = (typeof STAGE_KINDS)[number]

const trimmed = z.string().trim()

/**
 * PostgREST's `or=` filter is a string grammar, so an unescaped comma or
 * parenthesis in a search term is not a bad search -- it is a second filter.
 * Terms are stripped rather than escaped: these characters carry no meaning in
 * a name search, so dropping them loses nothing a recruiter would type on
 * purpose.
 */
const searchTerm = trimmed
  .max(120)
  .transform((value) => value.replace(/[,()*\\"']/g, ' ').replace(/\s+/g, ' ').trim())

export const listCandidatesSchema = z.object({
  q: searchTerm.optional(),
  stage: z.enum(STAGE_KINDS).optional(),
  /** Capped server-side: a client asking for 10,000 rows is a client bug or an abuse. */
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).max(10_000).default(0),
})

export type ListCandidatesInput = z.input<typeof listCandidatesSchema>
export type ListCandidatesParams = z.output<typeof listCandidatesSchema>

export const createCandidateSchema = z.object({
  fullName: trimmed.min(1, 'Name is required').max(200),
  // Empty string from an untouched form input is not an email -- it is absence.
  // Normalising before validating keeps the DB's partial unique index on
  // (tenant_id, email) from filling up with '' rows.
  email: z
    .union([z.literal(''), z.email().max(320)])
    .optional()
    .transform((value) => (value ? value.toLowerCase() : null)),
  phone: trimmed.max(50).optional().transform(emptyToNull),
  headline: trimmed.max(200).optional().transform(emptyToNull),
  location: trimmed.max(200).optional().transform(emptyToNull),
  currentTitle: trimmed.max(200).optional().transform(emptyToNull),
  currentCompany: trimmed.max(200).optional().transform(emptyToNull),
  source: trimmed.max(60).optional().transform(emptyToNull),
  skills: z
    .union([z.array(trimmed.min(1).max(60)), trimmed])
    .optional()
    .transform((value) => {
      const list = Array.isArray(value) ? value : (value ?? '').split(',')
      return Array.from(
        new Set(list.map((s) => s.trim()).filter(Boolean).slice(0, 50)),
      )
    }),
  salaryExpectation: z
    .union([z.literal(''), z.coerce.number().min(0).max(100_000_000)])
    .optional()
    .transform((value) => (value === '' || value === undefined ? null : Number(value))),
  currency: trimmed.length(3).toUpperCase().optional().default('USD'),
})

export type CreateCandidateInput = z.input<typeof createCandidateSchema>
export type CreateCandidateValues = z.output<typeof createCandidateSchema>

function emptyToNull(value: string | undefined): string | null {
  return value && value.length > 0 ? value : null
}
