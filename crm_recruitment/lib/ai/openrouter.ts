import 'server-only'

import { createOpenRouter } from '@openrouter/ai-sdk-provider'

/**
 * OpenRouter client instance.
 * Automatically loads API key from process.env.OPENROUTER_API_KEY.
 */
export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || '',
})

/**
 * Retrieves the configured chat model for Astra.
 * Per AGENTS.md Rule 8, model id is NEVER hardcoded and is read from AI_MODEL_ID.
 * Free/low-cost default provided if env is not yet set.
 */
export function getAiModel() {
  const modelId = process.env.AI_MODEL_ID || 'google/gemini-2.5-flash'
  return openrouter(modelId)
}
