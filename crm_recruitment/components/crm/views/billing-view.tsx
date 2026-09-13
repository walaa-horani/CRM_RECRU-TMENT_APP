"use client";

import { CreditCard, Sparkles } from "lucide-react";
import { PricingTable, Show } from "@clerk/nextjs";
import { SubscriptionDetailsButton } from "@clerk/nextjs/experimental";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useCrm } from "@/lib/crm/store";

import { OrganizationsTable } from "@/components/crm/organizations-table";

export function BillingView() {
  const { data, tenantId, role } = useCrm();
  const currentTenant = data[tenantId];
  const plan = currentTenant?.plan ?? "free";
  const isPro = plan === "pro";
  const isAdmin = role === "admin";

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-heading text-2xl font-semibold">Billing &amp; Subscription</h1>
            <Badge variant={isPro ? "default" : "secondary"} className="capitalize">
              {isPro && <Sparkles className="mr-1 size-3" />}
              {plan} plan
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {isAdmin
              ? "Signed in as Admin · Subscriptions and billing tiers are managed via Clerk Billing"
              : "Signed in as Recruiter · Subscription plans can only be managed by an Admin"}
          </p>
        </div>

        <Show when="signed-in">
          <div className="flex items-center gap-2">
            <SubscriptionDetailsButton for="organization">
              <Button variant="outline" size="sm" className="gap-2">
                <CreditCard className="size-4" />
                Subscription Details
              </Button>
            </SubscriptionDetailsButton>
          </div>
        </Show>
      </div>

      {/* Official Clerk Billing Pricing Table */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">Subscription Plans</h2>
        <div className="w-full overflow-hidden rounded-xl border border-border bg-card p-6 shadow-sm">
          <PricingTable for="organization" newSubscriptionRedirectUrl="/crm" />
        </div>
      </div>

      {/* Organizations Registry & Active Plans */}
      <div className="flex flex-col gap-3">
        <h2 className="font-heading text-lg font-medium">All Organizations &amp; Active Tiers</h2>
        <OrganizationsTable />
      </div>
    </div>
  );
}

