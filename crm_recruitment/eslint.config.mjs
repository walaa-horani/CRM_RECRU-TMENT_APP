import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "ds-bundle/**",
    ".design-sync/**",
    ".ds-sync/**",
  ]),

  // ---------------------------------------------------------------------------
  // Tenant isolation guard.
  //
  // lib/supabase/admin.ts holds the service role key and bypasses row level
  // security entirely. Project rule 1: it must never appear in a user-facing
  // request path. This makes that a lint failure rather than something caught in
  // review, or not at all.
  //
  // If this rule fires, the fix is almost always to use
  // createServerSupabaseClient from lib/supabase/server.ts instead. Widening the
  // allowlist below is a decision about tenant isolation -- treat it as one.
  // ---------------------------------------------------------------------------
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    ignores: [
      "app/api/webhooks/**", // Clerk is the sole writer of tenants/memberships
      "lib/supabase/admin.ts", // the module itself
      "scripts/**", // background jobs that legitimately cross tenants
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/lib/supabase/admin",
                "@/lib/supabase/admin",
                "./admin",
                "../admin",
              ],
              message:
                "The service-role Supabase client bypasses RLS and is banned outside app/api/webhooks/** and scripts/**. Use createServerSupabaseClient from @/lib/supabase/server so queries run under the caller's tenant.",
            },
          ],
        },
      ],
    },
  },
]);

export default eslintConfig;
