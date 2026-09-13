"use client";

import { FileText, Search } from "lucide-react";

import { NewCandidateDialog } from "@/components/crm/new-candidate-dialog";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

/**
 * The first view backed by real data: these rows come from Supabase, fetched in
 * app/crm/page.tsx under RLS and passed down. Nothing here knows the tenant id
 * or could send one.
 *
 * Coordinators can add candidates (the RLS policy allows all three roles), so
 * the dialog is enabled for everyone; the seat, plan and role checks that do
 * gate this all run server-side in the action.
 */
export function TalentPoolView() {
  const { candidates, candidateTotal, candidateQuery } = useCrm();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl">Talent Pool</h1>
          <p className="text-xs text-muted-foreground">
            {candidateTotal} {candidateTotal === 1 ? "candidate" : "candidates"} in your agency
          </p>
        </div>
        <div className="flex items-center gap-2">
          {/* A plain GET form: the search term round-trips through the URL and
              is re-validated by the same schema the action uses. */}
          <form method="get" action="/crm" className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                name="q"
                defaultValue={candidateQuery.q}
                placeholder="Search name or email"
                className="h-8 w-56 pl-7"
              />
            </div>
            <Button type="submit" size="sm" variant="outline">
              Search
            </Button>
          </form>
          <NewCandidateDialog canWrite />
        </div>
      </div>

      <Card className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Candidate</TableHead>
              <TableHead>Applying for</TableHead>
              <TableHead>Stage</TableHead>
              <TableHead>Skills</TableHead>
              <TableHead>Added</TableHead>
              <TableHead>Resume</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {candidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-10 text-center text-sm text-muted-foreground">
                  {candidateQuery.q
                    ? `No candidates match “${candidateQuery.q}”.`
                    : "No candidates yet. Add the first one."}
                </TableCell>
              </TableRow>
            ) : (
              candidates.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Avatar className="size-6">
                        <AvatarFallback className="text-[10px]">{c.initials}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span>{c.fullName}</span>
                        {c.email ? (
                          <span className="text-[11px] text-muted-foreground">{c.email}</span>
                        ) : null}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell>
                    {c.jobTitle ? (
                      <div className="flex flex-col">
                        <span>{c.jobTitle}</span>
                        {c.clientName ? (
                          <span className="text-[11px] text-muted-foreground">{c.clientName}</span>
                        ) : null}
                      </div>
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        {c.currentTitle ?? "—"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    {c.stage ? (
                      c.stage === "placed" ? (
                        <span
                          className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-white"
                          style={{ backgroundColor: "oklch(0.58 0.14 152)" }}
                        >
                          {STAGE_LABELS.placed}
                        </span>
                      ) : (
                        <span className={badgeClass(c.stage)}>{STAGE_LABELS[c.stage]}</span>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">Not in a pipeline</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {c.skills.slice(0, 4).map((skill) => (
                        <span
                          key={skill}
                          className="rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {skill}
                        </span>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {formatDate(c.createdAt)}
                  </TableCell>
                  <TableCell>
                    {c.resumePath ? (
                      <span className="inline-flex items-center gap-1 text-xs text-primary">
                        <FileText className="size-3" />
                        Resume
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
}

// Fixed to UTC deliberately. A relative "3d ago" reads better but is computed
// from Date.now(), which differs between the server render and the client
// hydration and is impure inside a component.
const DATE_FORMAT = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(iso: string) {
  return DATE_FORMAT.format(new Date(iso));
}
