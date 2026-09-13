"use client";

import { Card, CardContent } from "@/components/ui/card";
import { STAGE_LABELS, type Stage } from "@/lib/crm/data";
import { useCrm } from "@/lib/crm/store";

function badgeClass(stage: Stage) {
  const base = "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ";
  if (stage === "placed") return base + "text-white";
  if (stage === "offer") return base + "bg-primary text-primary-foreground";
  if (stage === "interviewing") return base + "bg-secondary text-secondary-foreground";
  if (stage === "withdrawn") return base + "bg-muted text-muted-foreground";
  return base + "border border-border text-foreground";
}

function fmt(ts: number, tz: string) {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

export function InterviewSchedulerView() {
  const { data, tenantId } = useCrm();
  const tenant = data[tenantId];
  const interviews = tenant.interviews;
  const candidates = tenant.candidates;

  // Single Source of Truth: All candidates whose application is currently at 'interviewing' stage
  const interviewingCandidates = candidates.filter((c) => c.stage === "interviewing");

  const upcoming = interviews
    .filter((i) => i.status === "upcoming")
    .sort((a, b) => a.date - b.date);
  const completed = interviews
    .filter((i) => i.status === "completed")
    .sort((a, b) => b.date - a.date);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Interview Scheduler</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage live interview panels, candidate scheduling, and panel evaluations
          </p>
        </div>
        <span className="rounded-full bg-secondary/80 px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          {interviewingCandidates.length} {interviewingCandidates.length === 1 ? "candidate" : "candidates"} in Interviewing
        </span>
      </div>

      {/* 1. Active Candidates in Interviewing Stage (Single Source of Truth) */}
      <div>
        <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase flex items-center justify-between">
          <span>Active in Interviewing Pipeline ({interviewingCandidates.length})</span>
        </h2>
        {interviewingCandidates.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No candidates currently in the Interviewing stage. Drag candidates to Interviewing on the Kanban board to queue them here.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {interviewingCandidates.map((c) => {
              const matchedInterview = upcoming.find(
                (iv) =>
                  iv.candidateId === c.candidateId ||
                  iv.candidateId === c.id ||
                  iv.applicationId === c.applicationId ||
                  iv.applicationId === c.id ||
                  iv.candidateName === c.name,
              );

              return (
                <Card key={c.id} className="border-border">
                  <CardContent className="p-3.5 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                        {c.initials}
                      </span>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-sm leading-none">{c.name}</p>
                          <span className={badgeClass("interviewing")}>
                            {STAGE_LABELS.interviewing}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {c.jobTitle} • <span className="font-normal">{c.clientName}</span>
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      {matchedInterview ? (
                        <span className="inline-flex items-center rounded bg-muted px-2 py-0.5 text-[11px] font-medium text-foreground">
                          Scheduled: {fmt(matchedInterview.date, matchedInterview.timezone)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded bg-amber-500/10 px-2 py-0.5 text-[11px] font-medium text-amber-600 dark:text-amber-400">
                          Awaiting Schedule
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Upcoming Interviews */}
      <div>
        <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Upcoming Scheduled Panels ({upcoming.length})
        </h2>
        {upcoming.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No upcoming interviews scheduled.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {upcoming.map((i) => (
              <Card key={i.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {i.candidateName}{" "}
                        <span className="font-normal text-muted-foreground">
                          — {i.jobTitle}, {i.clientName}
                        </span>
                      </p>
                      {i.stage ? (
                        i.stage === "placed" ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: "oklch(0.58 0.14 152)" }}
                          >
                            {STAGE_LABELS.placed}
                          </span>
                        ) : (
                          <span className={badgeClass(i.stage)}>{STAGE_LABELS[i.stage]}</span>
                        )
                      ) : null}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">Panel: {i.panel.join(", ")}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">{fmt(i.date, i.timezone)}</p>
                    <p className="text-xs text-muted-foreground">{i.timezone}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* 3. Completed Interviews */}
      <div>
        <h2 className="mb-2.5 text-sm font-semibold tracking-wide text-muted-foreground uppercase">
          Completed — Panel Feedback ({completed.length})
        </h2>
        {completed.length === 0 ? (
          <div className="rounded-md border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
            No completed interviews yet.
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {completed.map((i) => (
              <Card key={i.id}>
                <CardContent className="py-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">
                        {i.candidateName}{" "}
                        <span className="font-normal text-muted-foreground">— {i.jobTitle}</span>
                      </p>
                      {i.stage ? (
                        i.stage === "placed" ? (
                          <span
                            className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                            style={{ backgroundColor: "oklch(0.58 0.14 152)" }}
                          >
                            {STAGE_LABELS.placed}
                          </span>
                        ) : (
                          <span className={badgeClass(i.stage)}>{STAGE_LABELS[i.stage]}</span>
                        )
                      ) : null}
                    </div>
                    <span className="rounded-full border border-border px-2 py-0.5 text-xs">
                      {i.feedback?.rating}/5
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{i.feedback?.summary}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    — {i.feedback?.by}, {fmt(i.date, i.timezone)}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
