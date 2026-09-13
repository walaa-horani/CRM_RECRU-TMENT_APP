"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REJECTED_REASONS, type RejectedReason } from "@/lib/validation/pipeline";

interface WithdrawDialogProps {
  open: boolean;
  candidateName: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: (reason: RejectedReason, note?: string) => void;
}

const REASON_LABELS: Record<RejectedReason, string> = {
  salary_mismatch: "Salary expectation mismatch",
  culture_fit: "Not a culture/values fit",
  failed_technical: "Failed technical / competency screen",
  client_rejected: "Client rejected after review",
  candidate_declined: "Candidate withdrew application",
  candidate_ghosted: "Candidate unresponsive / ghosted",
  counter_offer_accepted: "Accepted counter-offer from current employer",
  other: "Other reason",
};

export function WithdrawDialog({
  open,
  candidateName,
  onOpenChange,
  onConfirm,
}: WithdrawDialogProps) {
  const [reason, setReason] = useState<RejectedReason>("client_rejected");
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(reason, note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Withdraw Candidate</DialogTitle>
          <DialogDescription>
            Move <span className="font-semibold text-foreground">{candidateName}</span> to Withdrawn. This closes active pipeline progression and logs the decision to the agency audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Reason for withdrawal <span className="text-destructive">*</span>
          </label>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as RejectedReason)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {REJECTED_REASONS.map((r) => (
              <option key={r} value={r}>
                {REASON_LABELS[r]}
              </option>
            ))}
          </select>

          <label className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Notes / context (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Add specific client feedback or interview notes..."
            rows={3}
            className="flex w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={handleConfirm}>
            Confirm Withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
