# AGENTS.md — Recruitment CRM (B2B SaaS)

## Project Overview
A multi-tenant recruitment agency CRM. Each **tenant** is one recruitment agency (a Clerk organization). Recruiters inside a tenant manage candidates, client companies (employers), job openings, and move candidates through a hiring pipeline (Kanban).

## Tech Stack
- Next.js 16 (App Router), React 19, TypeScript
- Tailwind CSS + Shadcn UI
- pnpm
- **Supabase (Postgres + pgvector)** — source of truth for all operational CRM data
- **Clerk** — multi-tenant auth, organizations, seats, billing (Pro plan, includes the AI Agent add-on)
- **Clerk Webhooks** — sync org/user/membership state from Clerk into Supabase
- **Vercel AI SDK (`streamText`) + OpenRouter (`@openrouter/ai-sdk-provider`)** — AI Copilot ("Astra"); model id is never hardcoded — see rule 8 below
- **pgvector** — used for two things: candidate ⇄ job semantic matching, and Astra's context retrieval
- Zod (validation), Vitest (unit tests), Playwright (integration tests)

## Non-Negotiable Rules
1. **Tenant isolation is mandatory.** Every table holding tenant data has a `tenant_id` column and a Row Level Security policy that filters by it. No user-facing code path may bypass RLS with the service role key.
2. **Never trust the client for tenant identity.** The tenant/org id always comes from the authenticated Clerk session on the server — never from a request body, query param, or client-side state.
3. **All mutations go through Zod schemas.** No unvalidated `request.json()` reaches the database layer.
4. **Clerk is the source of truth for identity. Supabase is the source of truth for CRM data.** Webhooks keep them in sync. Never write org/user state directly into Supabase outside the webhook flow — that causes drift.
5. **Vector search always filters by tenant first, then by similarity.** A candidate from Agency A must never appear in Agency B's matches, regardless of similarity score.
6. **Audit-sensitive actions are always logged**, at minimum: candidate stage changes, offer creation/edits, client/job creation, and team permission changes.
7. **Billing and seat logic is never enforced only in the UI.** Any seat-limited or plan-gated action is also checked server-side.
8. **The OpenRouter model id is never hardcoded.** It's read from an env var (`AI_MODEL_ID`). OpenRouter's free-tier lineup rotates over time — at setup, look up the currently available free models that explicitly support function calling (check openrouter.ai/models, filter by Free + Tools) instead of reusing a name from an older guide, since free models get deprecated or repriced without notice. Use a free, tool-calling-capable model for development; swap to a paid model (e.g. a low-cost Gemini Flash tier) for production by changing only the env var.

## Conventions
- The service layer (`/lib/services`) has no HTTP awareness — no `NextRequest` / `NextResponse` inside it.
- Flow: API route / Server Action validates input → calls a service function → returns a typed response.
- Embeddings are generated through a single shared module (`/lib/embeddings`) — never inline inside individual routes — so the model/version stays consistent across the app.