"use client";

import { Building } from "lucide-react";
import { OrganizationsTable } from "@/components/crm/organizations-table";

export function OrganizationsView() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="flex items-center gap-2.5">
          <Building className="size-6 text-primary" />
          <h1 className="font-heading text-2xl font-semibold">Organizations &amp; Plans</h1>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Complete registry of all organizations, their live subscription tiers, allocated seat capacity, and member roles.
        </p>
      </div>

      <OrganizationsTable />
    </div>
  );
}
