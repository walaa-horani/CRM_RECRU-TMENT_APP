"use client";

import {
  Building,
  Building2,
  CalendarClock,
  ChevronDown,
  CreditCard,
  FileSignature,
  Kanban,
  LayoutDashboard,
  Moon,
  Sparkles,
  Sun,
  UserCog,
  Users,
} from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AstraDrawer } from "@/components/crm/astra-drawer";
import { BillingView } from "@/components/crm/views/billing-view";
import { ClientLedgerView } from "@/components/crm/views/client-ledger-view";
import { DashboardView } from "@/components/crm/views/dashboard-view";
import { InterviewSchedulerView } from "@/components/crm/views/interview-scheduler-view";
import { KanbanView } from "@/components/crm/views/kanban-view";
import { OfferDeskView } from "@/components/crm/views/offer-desk-view";
import { OrganizationsView } from "@/components/crm/views/organizations-view";
import { TalentPoolView } from "@/components/crm/views/talent-pool-view";
import { TeamSettingsView } from "@/components/crm/views/team-settings-view";
import { Badge } from "@/components/ui/badge";
import { useCrm, type View } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { view: View; label: string; icon: typeof LayoutDashboard }[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "talent", label: "Talent Pool", icon: Users },
  { view: "clients", label: "Client Ledger", icon: Building2 },
  { view: "kanban", label: "Pipeline", icon: Kanban },
  { view: "interviews", label: "Interviews", icon: CalendarClock },
  { view: "offers", label: "Offer Desk", icon: FileSignature },
  { view: "team", label: "Team & Settings", icon: UserCog },
  { view: "organizations", label: "Organizations", icon: Building },
  { view: "billing", label: "Billing", icon: CreditCard },
];

function navCls(active: boolean) {
  return cn(
    "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
    active
      ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60",
  );
}

export function CrmAppShell() {
  const {
    theme, tenantId, role, activeView, astraOpen, data,
    toggleTheme, setTenantId, setActiveView, toggleAstra,
  } = useCrm();

  const currentTenant = data[tenantId];
  const currentUser = currentTenant.team.find((t) => t.role === role) ?? currentTenant.team[0];
  const isFree = currentTenant.plan === "free";

  return (
    <div className={cn(theme === "dark" && "dark")}>
      {/* h-16 = the Clerk auth header height in app/layout.tsx's root layout. */}
      <div className="flex h-[calc(100vh-4rem)] w-full overflow-hidden bg-background text-foreground">
        <aside className="flex w-60 shrink-0 flex-col gap-0.5 border-r border-sidebar-border bg-sidebar p-3 text-sidebar-foreground">
          <div className="mb-3 flex items-center gap-2 px-2 py-2">
            <div className="flex size-8 items-center justify-center rounded-lg bg-primary font-heading text-sm font-semibold text-primary-foreground">
              H
            </div>
            <span className="font-heading text-lg">Hearth CRM</span>
          </div>

          {NAV_ITEMS.map(({ view, label, icon: Icon }) => (
            <button key={view} className={navCls(activeView === view)} onClick={() => setActiveView(view)}>
              <Icon className="size-4" />
              {label}
            </button>
          ))}

          <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-2">
            <button
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
              onClick={toggleAstra}
            >
              <Sparkles className="size-4" />
              Astra Copilot
              {isFree && (
                <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  PRO
                </span>
              )}
            </button>
            <button
              className="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-sidebar-foreground/70 hover:bg-sidebar-accent"
              onClick={toggleTheme}
            >
              {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
              {theme === "dark" ? "Light mode" : "Dark mode"}
            </button>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="flex items-center justify-between gap-4 border-b border-border bg-card px-6 py-2.5">
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                  <Building className="size-3.5" />
                  {currentTenant.name}
                  <ChevronDown className="size-3.5" />
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  {Object.values(data).map((t) => (
                    <DropdownMenuItem key={t.id} onClick={() => setTenantId(t.id)}>
                      {t.name}
                      <span className="ml-auto text-xs text-muted-foreground">
                        {t.plan === "pro" ? "Pro" : "Free"}
                      </span>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              <Badge variant="outline" className="ml-2 capitalize text-xs font-medium text-muted-foreground">
                {role}
              </Badge>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className={cn(
                    "inline-block size-1.5 rounded-full",
                    currentTenant.plan === "pro" ? "bg-primary" : "bg-muted-foreground",
                  )}
                />
                {currentTenant.plan === "pro" ? "Pro" : "Free"} plan
              </div>
              <Button variant="outline" size="sm" onClick={toggleAstra}>
                <Sparkles className="size-3.5" />
                Ask Astra
              </Button>
              <Avatar className="size-8">
                <AvatarFallback className="text-xs">{currentUser?.initials}</AvatarFallback>
              </Avatar>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6">
            {activeView === "dashboard" && <DashboardView />}
            {activeView === "talent" && <TalentPoolView />}
            {activeView === "clients" && <ClientLedgerView />}
            {activeView === "kanban" && <KanbanView />}
            {activeView === "interviews" && <InterviewSchedulerView />}
            {activeView === "offers" && <OfferDeskView />}
            {activeView === "team" && <TeamSettingsView />}
            {activeView === "organizations" && <OrganizationsView />}
            {activeView === "billing" && <BillingView />}
          </main>
        </div>

        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/30 transition-opacity",
            astraOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={toggleAstra}
        />
        <div
          className={cn(
            "fixed top-0 right-0 z-50 h-full w-[380px] border-l border-border bg-card shadow-2xl transition-transform duration-300",
            astraOpen ? "translate-x-0" : "translate-x-full",
          )}
        >
          <AstraDrawer />
        </div>
      </div>
    </div>
  );
}
