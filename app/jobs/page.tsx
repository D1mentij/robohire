"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { mockJobs, mockScenario, mockScene } from "@/mocks";
import {
  filterValidSteps,
  isJob,
  isJobsResult,
  isRobotPlan,
  isScene,
  type Fit,
  type Job,
  type JobsResult,
  type RobotPlan,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { buildPlan } from "@/lib/roi/roi";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
} from "@/lib/ai/types";
import { getOrCreateScenario } from "@/lib/ai/scenarioCache";
import { clearHandoffStorage } from "@/lib/executor";

const SCENARIO_TIMEOUT_MS = 25_000;
const DEFAULT_HOURLY_COST = 8.5;
const DEFAULT_MOCK_PLAN: RobotPlan = buildPlan(
  mockJobs.jobs,
  DEFAULT_HOURLY_COST,
);

interface FitStyle {
  label: "Suitable" | "Partial" | "Not Suitable";
  badgeClass: string;
  scoreBarClass: string;
  cardClass: string;
}

const FIT_STYLES: Record<Fit, FitStyle> = {
  good: {
    label: "Suitable",
    badgeClass:
      "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    scoreBarClass: "bg-emerald-500",
    cardClass:
      "border-emerald-500/40 bg-white shadow-md dark:border-emerald-500/30 dark:bg-slate-900",
  },
  partial: {
    label: "Partial",
    badgeClass:
      "border-amber-500/50 bg-amber-500/15 text-amber-700 dark:text-amber-300",
    scoreBarClass: "bg-amber-500",
    cardClass:
      "border-amber-500/40 bg-white shadow-sm dark:border-amber-500/30 dark:bg-slate-900",
  },
  no: {
    label: "Not Suitable",
    badgeClass:
      "border-slate-400/40 bg-slate-500/15 text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-400",
    scoreBarClass: "bg-slate-400 dark:bg-slate-600",
    cardClass:
      "border-slate-300/70 bg-slate-100/70 opacity-60 grayscale-[35%] dark:border-slate-800 dark:bg-slate-900/40",
  },
};

const PRESET_SCENARIOS: Record<string, ScenarioStep[]> = {
  greeter: mockScenario.steps,
  menu_presenter: [
    { action: "walk_to", target: "menu_board" },
    { action: "turn_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Hello everyone! Check out today's fresh pastry and roast coffee combo on our menu board.",
    },
    { action: "point_to", target: "menu_board" },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "counter" },
    {
      action: "say",
      text: "Head right over to the counter whenever you are ready to order.",
    },
  ],
  table_guide: [
    { action: "walk_to", target: "entrance" },
    { action: "wave" },
    {
      action: "say",
      text: "Welcome! Follow me and I will guide you to our seating area.",
    },
    { action: "walk_to", target: "tables" },
    { action: "point_to", target: "tables" },
    {
      action: "say",
      text: "Here are our available tables. Please make yourself comfortable!",
    },
    { action: "wait", seconds: 2 },
    { action: "point_to", target: "counter" },
    {
      action: "say",
      text: "When you are ready, you can place your order at the counter.",
    },
  ],
};

interface JobsAndPlanSnapshot {
  jobsData: JobsResult;
  plan: RobotPlan;
}

const SERVER_JOBS_PLAN_SNAPSHOT: JobsAndPlanSnapshot = {
  jobsData: mockJobs,
  plan: DEFAULT_MOCK_PLAN,
};

let cachedStorageKey = "";
let cachedSnapshot: JobsAndPlanSnapshot = SERVER_JOBS_PLAN_SNAPSHOT;

function getJobsAndPlanClientSnapshot(): JobsAndPlanSnapshot {
  if (typeof window === "undefined") return SERVER_JOBS_PLAN_SNAPSHOT;
  try {
    const rawJobs = window.sessionStorage.getItem(JOBS_STORAGE_KEY) ?? "";
    const rawPlan = window.sessionStorage.getItem(PLAN_STORAGE_KEY) ?? "";
    const key = `${rawJobs}|${rawPlan}`;

    if (key !== cachedStorageKey) {
      cachedStorageKey = key;

      let jobsData: JobsResult = mockJobs;
      if (rawJobs) {
        try {
          const parsedJobs = JSON.parse(rawJobs) as unknown;
          if (isJobsResult(parsedJobs)) {
            jobsData = parsedJobs;
          }
        } catch {
          jobsData = mockJobs;
        }
      }

      const jobIdsSet = new Set(jobsData.jobs.map((j) => j.id));
      let plan: RobotPlan | null = null;
      if (rawPlan) {
        try {
          const parsedPlan = JSON.parse(rawPlan) as unknown;
          if (
            isRobotPlan(parsedPlan) &&
            parsedPlan.job_ids.every((id) => jobIdsSet.has(id))
          ) {
            plan = parsedPlan;
          }
        } catch {
          plan = null;
        }
      }

      if (!plan) {
        plan = buildPlan(jobsData.jobs, DEFAULT_HOURLY_COST);
      }

      cachedSnapshot = { jobsData, plan };
    }
  } catch {
    cachedSnapshot = SERVER_JOBS_PLAN_SNAPSHOT;
    return SERVER_JOBS_PLAN_SNAPSHOT;
  }
  return cachedSnapshot;
}

function getJobsAndPlanServerSnapshot(): JobsAndPlanSnapshot {
  return SERVER_JOBS_PLAN_SNAPSHOT;
}

function subscribeJobsStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("focus", callback);
  window.addEventListener("robohire:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("focus", callback);
    window.removeEventListener("robohire:storage", callback);
  };
}

function getActiveScene(): Scene {
  if (typeof window === "undefined") return mockScene;
  try {
    const rawAnalysis = window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
    if (rawAnalysis) {
      const parsed = JSON.parse(rawAnalysis) as { scene?: unknown };
      if (isScene(parsed?.scene)) return parsed.scene;
    }
    const rawSessionScene = window.sessionStorage.getItem("robohire:scene");
    if (rawSessionScene) {
      const parsed = JSON.parse(rawSessionScene) as unknown;
      if (isScene(parsed)) return parsed;
    }
  } catch {
    // Fall back to mockScene
  }
  return mockScene;
}

function buildFallbackScenario(job: Job, scene: Scene): Scenario {
  const zoneIds = scene.zones.map((z) => z.id);
  const preset = PRESET_SCENARIOS[job.id];
  if (preset) {
    const validPreset = filterValidSteps(preset, zoneIds);
    if (validPreset.length >= 2) {
      return { job_id: job.id, steps: validPreset };
    }
  }

  const firstZone = scene.zones[0]?.id;
  const secondZone = scene.zones[1]?.id ?? firstZone;

  const genericSteps: ScenarioStep[] = firstZone
    ? [
        { action: "walk_to", target: firstZone },
        { action: "wave" },
        {
          action: "say",
          text: `Hello! I am performing the ${job.title} role.`,
        },
        ...(secondZone
          ? ([
              { action: "turn_to", target: secondZone },
              { action: "point_to", target: secondZone },
            ] as ScenarioStep[])
          : []),
        { action: "wait", seconds: 2 },
        {
          action: "say",
          text: "Please let our team know if you need further assistance.",
        },
      ]
    : [{ action: "wave" }];

  return {
    job_id: job.id,
    steps: filterValidSteps(genericSteps, zoneIds),
  };
}

interface JobCardProps {
  job: Job;
  rank: number;
  inPlan: boolean;
}

function JobCard({ job, rank, inPlan }: JobCardProps) {
  const style = FIT_STYLES[job.fit];
  const isNotSuitable = job.fit === "no";

  return (
    <article
      data-testid={`job-card-${job.id}`}
      data-fit={job.fit}
      className={`flex flex-col justify-between rounded-2xl border p-6 transition-colors ${style.cardClass}`}
    >
      <div className="space-y-4">
        {/* Header: Rank, Title, In Plan Badge, Fit Badge, and Score */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                #{rank}
              </span>
              <h2
                className={`text-xl font-bold tracking-tight ${
                  isNotSuitable
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.title}
              </h2>
              {inPlan && (
                <span
                  data-testid={`in-plan-badge-${job.id}`}
                  className="rounded-full border border-sky-500/50 bg-sky-500/15 px-2.5 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300"
                >
                  In plan
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              className={`rounded-full border px-3 py-1 text-xs font-bold tracking-wide ${style.badgeClass}`}
            >
              {style.label}
            </span>
            <div className="flex items-baseline gap-1 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono dark:border-slate-800 dark:bg-slate-950">
              <span
                className={`text-base font-extrabold ${
                  isNotSuitable
                    ? "text-slate-500 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {job.score}
              </span>
              <span className="text-xs text-slate-400">/100</span>
            </div>
          </div>
        </div>

        {/* Score Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${style.scoreBarClass}`}
            style={{ width: `${Math.max(0, Math.min(100, job.score))}%` }}
          />
        </div>

        {/* Why it fits & Limitations */}
        <div className="grid gap-3 pt-1 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              Why it fits
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.why}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-slate-50/70 p-3.5 dark:border-slate-800/80 dark:bg-slate-950/50">
            <div className="mb-1 text-xs font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
              Limitations
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.limits}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Footer: Hours/week and Gross value €/mo (no per-job payback) */}
      <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Hours / week
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {job.hours_per_week} hrs/wk
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Gross value
          </dt>
          <dd
            className={`mt-0.5 font-mono text-base font-bold ${
              job.savings_eur_month > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-500"
            }`}
          >
            Gross value €{job.savings_eur_month}/mo
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { jobsData, plan } = useSyncExternalStore(
    subscribeJobsStorage,
    getJobsAndPlanClientSnapshot,
    getJobsAndPlanServerSnapshot,
  );
  const [hiringJob, setHiringJob] = useState<Job | null>(null);

  useEffect(() => {
    // Purge any legacy localStorage keys or stale sessionStorage keys not matching current jobs
    try {
      window.localStorage.removeItem("robohire:scene");
      window.localStorage.removeItem("robohire:scenario");
      window.localStorage.removeItem("robohire:job");

      const currentIds = new Set(jobsData.jobs.map((j) => j.id));
      const rawJob = window.sessionStorage.getItem("robohire:job");
      if (rawJob) {
        const parsed = JSON.parse(rawJob) as unknown;
        if (!isJob(parsed) || !currentIds.has(parsed.id)) {
          clearHandoffStorage();
        }
      }
    } catch {
      // Ignore storage errors
    }
    window.dispatchEvent(new Event("robohire:storage"));
  }, [pathname, jobsData.jobs]);

  const sortedJobs = useMemo(
    () => [...jobsData.jobs].sort((a, b) => b.score - a.score),
    [jobsData.jobs],
  );

  const planIdSet = useMemo(() => new Set(plan.job_ids), [plan.job_ids]);

  const includedJobs = useMemo(
    () =>
      plan.job_ids
        .map((id) => jobsData.jobs.find((j) => j.id === id))
        .filter((j): j is Job => j !== undefined),
    [plan.job_ids, jobsData.jobs],
  );

  const primaryHireJob = useMemo(
    () =>
      includedJobs[0] ??
      sortedJobs.find((j) => j.fit === "good" || j.fit === "partial") ??
      null,
    [includedJobs, sortedJobs],
  );

  async function handleHire(job: Job) {
    if (hiringJob !== null) return;
    setHiringJob(job);

    clearHandoffStorage();
    const scene = getActiveScene();
    let scenario: Scenario | null = null;

    try {
      const { scenario: candidate } = await getOrCreateScenario(job, scene, {
        businessType: jobsData.business_type,
        timeoutMs: SCENARIO_TIMEOUT_MS,
      });
      const validSteps = filterValidSteps(
        candidate.steps,
        scene.zones.map((z) => z.id),
      );
      if (validSteps.length > 0) {
        scenario = { job_id: candidate.job_id, steps: validSteps };
      }
    } catch {
      // Gracefully fall back to matching mock scenario below
    }

    if (!scenario) {
      scenario = buildFallbackScenario(job, scene);
    }

    try {
      window.sessionStorage.setItem("robohire:scene", JSON.stringify(scene));
      window.sessionStorage.setItem(
        "robohire:scenario",
        JSON.stringify(scenario),
      );
      window.sessionStorage.setItem("robohire:job", JSON.stringify(job));
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage quota errors
    }

    router.push("/robot");
  }

  const capacityPercent =
    plan.capacity_hours_per_week > 0
      ? Math.min(
          100,
          Math.round((plan.hours_per_week / plan.capacity_hours_per_week) * 100),
        )
      : 0;

  return (
    <main className="flex-1 bg-slate-50 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div>
            <span className="inline-block rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-0.5 font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
              Step 2 of 3 • {jobsData.business_type}
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              Matched Booster K1 Robot Jobs
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              One Booster K1 shift plan combining suitable tasks, ranked by
              capability fit score (0–100) and gross monthly value.
            </p>
          </div>
        </div>

        {/* Recommended: hire 1 Booster K1 Shift Plan Panel */}
        <section
          data-testid="robot-plan-panel"
          className="rounded-2xl border-2 border-sky-500/50 bg-white p-6 shadow-md transition-colors dark:border-sky-500/40 dark:bg-slate-900"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                <span>Robot Shift Plan</span>
              </div>
              <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                Recommended: hire 1 Booster K1
              </h2>
              {includedJobs.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    Included jobs:
                  </span>
                  {includedJobs.map((j) => (
                    <span
                      key={j.id}
                      className="rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-800 dark:text-emerald-200"
                    >
                      {j.title}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  No tasks currently meet the minimum gross savings threshold
                  for a shift plan.
                </p>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <Link
                href="/report"
                data-testid="download-report-btn"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
              >
                <span>Download report</span>
              </Link>
              {primaryHireJob && (
                <button
                  type="button"
                  data-testid="hire-plan-btn"
                  disabled={hiringJob !== null}
                  onClick={() => handleHire(primaryHireJob)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/60 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {hiringJob !== null && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                  )}
                  <span>
                    {hiringJob !== null ? "Hiring…" : "Hire this K1"}
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Shift Plan Economics Grid */}
          <dl className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5">
              <dt className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300">
                Net savings
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-extrabold text-emerald-700 dark:text-emerald-300">
                €{plan.net_savings_eur_month}/mo
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Payback
              </dt>
              <dd className="mt-0.5 font-mono text-lg font-extrabold text-slate-900 dark:text-white">
                {plan.payback_months !== null
                  ? `${plan.payback_months} mo`
                  : "—"}
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Robot price
              </dt>
              <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                €{plan.robot_price_eur}
              </dd>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/60">
              <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                Running cost
              </dt>
              <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
                €{plan.running_cost_eur_month}/mo
              </dd>
            </div>
          </dl>

          {/* Robot Hours Used vs Capacity Bar */}
          <div className="mt-4 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700 dark:text-slate-300">
                Robot hours used vs weekly capacity
              </span>
              <span className="font-mono font-bold text-slate-900 dark:text-white">
                {plan.hours_per_week} / {plan.capacity_hours_per_week} hrs/wk (
                {capacityPercent}%)
              </span>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all"
                style={{ width: `${capacityPercent}%` }}
              />
            </div>
          </div>

          {/* Collapsible Assumptions */}
          {plan.assumptions.length > 0 && (
            <details className="mt-4 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-950/50 dark:text-slate-400">
              <summary className="cursor-pointer font-semibold text-slate-800 dark:text-slate-200">
                Assumptions ({plan.assumptions.length})
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-5">
                {plan.assumptions.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          )}
        </section>

        {/* Hiring Transition Loading Banner */}
        {hiringJob && (
          <div
            role="status"
            data-testid="hiring-loading-banner"
            className="flex items-center gap-3 rounded-2xl border border-sky-500/50 bg-sky-500/10 px-5 py-3.5 text-sm font-semibold text-sky-800 shadow-sm dark:text-sky-200"
          >
            <span className="inline-block h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-sky-500 border-t-transparent" />
            <span>
              Preparing 3D workspace &amp; generating K1 scenario for{" "}
              <strong className="font-bold">{hiringJob.title}</strong>…
            </span>
          </div>
        )}

        {/* Sorted Job Cards List */}
        <section className="space-y-4" aria-label="Matched Robot Jobs">
          {sortedJobs.map((job, idx) => (
            <JobCard
              key={job.id}
              job={job}
              rank={idx + 1}
              inPlan={planIdSet.has(job.id)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
