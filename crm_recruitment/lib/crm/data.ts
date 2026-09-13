// Ported from the Claude Design template's embedded data generator
// (templates/recruitment-crm/RecruitmentCrm.dc.html <script data-dc-script>).
// Deterministic seeded mock data for the three demo tenants.

export type Role = "admin" | "recruiter" | "coordinator";
export type Plan = "free" | "pro";
export type Stage =
  | "source"
  | "screening"
  | "interviewing"
  | "offer"
  | "placed"
  | "withdrawn";

export const STAGES: Stage[] = [
  "source",
  "screening",
  "interviewing",
  "offer",
  "placed",
  "withdrawn",
];

export const STAGE_LABELS: Record<Stage, string> = {
  source: "Source",
  screening: "Screening",
  interviewing: "Interviewing",
  offer: "Offer",
  placed: "Placed",
  withdrawn: "Withdrawn",
};

export interface TeamMember {
  id: string;
  name: string;
  initials: string;
  email: string;
  role: Role;
  status: "active" | "invited";
}

export interface ClientActivity {
  actor: string;
  action: string;
  ts: number;
}

export interface ClientCandidate {
  id: string; // application id or candidate id
  candidateId: string;
  candidateName: string;
  initials: string;
  jobTitle: string;
  stage: Stage;
  appliedDate: number;
}

export interface Client {
  id: string;
  name: string;
  industry: string;
  openJobs: number;
  contact: string;
  activity: ClientActivity[];
  candidates?: ClientCandidate[];
}

export interface Job {
  id: string;
  title: string;
  clientId: string;
  clientName: string;
  location: string;
  salaryMin: number;
  salaryMax: number;
  status: "open" | "closed";
}

export interface Candidate {
  id: string;
  candidateId?: string;
  applicationId?: string;
  stageId?: string;
  updatedAt?: string;
  name: string;
  initials: string;
  title: string;
  stage: Stage;
  tags: string[];
  appliedDate: number;
  email: string;
  resumeName: string;
  jobTitle: string;
  clientName: string;
}

export interface Interview {
  id: string;
  applicationId?: string;
  candidateId: string;
  candidateName: string;
  jobTitle: string;
  clientName: string;
  stage: Stage;
  panel: string[];
  date: number;
  timezone: string;
  status: "upcoming" | "completed";
  feedback: { rating: number; summary: string; by: string } | null;
}

export interface Offer {
  id: string;
  candidateId: string;
  candidateName: string;
  clientName: string;
  jobTitle: string;
  salary: number;
  thresholdMin: number;
  withinThreshold: boolean;
  status: "draft" | "approved";
  createdBy: string;
  createdAt: number;
  approvedBy: string | null;
  approvedAt: number | null;
}

export interface AuditEntry {
  actor: string;
  action: string;
  entity: string;
  ts: number;
}

export interface TenantStage {
  id: string;
  kind: Stage;
  label: string;
  position: number;
}

export interface Tenant {
  id: string;
  name: string;
  plan: Plan;
  team: TeamMember[];
  clients: Client[];
  jobs: Job[];
  candidates: Candidate[];
  interviews: Interview[];
  offers: Offer[];
  audit: AuditEntry[];
  stages?: TenantStage[];
}

export type CrmData = Record<string, Tenant>;

function mulberry32(a: number) {
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

function pickN<T>(rng: () => number, arr: T[], n: number): T[] {
  const pool = arr.slice();
  const out: T[] = [];
  for (let i = 0; i < n && pool.length; i++) {
    out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  }
  return out;
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

const FIRST = [
  "Maya", "Jordan", "Priya", "Ethan", "Sofia", "Liam", "Nadia", "Marcus",
  "Elena", "Tomas", "Grace", "Kenji", "Aaliyah", "Noah", "Ines", "Devon",
  "Fatima", "Oscar", "Chloe", "Rahul", "Ingrid", "Malik", "Yuki", "Owen",
  "Camila", "Theo", "Zara", "Adrian", "Layla", "Felix",
];
const LAST = [
  "Chen", "Okafor", "Nakamura", "Rodriguez", "Kowalski", "Patel", "Bennett",
  "Larsson", "Silva", "Haddad", "Murphy", "Ivanov", "Kimura", "Osei",
  "Fischer", "Delgado", "Novak", "Andersson", "Reyes", "Sharma",
];
const TITLES = [
  "Senior Backend Engineer", "Product Designer", "Data Analyst",
  "Account Executive", "DevOps Engineer", "Marketing Manager",
  "Customer Success Lead", "Frontend Engineer", "QA Engineer",
  "Finance Analyst", "Operations Manager", "Sales Development Rep",
];
const TAGS_POOL = [
  "Remote-OK", "Visa Sponsor Needed", "Referral", "Top Talent", "Salary Flex",
  "Bilingual", "Ex-FAANG", "Immediate Start", "Contract-to-hire", "Boomerang",
];
const CLIENT_NAMES = [
  "Northwind Analytics", "Cedar & Vale Retail", "Brightline Logistics",
  "Fenwick Health Group", "Arcadia Fintech", "Solstice Media",
  "Ironbridge Manufacturing", "Pelican Cloud Systems",
];
const INDUSTRIES = [
  "SaaS", "Retail", "Logistics", "Healthcare", "Financial Services", "Media",
  "Manufacturing", "Cloud Infrastructure",
];
const TIMEZONES = [
  "America/New_York", "America/Chicago", "America/Los_Angeles",
  "Europe/London", "Europe/Berlin", "Asia/Kolkata", "Asia/Singapore",
];

function buildTenant(
  id: string,
  name: string,
  plan: Plan,
  seed: number,
  perStage: number,
): Tenant {
  const rng = mulberry32(seed);
  const teamRoles: Role[] = [
    "admin", "recruiter", "recruiter", "coordinator", "coordinator", "recruiter",
  ];
  const team: TeamMember[] = teamRoles.map((role, i) => {
    const nm = pick(rng, FIRST) + " " + pick(rng, LAST);
    return {
      id: id + "-u" + i,
      name: nm,
      initials: initials(nm),
      email:
        nm.toLowerCase().replace(" ", ".") +
        "@" +
        name.split(" ")[0].toLowerCase() +
        ".com",
      role,
      status: i === 0 ? "active" : rng() < 0.15 ? "invited" : "active",
    };
  });

  const clients: Client[] = pickN(rng, CLIENT_NAMES, 5).map((cn) => {
    const openJobs = 1 + Math.floor(rng() * 4);
    const activity: ClientActivity[] = [];
    const acts = [
      "Job posted", "Note added", "Contract renewed", "Rate card updated",
      "Hiring manager call",
    ];
    for (let k = 0; k < 3; k++) {
      activity.push({
        actor: pick(rng, team).name,
        action: pick(rng, acts),
        ts: Date.now() - Math.floor(rng() * 20) * 86400000,
      });
    }
    return {
      id: id + "-cl" + cn.replace(/\W+/g, ""),
      name: cn,
      industry: pick(rng, INDUSTRIES),
      openJobs,
      contact: pick(rng, FIRST) + " " + pick(rng, LAST),
      activity,
    };
  });

  const jobs: Job[] = [];
  clients.forEach((c, ci) => {
    const n = 1 + Math.floor(rng() * 2);
    for (let j = 0; j < n; j++) {
      jobs.push({
        id: id + "-j" + ci + j,
        title: pick(rng, TITLES),
        clientId: c.id,
        clientName: c.name,
        location: pick(rng, [
          "Remote", "New York, NY", "Austin, TX", "London, UK", "Bengaluru, IN",
        ]),
        salaryMin: 80 + Math.floor(rng() * 40),
        salaryMax: 130 + Math.floor(rng() * 60),
        status: rng() < 0.85 ? "open" : "closed",
      });
    }
  });

  const candidates: Candidate[] = [];
  STAGES.forEach((stage) => {
    const n = stage === "withdrawn" ? Math.max(2, perStage - 2) : perStage;
    for (let i = 0; i < n; i++) {
      const nm = pick(rng, FIRST) + " " + pick(rng, LAST);
      const job = pick(rng, jobs);
      candidates.push({
        id: id + "-" + stage + i,
        name: nm,
        initials: initials(nm),
        title: job.title,
        stage,
        tags: pickN(rng, TAGS_POOL, 1 + Math.floor(rng() * 2)),
        appliedDate: Date.now() - Math.floor(rng() * 40) * 86400000,
        email: nm.toLowerCase().replace(" ", ".") + "@mail.com",
        resumeName: nm.replace(" ", "_") + "_Resume.pdf",
        jobTitle: job.title,
        clientName: job.clientName,
      });
    }
  });

  // Populate candidates under their respective client (single source of truth stage)
  clients.forEach((cl) => {
    cl.candidates = candidates
      .filter((c) => c.clientName === cl.name)
      .map((c) => ({
        id: c.id,
        candidateId: c.id,
        candidateName: c.name,
        initials: c.initials,
        jobTitle: c.jobTitle,
        stage: c.stage,
        appliedDate: c.appliedDate,
      }));
  });

  const interviewCands = candidates
    .filter((c) => c.stage === "interviewing")
    .concat(
      pickN(
        rng,
        candidates.filter((c) => c.stage === "offer" || c.stage === "placed"),
        2,
      ),
    );
  const interviews: Interview[] = interviewCands.map((c, i) => {
    const completed = i % 3 === 0;
    const dayOffset = completed
      ? -(1 + Math.floor(rng() * 5))
      : 1 + Math.floor(rng() * 6);
    return {
      id: id + "-iv" + i,
      candidateId: c.id,
      candidateName: c.name,
      jobTitle: c.jobTitle,
      clientName: c.clientName,
      stage: c.stage, // single source of truth from application
      panel: pickN(rng, team, 2).map((t) => t.name),
      date: Date.now() + dayOffset * 86400000,
      timezone: pick(rng, TIMEZONES),
      status: completed ? "completed" : "upcoming",
      feedback: completed
        ? {
            rating: 3 + Math.floor(rng() * 3),
            summary: pick(rng, [
              "Strong technical depth, recommend advancing.",
              "Good communicator, some gaps on system design.",
              "Great culture fit, panel unanimous yes.",
              "Mixed feedback, one panelist flagged concerns.",
            ]),
            by: pick(rng, team).name,
          }
        : null,
    };
  });

  const offerCands = candidates.filter(
    (c) => c.stage === "offer" || c.stage === "placed",
  );
  const offers: Offer[] = offerCands.map((c, i) => {
    const threshold = 90 + Math.floor(rng() * 20);
    const salary = threshold - 5 + Math.floor(rng() * 25);
    const approved = c.stage === "placed" || rng() < 0.3;
    const createdAt = Date.now() - Math.floor(rng() * 10) * 86400000;
    return {
      id: id + "-of" + i,
      candidateId: c.id,
      candidateName: c.name,
      clientName: c.clientName,
      jobTitle: c.jobTitle,
      salary,
      thresholdMin: threshold,
      withinThreshold: salary >= threshold,
      status: approved ? "approved" : "draft",
      createdBy: pick(
        rng,
        team.filter((t) => t.role !== "coordinator"),
      ).name,
      createdAt,
      approvedBy: approved
        ? pick(
            rng,
            team.filter((t) => t.role === "admin"),
          ).name
        : null,
      approvedAt: approved ? createdAt + 86400000 : null,
    };
  });

  const audit: AuditEntry[] = [];
  clients.forEach((c) =>
    c.activity.forEach((a) =>
      audit.push({ actor: a.actor, action: a.action, entity: c.name, ts: a.ts }),
    ),
  );
  offers
    .filter((o) => o.status === "approved")
    .forEach((o) =>
      audit.push({
        actor: o.approvedBy!,
        action: "Approved offer",
        entity: o.candidateName,
        ts: o.approvedAt!,
      }),
    );
  audit.sort((a, b) => b.ts - a.ts);

  const stages: TenantStage[] = [
    { id: `${id}-st-1`, kind: "source", label: "Source", position: 1 },
    { id: `${id}-st-2`, kind: "screening", label: "Screening", position: 2 },
    { id: `${id}-st-3`, kind: "interviewing", label: "Interviewing", position: 3 },
    { id: `${id}-st-4`, kind: "offer", label: "Offer", position: 4 },
    { id: `${id}-st-5`, kind: "placed", label: "Placed", position: 5 },
    { id: `${id}-st-6`, kind: "withdrawn", label: "Withdrawn", position: 6 },
  ];

  return { id, name, plan, team, clients, jobs, candidates, interviews, offers, audit, stages };
}

// Generated once per browser session (module-level cache), same as the
// original template's `static DATA` on the Component class.
let cached: CrmData | null = null;

export function buildCrmData(): CrmData {
  if (!cached) {
    cached = {
      t1: buildTenant("t1", "Skyline Talent Partners", "pro", 101, 5),
      t2: buildTenant("t2", "Vertex Staffing Group", "free", 202, 3),
      t3: buildTenant("t3", "Meridian Recruiting Co.", "pro", 303, 4),
    };
  }
  return cached;
}
