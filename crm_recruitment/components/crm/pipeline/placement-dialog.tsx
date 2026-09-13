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

interface PlacementDialogProps {
  open: boolean;
  candidateName: string;
  jobTitle?: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (startDate: string, note?: string) => void;
}

export function PlacementDialog({
  open,
  candidateName,
  jobTitle,
  onOpenChange,
  onConfirm,
}: PlacementDialogProps) {
  const [startDate, setStartDate] = useState("");
  const [note, setNote] = useState("");

  const handleConfirm = () => {
    onConfirm(startDate || new Date().toISOString().split("T")[0], note.trim() || undefined);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirm Placement & Hire</DialogTitle>
          <DialogDescription>
            Place <span className="font-semibold text-foreground">{candidateName}</span>
            {jobTitle ? ` for ${jobTitle}` : ""}. This completes the candidate pipeline and records the milestone in audit logs.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Confirmed start date <span className="text-destructive">*</span>
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />

          <label className="mt-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Placement terms / notes (optional)
          </label>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="e.g. Contract signed, 20% placement fee agreed..."
            rows={3}
            className="flex w-full rounded-md border border-input bg-background p-2 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="default" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={handleConfirm}>
            Confirm Placement
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
