import 'server-only'

import {
  streamText,
  isStepCount,
  createUIMessageStreamResponse,
  convertToModelMessages,
  type UIMessageChunk,
} from 'ai'
import { resolveTenant } from '@/lib/auth/tenant'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getAiModel } from '@/lib/ai/openrouter'
import { createAstraTools } from '@/lib/ai/tools'

export const dynamic = 'force-dynamic'

export async function POST(req: Request) {
  // 1. Authenticate user & resolve active tenant organization
  const resolution = await resolveTenant()
  if (resolution.status !== 'ok') {
    return new Response(JSON.stringify({ error: 'Unauthorized: Active organization session required' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { tenantId, userId, role } = resolution.context
  const supabase = createServerSupabaseClient()

  // 2. Enforce Pro Plan Gating (SKILLS.md & AGENTS.md)
  const { data: tenant } = await supabase
    .from('tenants')
    .select('plan')
    .eq('id', tenantId)
    .maybeSingle()

  if (tenant?.plan !== 'pro') {
    return new Response(
      JSON.stringify({
        error: 'Astra AI Copilot is available on the Pro plan only. Please upgrade your agency to unlock AI features.',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } },
    )
  }

  const body = await req.json()
  const { messages } = body

  // 3. Graceful fallback if OPENROUTER_API_KEY is not yet configured
  if (!process.env.OPENROUTER_API_KEY) {
    const stream = new ReadableStream<UIMessageChunk>({
      start(controller) {
        const id = 'msg-dev-notice'
        controller.enqueue({ type: 'text-start', id })
        controller.enqueue({
          type: 'text-delta',
          id,
          delta:
            "👋 **Hello from Astra!**\n\nI am your recruitment AI Copilot, ready to:\n- **Match Candidates** with open jobs using pgvector\n- **Search Candidates** semantically by skills & background\n- **Summarize Interview Feedback** & candidate ratings\n- **Draft Client Introduction Emails**\n\nTo enable live OpenRouter completions, please add your `OPENROUTER_API_KEY` to `.env.local`.",
        })
        controller.enqueue({ type: 'text-end', id })
        controller.close()
      },
    })
    return createUIMessageStreamResponse({ stream })
  }

  // 4. Stream response with tools injected under tenant isolation
  try {
    const modelMessages = await convertToModelMessages(messages)

    const result = streamText({
      model: getAiModel(),
      system: `You are Astra, the intelligent recruitment AI Copilot for this recruitment agency.
You assist recruiters with:
- Suggesting matched candidates for open job requisitions (using suggestMatchedCandidates tool)
- Searching the talent pool semantically by skills, technologies, and experience (using searchCandidates tool)
- Summarizing panel interview notes and ratings (using summarizeInterviews tool)
- Drafting client emails and candidate introductions (using draftClientEmail tool)

Guidelines:
- Be concise, structured, and recruiter-focused. Use Markdown formatting (bolding, lists).
- When matching candidates, highlight their similarity percentage and relevant skills.
- The tenant ID is already locked on the server; you never need to ask the user for a tenant ID.`,
      messages: modelMessages,
      tools: createAstraTools(supabase, tenantId),
      maxOutputTokens: 2048,
      stopWhen: isStepCount(5),
    })

    return result.toUIMessageStreamResponse()
  } catch (err: unknown) {
    console.error('Astra chat streaming error:', err)
    const errMessage = err instanceof Error ? err.message : 'Unknown AI error'
    return new Response(JSON.stringify({ error: errMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}
