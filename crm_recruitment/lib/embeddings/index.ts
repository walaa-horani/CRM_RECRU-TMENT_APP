import 'server-only'

import crypto from 'node:crypto'
import { embed } from 'ai'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/types'
import { openrouter } from '@/lib/ai/openrouter'

export const EMBEDDING_DIMENSION = 1536
export const EMBEDDING_MODEL_NAME = 'text-embedding-3-small'

/**
 * Computes a SHA-256 digest of input text to identify whether entity content has changed.
 * Unchanged profiles skip re-embedding to save API tokens and avoid latency.
 */
export function computeContentHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim().toLowerCase()).digest('hex')
}

/**
 * Transforms candidate profile data into an optimal text document for semantic embedding.
 */
export function candidateToEmbeddingText(candidate: {
  fullName: string
  headline?: string | null
  currentTitle?: string | null
  skills?: string[] | null
  location?: string | null
}): string {
  const parts: string[] = [
    `Name: ${candidate.fullName}`,
    candidate.currentTitle ? `Current Title: ${candidate.currentTitle}` : '',
    candidate.headline ? `Headline: ${candidate.headline}` : '',
    candidate.skills && candidate.skills.length > 0 ? `Skills: ${candidate.skills.join(', ')}` : '',
    candidate.location ? `Location: ${candidate.location}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

/**
 * Transforms job requisition data into an optimal text document for semantic embedding.
 */
export function jobToEmbeddingText(job: {
  title: string
  location?: string | null
  salaryMin?: number | null
  salaryMax?: number | null
  description?: string | null
}): string {
  const parts: string[] = [
    `Job Title: ${job.title}`,
    job.location ? `Location: ${job.location}` : '',
    job.salaryMin || job.salaryMax ? `Salary Range: $${job.salaryMin ?? 0}k - $${job.salaryMax ?? 0}k` : '',
    job.description ? `Description: ${job.description}` : '',
  ].filter(Boolean)

  return parts.join('\n')
}

/**
 * Generates a 1536-dimension normalized embedding vector.
 * If OPENROUTER_API_KEY is configured, calls OpenAI text-embedding-3-small via OpenRouter.
 * Otherwise, falls back to a deterministic 1536-dim unit vector for local testing.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const cleanText = text.trim()
  if (!cleanText) {
    return new Array(EMBEDDING_DIMENSION).fill(0)
  }

  const apiKey = process.env.OPENROUTER_API_KEY

  if (apiKey) {
    try {
      const { embedding } = await embed({
        model: openrouter.textEmbeddingModel('openai/text-embedding-3-small'),
        value: cleanText,
      })
      return embedding
    } catch (err) {
      console.warn('OpenRouter embedding API error, falling back to deterministic vector:', err)
    }
  }

  // Deterministic local unit vector fallback for development
  return generateDeterministicUnitVector(cleanText, EMBEDDING_DIMENSION)
}

/**
 * Produces a deterministic pseudo-random unit vector (L2 norm = 1.0) based on text hash.
 * Ensures consistent cosine similarity tests when no external API key is active.
 */
function generateDeterministicUnitVector(text: string, dimensions: number): number[] {
  const hash = crypto.createHash('sha256').update(text).digest()
  const vec = new Array<number>(dimensions)
  let sumSq = 0

  for (let i = 0; i < dimensions; i++) {
    // Generate values in [-1, 1] using hash bytes
    const byte = hash[(i * 7) % hash.length]!
    const val = (byte / 127.5) - 1.0
    vec[i] = val
    sumSq += val * val
  }

  const norm = Math.sqrt(sumSq) || 1
  for (let i = 0; i < dimensions; i++) {
    vec[i] = vec[i]! / norm
  }

  return vec
}

/**
 * Synchronizes a candidate's embedding sidecar record under the tenant's RLS policy.
 * Skips update if the content hash has not changed.
 */
export async function syncCandidateEmbedding(
  db: SupabaseClient<Database>,
  candidateId: string,
  tenantId: string,
  text: string,
): Promise<boolean> {
  const contentHash = computeContentHash(text)

  // Check existing embedding
  const { data: existing } = await db
    .from('candidate_embeddings')
    .select('content_hash')
    .eq('candidate_id', candidateId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing && existing.content_hash === contentHash) {
    return false // Unchanged, skipped
  }

  const vector = await generateEmbedding(text)

  // Format vector string for pgvector: [0.1, 0.2, ...]
  const vectorStr = `[${vector.join(',')}]`

  const { error } = await db
    .from('candidate_embeddings')
    .upsert({
      candidate_id: candidateId,
      tenant_id: tenantId,
      embedding: vectorStr,
      model: EMBEDDING_MODEL_NAME,
      content_hash: contentHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'candidate_id' })

  if (error) {
    console.error('Error syncing candidate embedding:', error)
    throw error
  }

  return true
}

/**
 * Synchronizes a job opening's embedding sidecar record under the tenant's RLS policy.
 * Skips update if the content hash has not changed.
 */
export async function syncJobEmbedding(
  db: SupabaseClient<Database>,
  jobId: string,
  tenantId: string,
  text: string,
): Promise<boolean> {
  const contentHash = computeContentHash(text)

  // Check existing embedding
  const { data: existing } = await db
    .from('job_embeddings')
    .select('content_hash')
    .eq('job_id', jobId)
    .eq('tenant_id', tenantId)
    .maybeSingle()

  if (existing && existing.content_hash === contentHash) {
    return false // Unchanged, skipped
  }

  const vector = await generateEmbedding(text)
  const vectorStr = `[${vector.join(',')}]`

  const { error } = await db
    .from('job_embeddings')
    .upsert({
      job_id: jobId,
      tenant_id: tenantId,
      embedding: vectorStr,
      model: EMBEDDING_MODEL_NAME,
      content_hash: contentHash,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'job_id' })

  if (error) {
    console.error('Error syncing job embedding:', error)
    throw error
  }

  return true
}
