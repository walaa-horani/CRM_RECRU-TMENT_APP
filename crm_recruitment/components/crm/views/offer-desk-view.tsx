"use client";

import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCrm } from "@/lib/crm/store";
import { cn } from "@/lib/utils";

function fmtDate(ts: number | null) {
  return ts ? new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : "";
}

export function OfferDeskView() {
  const { data, tenantId, role, approveOffer } = useCrm();
  const offers = data[tenantId].offers;
  // Sort draft offers to top so pending approvals are immediately actionable
  const sortedOffers = [...offers].sort((a, b) => {
    if (a.status === "draft" && b.status !== "draft") return -1;
    if (a.status !== "draft" && b.status === "draft") return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl">Offer Desk</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {role === "admin"
              ? "Signed in as Admin · You have permission to approve financial offers"
              : "Signed in as Recruiter · Offers require Admin sign-off before extension"}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-3">
        {sortedOffers.map((o) => {
          const isApproved = o.status === "approved";
          return (
            <Card key={o.id}>
              <CardContent className="flex items-center justify-between gap-4 py-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{o.candidateName}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-medium",
                        isApproved
                          ? "bg-primary text-primary-foreground"
                          : "border border-border text-muted-foreground",
                      )}
                    >
                      {isApproved ? "Approved" : "Draft"}
                    </span>
                    {o.withinThreshold ? (
                      <span
                        className="rounded-full px-2 py-0.5 text-xs font-medium text-white"
                        style={{ backgroundColor: "oklch(0.58 0.14 152)" }}
                      >
                        Meets client threshold
                      </span>
                    ) : (
                      <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        Below client threshold
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {o.jobTitle} · {o.clientName} · ${o.salary}k offered (min ${o.thresholdMin}k)
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Created by {o.createdBy} on {fmtDate(o.createdAt)}
                    {isApproved && (
                      <> · Approved by {o.approvedBy} on {fmtDate(o.approvedAt)}</>
                    )}
                  </p>
                </div>
                {!isApproved && role === "admin" && (
                  <Button size="sm" onClick={() => approveOffer(o.id)}>
                    Approve
                  </Button>
                )}
                {!isApproved && role !== "admin" && (
                  <Button size="sm" variant="outline" disabled>
                    <Lock className="size-3" />
                    Admin only
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
