"use client";

import { ArrowRight } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useCrm, type View } from "@/lib/crm/store";

function timeAgo(ts: number) {
  const d = Math.floor((Date.now() - ts) / 86400000);
  if (d <= 0) return "today";
  if (d === 1) return "1d ago";
  return d + "d ago";
}

const ROLE_LABELS = { admin: "Admin", recruiter: "Recruiter", coordinator: "Coordinator" };

export function DashboardView() {
  const { data, tenantId, role, setActiveView } = useCrm();
  const tenant = data[tenantId];

  const openJobs = tenant.jobs.filter((j) => j.status === "open").length;
  const draftOffers = tenant.offers.filter((o) => o.status === "draft").length;
  const upcomingInterviews = tenant.interviews.filter((i) => i.status === "upcoming").length;
  const stalled = tenant.candidates.filter((c) => c.stage === "screening").length;

  const needsAttention = [
    draftOffers > 0
      ? { id: "na1", text: `${draftOffers} draft offer${draftOffers > 1 ? "s" : ""} awaiting approval`, view: "offers" as View }
      : null,
    upcomingInterviews > 0
      ? { id: "na2", text: `${upcomingInterviews} interview${upcomingInterviews > 1 ? "s" : ""} scheduled this week`, view: "interviews" as View }
      : null,
    stalled > 0
      ? { id: "na3", text: `${stalled} candidate${stalled > 1 ? "s" : ""} stalled in Screening`, view: "kanban" as View }
      : null,
  ].filter((n): n is { id: string; text: string; view: View } => n !== null);

  const statCards = [
    { label: "Active candidates", value: tenant.candidates.length },
    { label: "Open jobs", value: openJobs },
    { label: "Interviews upcoming", value: upcomingInterviews },
    { label: "Draft offers", value: draftOffers },
  ];

  const activity = tenant.audit.slice(0, 6);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-2xl">Welcome back</h1>
        <p className="text-sm text-muted-foreground">
          {tenant.name} · signed in as {ROLE_LABELS[role]}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {statCards.map((s) => (
          <Card key={s.label}>
            <CardHeader>
              <CardDescription>{s.label}</CardDescription>
            </CardHeader>
            <CardContent className="font-heading text-3xl leading-none font-medium">
              {s.value}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Needs attention today</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            {needsAttention.length > 0 ? (
              needsAttention.map((n) => (
                <button
                  key={n.id}
                  className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-left text-sm hover:bg-accent"
                  onClick={() => setActiveView(n.view)}
                >
                  {n.text}
                  <ArrowRight className="size-3.5" />
                </button>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                All caught up — nothing needs attention.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {activity.map((a, i) => (
              <div key={i} className="flex items-start justify-between gap-3 text-sm">
                <span>
                  <strong className="font-medium">{a.actor}</strong> {a.action}{" "}
                  <span className="text-muted-foreground">on {a.entity}</span>
                </span>
                <span className="shrink-0 text-xs text-muted-foreground">{timeAgo(a.ts)}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
