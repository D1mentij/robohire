"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { mockJobs, mockScenario, mockScene } from "@/mocks";
import {
  filterValidSteps,
  isJobsResult,
  isScenario,
  isScene,
  type Fit,
  type Job,
  type JobsResult,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY } from "@/lib/ai/types";

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

let cachedJobsRaw = "";
let cachedJobsSnapshot: JobsResult = mockJobs;

function getJobsClientSnapshot(): JobsResult {
  if (typeof window === "undefined") return mockJobs;
  try {
    const raw =
      window.sessionStorage.getItem(JOBS_STORAGE_KEY) ??
      window.localStorage.getItem(JOBS_STORAGE_KEY) ??
      "";
    if (raw !== cachedJobsRaw) {
      cachedJobsRaw = raw;
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        cachedJobsSnapshot = isJobsResult(parsed) ? parsed : mockJobs;
      } else {
        cachedJobsSnapshot = mockJobs;
      }
    }
  } catch {
    return mockJobs;
  }
  return cachedJobsSnapshot;
}

function getJobsServerSnapshot(): JobsResult {
  return mockJobs;
}

function subscribeJobsStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

function getActiveScene(): Scene {
  if (typeof window === "undefined") return mockScene;
  try {
    const rawAnalysis = window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
    if (rawAnalysis) {
      const parsed = JSON.parse(rawAnalysis) as { scene?: unknown };
      if (isScene(parsed?.scene)) return parsed.scene;
    }
    const rawLocalScene = window.localStorage.getItem("robohire:scene");
    if (rawLocalScene) {
      const parsed = JSON.parse(rawLocalScene) as unknown;
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
  isHiring: boolean;
  isAnyHiring: boolean;
  onHire: (job: Job) => void;
}

function JobCard({
  job,
  rank,
  isHiring,
  isAnyHiring,
  onHire,
}: JobCardProps) {
  const style = FIT_STYLES[job.fit];
  const isNotSuitable = job.fit === "no";
  const canHire = job.fit === "good" || job.fit === "partial";

  return (
    <article
      data-testid={`job-card-${job.id}`}
      data-fit={job.fit}
      className={`flex flex-col justify-between rounded-2xl border p-6 transition-colors ${style.cardClass}`}
    >
      <div className="space-y-4">
        {/* Header: Rank, Title, Fit Badge, Score, and Hire Action */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
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

            {canHire && (
              <button
                type="button"
                data-testid={`hire-btn-${job.id}`}
                disabled={isAnyHiring}
                onClick={() => onHire(job)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/60 bg-sky-600 px-4 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
              >
                {isHiring && (
                  <span
                    aria-hidden="true"
                    className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent"
                  />
                )}
                <span>{isHiring ? "Hiring…" : "Hire"}</span>
              </button>
            )}
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

      {/* Metrics Footer: Hours/week, Savings €/month, Payback in months */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
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
            Monthly savings
          </dt>
          <dd
            className={`mt-0.5 font-mono text-base font-bold ${
              job.savings_eur_month > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-slate-500 dark:text-slate-500"
            }`}
          >
            €{job.savings_eur_month}/mo
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Payback period
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            {job.payback_months !== null ? `${job.payback_months} mo` : "—"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const jobsData = useSyncExternalStore(
    subscribeJobsStorage,
    getJobsClientSnapshot,
    getJobsServerSnapshot,
  );
  const [hiringJob, setHiringJob] = useState<Job | null>(null);

  const sortedJobs = useMemo(
    () => [...jobsData.jobs].sort((a, b) => b.score - a.score),
    [jobsData.jobs],
  );

  async function handleHire(job: Job) {
    if (hiringJob !== null) return;
    setHiringJob(job);

    const scene = getActiveScene();
    let scenario: Scenario | null = null;

    try {
      const response = await fetch("/api/scenario", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          job,
          scene,
          businessType: jobsData.business_type,
        }),
      });

      if (response.ok) {
        const data = (await response.json()) as unknown;
        const candidate =
          typeof data === "object" &&
          data !== null &&
          "scenario" in data
            ? (data as { scenario: unknown }).scenario
            : data;

        if (isScenario(candidate)) {
          const validSteps = filterValidSteps(
            candidate.steps,
            scene.zones.map((z) => z.id),
          );
          if (validSteps.length > 0) {
            scenario = { job_id: candidate.job_id, steps: validSteps };
          }
        }
      }
    } catch {
      // Gracefully fall back to matching mock scenario below
    }

    if (!scenario) {
      scenario = buildFallbackScenario(job, scene);
    }

    try {
      window.localStorage.setItem("robohire:scene", JSON.stringify(scene));
      window.localStorage.setItem(
        "robohire:scenario",
        JSON.stringify(scenario),
      );
      window.localStorage.setItem("robohire:job", JSON.stringify(job));
    } catch {
      // Ignore storage quota errors
    }

    router.push("/robot");
  }

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
              Ranked by capability fit score (0–100), weekly hours, estimated
              monthly savings, and payback period.
            </p>
          </div>
        </div>

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
              isHiring={hiringJob?.id === job.id}
              isAnyHiring={hiringJob !== null}
              onHire={handleHire}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
