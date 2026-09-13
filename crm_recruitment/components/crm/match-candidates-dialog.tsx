"use client";

import { useState } from "react";
import { Sparkles, Loader2, UserCheck, AlertCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { matchCandidatesForJobAction } from "@/lib/actions/matching";
import type { MatchedCandidate } from "@/lib/services/matching";

type MatchCandidatesDialogProps = {
  jobId: string;
  jobTitle: string;
  clientName?: string;
  trigger?: React.ReactNode;
};

export function MatchCandidatesDialog({
  jobId,
  jobTitle,
  clientName,
  trigger,
}: MatchCandidatesDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<MatchedCandidate[]>([]);
  const [searched, setSearched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMatches = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await matchCandidatesForJobAction(jobId, { minSimilarity: 0.2, limit: 10 });
      if (res.status === "success") {
        setMatches(res.matches);
      } else {
        setError(res.message);
      }
    } catch {
      setError("Failed to fetch matches.");
    } finally {
      setLoading(false);
      setSearched(true);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (nextOpen && !searched) {
      fetchMatches();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger
        render={
          trigger ? (
            (trigger as React.ReactElement)
          ) : (
            <Button size="sm" variant="outline" className="gap-1.5 text-xs">
              <Sparkles className="size-3.5 text-amber-500" />
              Find Matches
            </Button>
          )
        }
      />

      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded-md bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <Sparkles className="size-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-heading">
                AI Semantic Matches — {jobTitle}
              </DialogTitle>
              <DialogDescription className="text-xs">
                {clientName ? `${clientName} • ` : ""}pgvector cosine similarity matching against agency talent pool
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto py-2 space-y-3">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
              <Loader2 className="size-6 animate-spin text-primary" />
              <p className="text-xs">Calculating vector cosine distances...</p>
            </div>
          ) : error ? (
            <div className="flex items-center gap-2 p-3 rounded-lg border border-destructive/20 bg-destructive/5 text-destructive text-sm">
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : matches.length === 0 && searched ? (
            <div className="py-12 text-center text-muted-foreground space-y-2">
              <UserCheck className="size-8 mx-auto opacity-40" />
              <p className="text-sm font-medium">No vector matches found yet</p>
              <p className="text-xs max-w-sm mx-auto">
                No candidates currently have embedding vectors or match the similarity threshold for this job profile.
              </p>
            </div>
          ) : (
            matches.map((m) => {
              const score = m.similarityPercentage;
              const badgeBg =
                score >= 80
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
                  : score >= 60
                  ? "bg-primary/10 text-primary border-primary/20"
                  : "bg-muted text-muted-foreground border-border";

              return (
                <div
                  key={m.candidateId}
                  className="flex items-start justify-between gap-3 p-3.5 rounded-lg border border-border bg-card hover:border-primary/30 transition-colors"
                >
                  <div className="flex items-start gap-3">
                    <Avatar className="size-9 mt-0.5">
                      <AvatarFallback className="text-xs font-semibold">
                        {m.candidate.fullName.slice(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-heading font-medium text-sm text-foreground">
                          {m.candidate.fullName}
                        </span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold border ${badgeBg}`}>
                          {score}% Match
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {m.candidate.currentTitle || "Professional"}
                        {m.candidate.location ? ` • ${m.candidate.location}` : ""}
                      </p>
                      {m.candidate.headline && (
                        <p className="text-xs text-foreground/80 line-clamp-1">
                          {m.candidate.headline}
                        </p>
                      )}
                      {m.candidate.skills && m.candidate.skills.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {m.candidate.skills.slice(0, 5).map((skill, idx) => (
                            <span
                              key={idx}
                              className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-secondary-foreground"
                            >
                              {skill}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
