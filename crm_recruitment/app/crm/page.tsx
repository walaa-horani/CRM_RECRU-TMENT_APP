import { CrmAppShell } from "@/components/crm/app-shell";
import { requireTenant } from "@/lib/auth/tenant";
import { CrmProvider } from "@/lib/crm/store";
import { listCandidates } from "@/lib/services/candidates";
import { loadTenantCrmData } from "@/lib/services/crm-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listCandidatesSchema } from "@/lib/validation/candidates";

/**
 * The CRM shell.
 *
 * All core CRM data (candidates, pipeline, jobs, clients, interviews, offers)
 * is now loaded directly from Supabase under RLS for the authenticated tenant.
 */
export default async function CrmPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ tenantId, userId, role }, params] = await Promise.all([
    requireTenant(),
    searchParams,
  ]);

  // Query strings are user input like any other, so they go through the same
  // schema the action does. A malformed one falls back to the defaults instead
  // of throwing a 500 at someone who edited the URL.
  const parsed = listCandidatesSchema.safeParse({
    q: first(params.q),
    stage: first(params.stage),
    limit: first(params.limit),
    offset: first(params.offset),
  });

  const query = parsed.success
    ? parsed.data
    : listCandidatesSchema.parse({});

  const supabase = createServerSupabaseClient();
  const [candidates, initialTenantData] = await Promise.all([
    listCandidates(supabase, tenantId, query),
    loadTenantCrmData(supabase, tenantId),
  ]);

  return (
    <CrmProvider
      identity={{ tenantId, userId, role }}
      candidates={candidates.items}
      candidateTotal={candidates.total}
      candidateQuery={{ q: query.q ?? "", stage: query.stage ?? null }}
      initialTenantData={initialTenantData}
    >
      <CrmAppShell />
    </CrmProvider>
  );
}

function first(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "" ? undefined : raw;
}
