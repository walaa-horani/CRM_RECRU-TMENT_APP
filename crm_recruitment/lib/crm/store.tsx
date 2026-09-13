"use client";

// Ported from the Claude Design template's `class Component extends DCLogic`
// state machine (templates/recruitment-crm/RecruitmentCrm.dc.html).

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { OrgRole } from "@/lib/supabase/types";
import type { CandidateListItem } from "@/lib/services/candidates";
import type { StageKind } from "@/lib/validation/candidates";
import type { RejectedReason } from "@/lib/validation/pipeline";
import { moveApplicationStageAction } from "@/lib/actions/pipeline";
import { buildCrmData, type CrmData, type Interview, type Plan, type Role, type Stage, type Tenant } from "./data";

/**
 * Who the caller actually is, resolved on the server from the Clerk session and
 * passed in as a prop. Read-only on purpose: nothing in the client can change
 * it, and no query is built from it.
 *
 * Not to be confused with `tenantId` / `role` below, which drive the DEMO
 * switchers in the header and only ever index into the generated mock data.
 */
export interface CrmIdentity {
  tenantId: string;
  userId: string;
  role: OrgRole;
}

export interface CandidateQuery {
  q: string;
  stage: StageKind | null;
}

export type View =
  | "dashboard"
  | "talent"
  | "clients"
  | "kanban"
  | "interviews"
  | "offers"
  | "team"
  | "billing"
  | "organizations";

export type Theme = "light" | "dark";

interface CrmContextValue {
  identity: CrmIdentity;
  /** Real rows from Supabase, fetched server-side under RLS. */
  candidates: CandidateListItem[];
  candidateTotal: number;
  candidateQuery: CandidateQuery;
  theme: Theme;
  tenantId: string;
  role: Role;
  activeView: View;
  astraOpen: boolean;
  data: CrmData;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
  setTenantId: (id: string) => void;
  setActiveView: (view: View) => void;
  toggleAstra: () => void;
  moveStage: (
    candidateId: string,
    stage: Stage,
    reason?: RejectedReason,
    note?: string,
  ) => Promise<void>;
  approveOffer: (offerId: string) => void;
  inviteMember: (name: string, email: string, role: Role) => void;
  changePlan: (plan: Plan) => void;
}

const CrmContext = createContext<CrmContextValue | null>(null);

export function CrmProvider({
  children,
  identity,
  candidates,
  candidateTotal,
  candidateQuery,
  initialTenantData,
}: {
  children: ReactNode;
  identity: CrmIdentity;
  candidates: CandidateListItem[];
  candidateTotal: number;
  candidateQuery: CandidateQuery;
  initialTenantData?: Tenant;
}) {
  const [data, setData] = useState<CrmData>(() => {
    const base = buildCrmData();
    if (initialTenantData) {
      base[identity.tenantId] = initialTenantData;
    }
    return base;
  });
  const [theme, setTheme] = useState<Theme>("light");
  const [tenantId, setTenantId] = useState(
    initialTenantData ? identity.tenantId : "t1"
  );
  const role: Role = (identity.role as Role) || "admin";
  const [activeView, setActiveView] = useState<View>("dashboard");
  const [astraOpen, setAstraOpen] = useState(false);

  const updateTenant = useCallback(
    (id: string, fn: (t: CrmData[string]) => CrmData[string]) => {
      setData((prev) => ({ ...prev, [id]: fn(prev[id]) }));
    },
    [],
  );

  const toggleTheme = useCallback(
    () => setTheme((t) => (t === "dark" ? "light" : "dark")),
    [],
  );
  const toggleAstra = useCallback(() => setAstraOpen((v) => !v), []);

  const [candidatesList, setCandidatesList] = useState<CandidateListItem[]>(candidates);

  useEffect(() => {
    setCandidatesList(candidates);
  }, [candidates]);

  const moveStage = useCallback(
    async (
      candidateId: string,
      stage: Stage,
      rejectedReason?: RejectedReason,
      note?: string,
    ) => {
      const tenant = data[tenantId];
      if (!tenant) return;

      const cand = tenant.candidates.find(
        (c) => c.id === candidateId || c.applicationId === candidateId || c.candidateId === candidateId,
      );
      const targetCandId = cand?.candidateId || cand?.id || candidateId;
      const targetAppId = cand?.applicationId || cand?.id || candidateId;
      const oldStage = cand?.stage;

      // 1. Single Source of Truth: Optimistically update ALL views:
      // a) Kanban, Dashboard, Client Ledger, and Interviews
      updateTenant(tenantId, (t) => {
        const existingIv = t.interviews.find(
          (iv) => iv.candidateId === targetCandId || iv.applicationId === targetAppId,
        );
        let updatedInterviews = t.interviews.map((iv) =>
          iv.candidateId === targetCandId || iv.applicationId === targetAppId
            ? { ...iv, stage }
            : iv,
        );
        if (!existingIv && stage === "interviewing" && cand) {
          const newIv: Interview = {
            id: `iv-${Date.now()}`,
            applicationId: cand.applicationId || cand.id,
            candidateId: cand.candidateId || cand.id,
            candidateName: cand.name,
            jobTitle: cand.jobTitle || cand.title || "Role",
            clientName: cand.clientName || "Partner Client",
            stage: "interviewing",
            panel: ["Lead Engineer", "Recruiter"],
            date: Date.now() + 2 * 86400000,
            timezone: "UTC",
            status: "upcoming",
            feedback: null,
          };
          updatedInterviews = [newIv, ...updatedInterviews];
        }

        return {
          ...t,
          candidates: t.candidates.map((c) =>
            c.id === candidateId || c.applicationId === candidateId || c.candidateId === candidateId
              ? { ...c, stage }
              : c,
          ),
          // b) Client Ledger: update active candidates for this client
          clients: t.clients.map((cl) => ({
            ...cl,
            candidates: cl.candidates?.map((cc) =>
              cc.id === candidateId || cc.candidateId === targetCandId
                ? { ...cc, stage }
                : cc,
            ),
          })),
          // c) Interviews: update candidate stage for scheduled/completed interviews
          interviews: updatedInterviews,
        };
      });

      // d) Talent Pool: update candidate list stage
      setCandidatesList((prev) =>
        prev.map((c) =>
          c.id === candidateId || c.id === targetCandId
            ? { ...c, stage: stage as StageKind }
            : c,
        ),
      );

      // 2. Persist to Supabase public.applications.stage_kind under RLS
      const targetStageObj = tenant.stages?.find((s) => s.kind === stage);
      if (cand?.applicationId && targetStageObj?.id && cand?.stageId && cand?.updatedAt) {
        try {
          const res = await moveApplicationStageAction({
            applicationId: cand.applicationId,
            targetStageId: targetStageObj.id,
            targetStageKind: stage as StageKind,
            expectedStageId: cand.stageId,
            expectedUpdatedAt: cand.updatedAt,
            rejectedReason: rejectedReason || (stage === "withdrawn" ? "other" : undefined),
            note,
          });

          if (res.status === "error") {
            console.error("Failed to move application stage in database:", res.message);
            // Revert optimistic update on permission or state machine failure
            if (oldStage) {
              updateTenant(tenantId, (t) => ({
                ...t,
                candidates: t.candidates.map((c) =>
                  c.id === candidateId ? { ...c, stage: oldStage } : c,
                ),
              }));
              setCandidatesList((prev) =>
                prev.map((c) => (c.id === candidateId ? { ...c, stage: oldStage as StageKind } : c)),
              );
            }
          }
        } catch (err) {
          console.error("Error invoking moveApplicationStageAction:", err);
        }
      }
    },
    [data, tenantId, updateTenant],
  );

  const approveOffer = useCallback(
    (offerId: string) => {
      if (role !== "admin") return;
      const admin = data[tenantId].team.find((t) => t.role === "admin");
      updateTenant(tenantId, (t) => {
        const offer = t.offers.find((o) => o.id === offerId);
        if (!offer) return t;
        return {
          ...t,
          offers: t.offers.map((o) =>
            o.id === offerId
              ? {
                  ...o,
                  status: "approved" as const,
                  approvedBy: admin ? admin.name : "Admin",
                  approvedAt: Date.now(),
                }
              : o,
          ),
          audit: [
            {
              actor: admin ? admin.name : "Admin",
              action: "Approved offer",
              entity: offer.candidateName,
              ts: Date.now(),
            },
            ...t.audit,
          ],
        };
      });
    },
    [role, data, tenantId, updateTenant],
  );

  const inviteMember = useCallback(
    (name: string, email: string, memberRole: Role) => {
      updateTenant(tenantId, (t) => ({
        ...t,
        team: [
          ...t.team,
          {
            id: tenantId + "-u" + t.team.length,
            name,
            initials: name
              .split(" ")
              .map((p) => p[0])
              .join("")
              .slice(0, 2)
              .toUpperCase(),
            email,
            role: memberRole,
            status: "invited" as const,
          },
        ],
      }));
    },
    [tenantId, updateTenant],
  );

  const changePlan = useCallback(
    (plan: Plan) => {
      updateTenant(tenantId, (t) => ({ ...t, plan }));
    },
    [tenantId, updateTenant],
  );

  const value = useMemo<CrmContextValue>(
    () => ({
      identity,
      candidates: candidatesList,
      candidateTotal,
      candidateQuery,
      theme,
      tenantId,
      role,
      activeView,
      astraOpen,
      data,
      setTheme,
      toggleTheme,
      setTenantId,
      setActiveView,
      toggleAstra,
      moveStage,
      approveOffer,
      inviteMember,
      changePlan,
    }),
    [
      identity, candidatesList, candidateTotal, candidateQuery,
      theme, tenantId, role, activeView, astraOpen, data,
      toggleTheme, toggleAstra, moveStage, approveOffer, inviteMember, changePlan,
    ],
  );

  return <CrmContext.Provider value={value}>{children}</CrmContext.Provider>;
}

export function useCrm() {
  const ctx = useContext(CrmContext);
  if (!ctx) throw new Error("useCrm must be used within a CrmProvider");
  return ctx;
}
