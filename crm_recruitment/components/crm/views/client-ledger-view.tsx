"use client";

import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { STAGE_LABELS, type Stage } from "@/lib/crm/data";
import { useCrm } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

export function ClientLedgerView() {
  const { data, tenantId } = useCrm();
  const clients = data[tenantId].clients;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selId = selectedId ?? clients[0]?.id;
  const selected = clients.find((c) => c.id === selId) ?? clients[0];

  return (
    <div className="flex flex-col gap-4">
      <h1 className="font-heading text-2xl">Client Ledger</h1>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[280px_1fr]">
        <div className="flex flex-col gap-2">
          {clients.map((c) => (
            <button
              key={c.id}
              className={cn(
                "rounded-md border px-3 py-2 text-left transition-colors",
                c.id === selId ? "border-primary bg-primary/5" : "border-border hover:bg-accent",
              )}
              onClick={() => setSelectedId(c.id)}
            >
              <div className="flex items-center justify-between">
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-muted-foreground">{c.openJobs} open</span>
              </div>
              <p className="text-xs text-muted-foreground">{c.industry}</p>
            </button>
          ))}
        </div>

        {selected && (
          <Card>
            <CardHeader>
              <CardTitle>{selected.name}</CardTitle>
              <CardDescription>
                {selected.industry} · {selected.openJobs} open jobs · primary contact{" "}
                {selected.contact}
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-6">
              {/* Active Pipeline Candidates Section (Single Source of Truth: applications.stage_kind) */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    Active Candidates in Pipeline
                  </p>
                  <span className="text-xs text-muted-foreground">
                    {selected.candidates?.length ?? 0} {selected.candidates?.length === 1 ? "candidate" : "candidates"}
                  </span>
                </div>

                {!selected.candidates || selected.candidates.length === 0 ? (
                  <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                    No active candidates in pipeline for this client.
                  </div>
                ) : (
                  <div className="flex flex-col divide-y rounded-md border border-border">
                    {selected.candidates.map((c) => (
                      <div key={c.id} className="flex items-center justify-between p-3 text-sm">
                        <div className="flex items-center gap-2.5">
                          <span className="flex size-7 items-center justify-center rounded-full bg-primary/10 text-xs font-medium text-primary">
                            {c.initials}
                          </span>
                          <div>
                            <p className="font-medium leading-none">{c.candidateName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{c.jobTitle}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-3">
                          <span className="text-xs text-muted-foreground hidden sm:inline">
                            Applied {formatDate(c.appliedDate)}
                          </span>
                          {c.stage === "placed" ? (
                            <span
                              className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                              style={{ backgroundColor: "oklch(0.58 0.14 152)" }}
                            >
                              {STAGE_LABELS.placed}
                            </span>
                          ) : (
                            <span className={badgeClass(c.stage)}>{STAGE_LABELS[c.stage]}</span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Audit Trail Section */}
              <div>
                <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                  Audit trail
                </p>
                <div className="flex flex-col gap-2.5">
                  {selected.activity.map((a, i) => (
                    <div key={i} className="flex items-center justify-between text-sm">
                      <span>
                        <strong className="font-medium">{a.actor}</strong> — {a.action}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(a.ts)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function badgeClass(stage: Stage) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ";
  if (stage === "placed") return base + "text-white";
  if (stage === "offer") return base + "bg-primary text-primary-foreground";
  if (stage === "interviewing") return base + "bg-secondary text-secondary-foreground";
  if (stage === "withdrawn") return base + "bg-muted text-muted-foreground";
  return base + "border border-border text-foreground";
}

// Absolute and UTC-pinned: Date.now() during render is impure and drifts
// between the server render and hydration.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

function formatDate(ts: number) {
  return DATE_FORMAT.format(new Date(ts));
}
