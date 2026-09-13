"use client";

import { useState, type DragEvent } from "react";
import { CheckCircle2, ShieldAlert } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { STAGES, type Stage } from "@/lib/crm/data";
import { useCrm } from "@/lib/crm/store";
import { cn } from "@/lib/utils";
import { WithdrawDialog } from "@/components/crm/pipeline/withdraw-dialog";
import { PlacementDialog } from "@/components/crm/pipeline/placement-dialog";
import { MatchCandidatesDialog } from "@/components/crm/match-candidates-dialog";
import type { RejectedReason } from "@/lib/validation/pipeline";

// Kanban uses its own labels: "Placed / Hired".
const KANBAN_LABELS: Record<Stage, string> = {
  source: "Source",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  placed: "Placed / Hired",
  withdrawn: "Withdrawn",
};

function headClass(stage: Stage) {
  if (stage === "withdrawn") {
    return "text-xs font-semibold uppercase tracking-wide text-muted-foreground";
  }
  if (stage === "placed") {
    return "text-xs font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400";
  }
  return "text-xs font-semibold uppercase tracking-wide text-foreground";
}

function checkStageTransition(from: Stage, to: Stage): { allowed: boolean; reason?: string } {
  if (from === to) return { allowed: true };

  if (from === "placed" || from === "withdrawn") {
    return {
      allowed: false,
      reason: `Candidates in terminal stage "${KANBAN_LABELS[from]}" are sealed and cannot be moved.`,
    };
  }

  if (to === "withdrawn") {
    return { allowed: true };
  }

  const expectedNext: Record<Stage, Stage | null> = {
    source: "screening",
    screening: "interviewing",
    interviewing: "offer",
    offer: "placed",
    placed: null,
    withdrawn: null,
  };

  if (expectedNext[from] === to) {
    return { allowed: true };
  }

  const stageOrder: Stage[] = ["source", "screening", "interviewing", "offer", "placed"];
  const fromIdx = stageOrder.indexOf(from);
  const toIdx = stageOrder.indexOf(to);

  if (fromIdx !== -1 && toIdx !== -1 && toIdx < fromIdx) {
    return {
      allowed: false,
      reason: `Backward moves (${KANBAN_LABELS[from]} → ${KANBAN_LABELS[to]}) are blocked. To disqualify or reject, move the card to Withdrawn.`,
    };
  }

  return {
    allowed: false,
    reason: `Cannot skip stages (${KANBAN_LABELS[from]} → ${KANBAN_LABELS[to]}). Follow the sequential pipeline steps.`,
  };
}

export function KanbanView() {
  const { data, tenantId, moveStage } = useCrm();
  const candidates = data[tenantId].candidates;

  const [draggedCandidateId, setDraggedCandidateId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<Stage | null>(null);
  const [notice, setNotice] = useState<{ type: "error" | "info"; message: string } | null>(null);

  // Dialog states
  const [withdrawTarget, setWithdrawTarget] = useState<{ id: string; name: string } | null>(null);
  const [placementTarget, setPlacementTarget] = useState<{ id: string; name: string; title?: string } | null>(null);

  const draggedCandidate = candidates.find((c) => c.id === draggedCandidateId);

  const onDragStart = (id: string) => (e: DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData("text/plain", id);
    setDraggedCandidateId(id);
    setNotice(null);
  };

  const onDragOver = (stage: Stage) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (dragOverStage !== stage) {
      setDragOverStage(stage);
    }
  };

  const onDragLeave = (stage: Stage) => () => {
    if (dragOverStage === stage) {
      setDragOverStage(null);
    }
  };

  const onDrop = (targetStage: Stage) => (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOverStage(null);
    const id = e.dataTransfer.getData("text/plain") || draggedCandidateId;
    setDraggedCandidateId(null);

    if (!id) return;

    const candidate = candidates.find((c) => c.id === id);
    if (!candidate) return;

    const validation = checkStageTransition(candidate.stage, targetStage);

    if (!validation.allowed) {
      setNotice({
        type: "error",
        message: validation.reason || "Illegal stage transition.",
      });
      return;
    }

    if (candidate.stage === targetStage) {
      return; // No-op
    }

    // Intercept with dialogs for sensitive transitions
    if (targetStage === "withdrawn") {
      setWithdrawTarget({ id: candidate.id, name: candidate.name });
      return;
    }

    if (targetStage === "placed") {
      setPlacementTarget({ id: candidate.id, name: candidate.name, title: candidate.title });
      return;
    }

    // Standard forward progression
    moveStage(id, targetStage);
    setNotice({
      type: "info",
      message: `Moved ${candidate.name} to ${KANBAN_LABELS[targetStage]}.`,
    });
  };

  const handleConfirmWithdraw = (reason: RejectedReason, note?: string) => {
    if (!withdrawTarget) return;
    moveStage(withdrawTarget.id, "withdrawn", reason, note);
    setNotice({
      type: "info",
      message: `Candidate ${withdrawTarget.name} withdrawn (${reason}${note ? `: ${note}` : ""}) and logged to audit trail.`,
    });
    setWithdrawTarget(null);
  };

  const handleConfirmPlacement = (startDate: string, note?: string) => {
    if (!placementTarget) return;
    moveStage(
      placementTarget.id,
      "placed",
      undefined,
      note ? `Start date: ${startDate}. ${note}` : `Start date: ${startDate}`,
    );
    setNotice({
      type: "info",
      message: `Placement confirmed for ${placementTarget.name} (Start: ${startDate}${note ? `, ${note}` : ""})! Recorded in billing ledger.`,
    });
    setPlacementTarget(null);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-heading text-2xl font-semibold">Candidate Pipeline</h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Strict state machine enforcement with audit logging & optimistic concurrency control
          </p>
        </div>

        <div className="flex items-center gap-2">
          {data[tenantId]?.jobs?.find((j) => j.status === "open") && (
            <MatchCandidatesDialog
              jobId={data[tenantId].jobs.find((j) => j.status === "open")!.id}
              jobTitle={data[tenantId].jobs.find((j) => j.status === "open")!.title}
              clientName={data[tenantId].jobs.find((j) => j.status === "open")!.clientName}
            />
          )}

          {draggedCandidate && (
            <div className="flex items-center gap-2 rounded-md bg-muted/80 px-3 py-1 text-xs text-muted-foreground">
              <span>Dragging: <strong className="text-foreground">{draggedCandidate.name}</strong></span>
              <span className="text-[10px] uppercase font-mono bg-background px-1.5 py-0.5 rounded border">
                Current: {KANBAN_LABELS[draggedCandidate.stage]}
              </span>
            </div>
          )}
        </div>
      </div>

      {notice && (
        <div
          className={cn(
            "flex items-center justify-between rounded-lg border px-4 py-2.5 text-sm shadow-sm transition-all",
            notice.type === "error"
              ? "border-destructive/30 bg-destructive/10 text-destructive dark:border-destructive/40"
              : "border-primary/20 bg-primary/5 text-foreground",
          )}
        >
          <div className="flex items-center gap-2">
            {notice.type === "error" ? (
              <ShieldAlert className="size-4 shrink-0 text-destructive" />
            ) : (
              <CheckCircle2 className="size-4 shrink-0 text-primary" />
            )}
            <span>{notice.message}</span>
          </div>
          <button
            onClick={() => setNotice(null)}
            className="text-xs font-semibold uppercase opacity-70 hover:opacity-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <div className="flex gap-3 overflow-x-auto pb-4 pt-1">
        {STAGES.map((stage) => {
          const items = candidates.filter((c) => c.stage === stage);
          const isOver = dragOverStage === stage;
          const isValidTarget = draggedCandidate
            ? checkStageTransition(draggedCandidate.stage, stage).allowed
            : false;

          return (
            <div
              key={stage}
              className={cn(
                "flex w-72 shrink-0 flex-col gap-2 rounded-xl border border-border/50 bg-muted/30 p-2.5 transition-all",
                isOver && isValidTarget && "border-primary ring-2 ring-primary/20 bg-primary/5",
                isOver && !isValidTarget && "border-destructive ring-2 ring-destructive/20 bg-destructive/5",
              )}
              onDragOver={onDragOver(stage)}
              onDragLeave={onDragLeave(stage)}
              onDrop={onDrop(stage)}
            >
              <div className="flex items-center justify-between px-1.5 py-1">
                <div className="flex items-center gap-2">
                  <span className={headClass(stage)}>{KANBAN_LABELS[stage]}</span>
                  {stage === "placed" && (
                    <span className="rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
                      Won
                    </span>
                  )}
                  {stage === "withdrawn" && (
                    <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      Exit
                    </span>
                  )}
                </div>
                <span className="flex size-5 items-center justify-center rounded-full bg-background text-xs font-medium text-muted-foreground shadow-xs">
                  {items.length}
                </span>
              </div>

              <div className="flex min-h-[140px] flex-col gap-2.5">
                {items.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={onDragStart(c.id)}
                    className={cn(
                      "group relative cursor-grab rounded-lg border border-border/70 bg-card p-3 text-sm shadow-xs transition-all duration-150",
                      "hover:border-primary/40 hover:shadow-md active:cursor-grabbing",
                      draggedCandidateId === c.id && "opacity-40",
                    )}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="size-6 shrink-0">
                          <AvatarFallback className="text-[10px] font-semibold bg-primary/10 text-primary">
                            {c.initials}
                          </AvatarFallback>
                        </Avatar>
                        <span className="truncate font-medium text-foreground">{c.name}</span>
                      </div>
                    </div>

                    <p className="mt-1.5 truncate text-xs text-muted-foreground">{c.title}</p>

                    <div className="mt-2.5 flex items-center justify-between border-t border-border/40 pt-2 text-[11px] text-muted-foreground">
                      <span className="truncate max-w-[140px]">{c.jobTitle || c.clientName}</span>
                      {c.tags[0] && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          {c.tags[0]}
                        </span>
                      )}
                    </div>
                  </div>
                ))}

                {items.length === 0 && (
                  <div className="flex h-28 items-center justify-center rounded-lg border border-dashed border-border/60 p-4 text-center">
                    <span className="text-xs text-muted-foreground/70">
                      {isOver && isValidTarget ? "Drop to advance" : "No candidates"}
                    </span>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Confirmation Dialogs */}
      {withdrawTarget && (
        <WithdrawDialog
          open={!!withdrawTarget}
          candidateName={withdrawTarget.name}
          onOpenChange={(open) => !open && setWithdrawTarget(null)}
          onConfirm={handleConfirmWithdraw}
        />
      )}

      {placementTarget && (
        <PlacementDialog
          open={!!placementTarget}
          candidateName={placementTarget.name}
          jobTitle={placementTarget.title}
          onOpenChange={(open) => !open && setPlacementTarget(null)}
          onConfirm={handleConfirmPlacement}
        />
      )}
    </div>
  );
}
