"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { mockScene } from "@/mocks";
import {
  filterValidSteps,
  isJobsResult,
  isScene,
  type Fit,
  type Job,
  type JobsResult,
  type RobotPlan,
  type Scenario,
  type Scene,
} from "@/types/contracts";
import { buildPlan } from "@/lib/roi/roi";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
  type StoredAnalysis,
} from "@/lib/ai/types";
import { BUSINESS_PRESETS, findPreset, type BusinessPreset } from "@/lib/ai/businessPresets";
import { tasksFromZones } from "@/lib/ai/zoneTasks";
import { getOrCreateScenario } from "@/lib/ai/scenarioCache";
import {
  LATVIA_2026_LABOR_BENCHMARKS,
  ROBOT_CATEGORY_FILTERS,
  buildRobotScenario,
  evaluateCatalogForSpace,
  getRobotSpec,
  inferRobotType,
  shiftsFromHours,
  type CategoryFilterId,
} from "@/lib/robots/catalog";
import { clearHandoffStorage } from "@/lib/executor";

const SCENARIO_TIMEOUT_MS = 20_000;
const SAVED_CUSTOM_ANALYSIS_KEY = "robohire:savedCustomAnalysis";

type ViewMode = "client" | "broker";

interface SavedCustomAnalysis {
  businessType: string;
  rawAnalysis: string | null;
  rawJobs: string;
  rawPlan: string | null;
  rawScene: string | null;
}

function parseSavedCustomAnalysis(raw: string | null): SavedCustomAnalysis | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedCustomAnalysis> | null;
    if (
      parsed &&
      typeof parsed.businessType === "string" &&
      typeof parsed.rawJobs === "string" &&
      parsed.rawJobs.length > 0
    ) {
      return {
        businessType: parsed.businessType,
        rawAnalysis: typeof parsed.rawAnalysis === "string" ? parsed.rawAnalysis : null,
        rawJobs: parsed.rawJobs,
        rawPlan: typeof parsed.rawPlan === "string" ? parsed.rawPlan : null,
        rawScene: typeof parsed.rawScene === "string" ? parsed.rawScene : null,
      };
    }
  } catch {
    // Ignore malformed backup
  }
  return null;
}

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
      "border-slate-300/70 bg-slate-100/70 opacity-65 grayscale-[30%] dark:border-slate-800 dark:bg-slate-900/40",
  },
};

function matchExactBusinessPreset(
  businessType: string,
  scene: Scene | null,
): BusinessPreset | null {
  for (const preset of BUSINESS_PRESETS) {
    if (businessType !== preset.label) continue;
    if (scene) {
      const sameZones =
        scene.zones.length === preset.demoScene.zones.length &&
        preset.demoScene.zones.every(
          (pz, idx) => scene.zones[idx]?.id === pz.id,
        );
      if (!sameZones) continue;
    }
    return preset;
  }
  return null;
}

interface JobsSnapshot {
  businessType: string;
  scene: Scene;
  hoursPerWeek: number;
  hourlyCost: number;
  baselineHourlyCost: number | null;
  storedShiftsOverride: 1 | 2 | 3 | null;
  hasCustomUpload: boolean;
  activePresetId: string | null;
  savedCustomAnalysis: SavedCustomAnalysis | null;
}

const DEFAULT_PRESET = BUSINESS_PRESETS[0]; // Tight Café / Bistro (~55 cm)

const SERVER_SNAPSHOT: JobsSnapshot = {
  businessType: DEFAULT_PRESET.label,
  scene: DEFAULT_PRESET.demoScene,
  hoursPerWeek: DEFAULT_PRESET.defaultHoursPerWeek,
  hourlyCost: DEFAULT_PRESET.defaultHourlyCost,
  baselineHourlyCost: DEFAULT_PRESET.defaultHourlyCost,
  storedShiftsOverride: null,
  hasCustomUpload: false,
  activePresetId: DEFAULT_PRESET.id,
  savedCustomAnalysis: null,
};

let cachedStorageKey = "";
let cachedSnapshot: JobsSnapshot = SERVER_SNAPSHOT;

function getClientSnapshot(): JobsSnapshot {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const rawJobs = window.sessionStorage.getItem(JOBS_STORAGE_KEY) ?? "";
    const rawAnalysis = window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY) ?? "";
    const rawScene = window.sessionStorage.getItem("robohire:scene") ?? "";
    const rawSavedCustom =
      window.sessionStorage.getItem(SAVED_CUSTOM_ANALYSIS_KEY) ?? "";
    const key = `${rawJobs}|${rawAnalysis}|${rawScene}|${rawSavedCustom}`;

    if (key !== cachedStorageKey) {
      cachedStorageKey = key;

      let parsedJobs: JobsResult | null = null;
      if (rawJobs) {
        try {
          const cand = JSON.parse(rawJobs) as unknown;
          if (isJobsResult(cand)) parsedJobs = cand;
        } catch {
          parsedJobs = null;
        }
      }

      let parsedAnalysis: Partial<StoredAnalysis> | null = null;
      if (rawAnalysis) {
        try {
          parsedAnalysis = JSON.parse(rawAnalysis) as Partial<StoredAnalysis>;
        } catch {
          parsedAnalysis = null;
        }
      }

      let storedScene: Scene | null = isScene(parsedAnalysis?.scene)
        ? parsedAnalysis.scene
        : null;
      if (!storedScene && rawScene) {
        try {
          const candScene = JSON.parse(rawScene) as unknown;
          if (isScene(candScene)) storedScene = candScene;
        } catch {
          storedScene = null;
        }
      }

      const businessType =
        parsedJobs?.business_type ||
        (typeof parsedAnalysis?.businessType === "string" &&
        parsedAnalysis.businessType.trim()
          ? parsedAnalysis.businessType.trim()
          : DEFAULT_PRESET.label);

      const matchedPreset = matchExactBusinessPreset(businessType, storedScene);
      const hasAnyStored =
        parsedJobs !== null ||
        (parsedAnalysis !== null && isScene(parsedAnalysis.scene));
      const hasCustomUpload = matchedPreset === null && hasAnyStored;
      const activePresetId = matchedPreset
        ? matchedPreset.id
        : hasCustomUpload
          ? null
          : DEFAULT_PRESET.id;

      const fallbackPreset = matchedPreset ?? findPreset(businessType) ?? DEFAULT_PRESET;
      const scene: Scene = storedScene ?? fallbackPreset.demoScene ?? mockScene;

      const hoursPerWeek =
        typeof parsedAnalysis?.hoursPerWeek === "number" &&
        parsedAnalysis.hoursPerWeek > 0
          ? parsedAnalysis.hoursPerWeek
          : fallbackPreset.defaultHoursPerWeek;

      const hourlyCost =
        typeof parsedAnalysis?.hourlyCost === "number" &&
        parsedAnalysis.hourlyCost > 0
          ? parsedAnalysis.hourlyCost
          : fallbackPreset.defaultHourlyCost;

      const baselineHourlyCost =
        typeof parsedAnalysis?.baselineHourlyCost === "number" &&
        parsedAnalysis.baselineHourlyCost > 0
          ? parsedAnalysis.baselineHourlyCost
          : fallbackPreset.defaultHourlyCost;

      const storedShiftsOverride =
        parsedAnalysis?.shiftsOverride === 1 ||
        parsedAnalysis?.shiftsOverride === 2 ||
        parsedAnalysis?.shiftsOverride === 3
          ? parsedAnalysis.shiftsOverride
          : null;

      const savedCustomAnalysis = hasCustomUpload
        ? null
        : parseSavedCustomAnalysis(rawSavedCustom);

      cachedSnapshot = {
        businessType,
        scene,
        hoursPerWeek,
        hourlyCost,
        baselineHourlyCost,
        storedShiftsOverride,
        hasCustomUpload,
        activePresetId,
        savedCustomAnalysis,
      };
    }
  } catch {
    cachedSnapshot = SERVER_SNAPSHOT;
  }
  return cachedSnapshot;
}

function getServerSnapshot(): JobsSnapshot {
  return SERVER_SNAPSHOT;
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

function formatEur(n: number): string {
  const abs = Math.abs(Math.round(n)).toLocaleString("en-US");
  return n < 0 ? `-€${abs}` : `€${abs}`;
}

interface JobCardProps {
  job: Job;
  rank: number;
  viewMode: ViewMode;
  isTopRecommended: boolean;
  isHiring: boolean;
  isAnyHiring: boolean;
  onHire: (job: Job) => void;
}

function JobCard({
  job,
  rank,
  viewMode,
  isTopRecommended,
  isHiring,
  isAnyHiring,
  onHire,
}: JobCardProps) {
  const style = FIT_STYLES[job.fit];
  const isNotSuitable = job.fit === "no";
  const canHire = job.fit === "good" || job.fit === "partial";
  const robotType = inferRobotType(job);
  const spec = getRobotSpec(robotType);
  const roleInfo = LATVIA_2026_LABOR_BENCHMARKS[spec.role];

  const clientRaaS = job.client_raas_eur ?? spec.clientRaaSEur;
  const baseRaaS = job.base_raas_eur ?? spec.baseRaaSEur;
  const monthlyComm = job.monthly_commission_eur ?? spec.monthlyCommissionEur;
  const purchasePrice = job.purchase_price_eur ?? spec.purchasePriceEur;
  const saleComm = job.sale_commission_eur ?? spec.saleCommissionEur;
  const shifts = job.shifts_count ?? 1;
  const humanCost =
    job.human_monthly_cost_eur ?? roleInfo.employerMonthlyEur * shifts;
  const monthlySavings = job.savings_eur_month;
  const savingsPct =
    job.savings_pct ??
    Math.round(((humanCost - clientRaaS) / Math.max(1, humanCost)) * 1000) / 10;

  const econ = job.economics;
  const netRent = econ
    ? Math.round(econ.net_rent_eur_month.expected)
    : humanCost - clientRaaS;
  const hoursFreed = econ
    ? Math.round(econ.hours_freed_per_day.expected * 10) / 10
    : null;
  const isCheaper = econ ? netRent > 0 : savingsPct > 0;
  const pctBadgeText = isCheaper
    ? `Rent net +€${netRent.toLocaleString("en-US")}/mo`
    : `Rent loses €${Math.abs(netRent).toLocaleString("en-US")}/mo`;

  const deploymentSubtitle = job.title.includes(" — ")
    ? job.title.split(" — ").slice(1).join(" — ")
    : job.title;

  return (
    <article
      data-testid={`job-card-${spec.id}`}
      data-fit={job.fit}
      data-robot-type={spec.id}
      className={`flex flex-col justify-between rounded-2xl border p-6 transition-colors ${style.cardClass}`}
    >
      <div className="space-y-4">
        {/* Card Header: Badges, Robot Name, Score & Hire CTA */}
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span
                data-testid={`robot-category-${spec.id}`}
                className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold tracking-wide ${spec.badgeClass}`}
              >
                {spec.category}
              </span>
              <span className="rounded-full border border-slate-300/80 bg-slate-100 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                vs {roleInfo.title}
              </span>
              {isTopRecommended && !isNotSuitable && (
                <span className="rounded-full border border-sky-500/50 bg-sky-500/15 px-2.5 py-0.5 text-[11px] font-extrabold text-sky-700 dark:text-sky-300">
                  ★ Top ROI Pick
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-2.5">
              <span className="font-mono text-xs font-bold text-slate-400 dark:text-slate-500">
                #{rank}
              </span>
              <h2
                className={`text-xl font-extrabold tracking-tight ${
                  isNotSuitable
                    ? "text-slate-600 dark:text-slate-400"
                    : "text-slate-900 dark:text-white"
                }`}
              >
                {spec.name}
              </h2>
            </div>
            <p className="text-sm font-semibold text-slate-600 dark:text-slate-300">
              {deploymentSubtitle}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <span
              data-testid={`fit-badge-${spec.id}`}
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
                data-testid={`hire-job-btn-${spec.id}`}
                disabled={isAnyHiring}
                onClick={() => onHire(job)}
                className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-sky-400/60 bg-sky-600 px-4 py-1.5 text-xs font-bold text-white shadow-2xs transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
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

        {/* Fit Score Progress Bar */}
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
          <div
            className={`h-full rounded-full transition-all ${style.scoreBarClass}`}
            style={{ width: `${Math.max(0, Math.min(100, job.score))}%` }}
          />
        </div>

        {/* Cost banner: distributor rent vs value of staff hours freed (not a whole shift) */}
        <div className="rounded-xl border border-slate-200/90 bg-slate-50/90 p-4 dark:border-slate-800 dark:bg-slate-950/70">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Rent:{" "}
                </span>
                <strong className="font-mono text-base font-extrabold text-sky-700 dark:text-sky-300">
                  €{clientRaaS.toLocaleString("en-US")}/mo
                </strong>
              </div>
              <span className="text-xs font-bold text-slate-400">vs</span>
              <div>
                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                  Staff time freed:{" "}
                </span>
                <strong className="font-mono text-base font-extrabold text-slate-900 dark:text-white">
                  €{humanCost.toLocaleString("en-US")}/mo
                </strong>{" "}
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {hoursFreed !== null
                    ? `(~${hoursFreed} h/day, ${shifts} ${shifts === 1 ? "shift" : "shifts"}, incl. 23.59% VSAOI)`
                    : `(${shifts} ${shifts === 1 ? "shift" : "shifts"}, incl. 23.59% VSAOI)`}
                </span>
              </div>
            </div>

            <span
              data-testid={`savings-pct-badge-${spec.id}`}
              className={`rounded-full border px-3 py-1 font-mono text-xs font-extrabold ${
                isCheaper
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                  : "border-rose-500/50 bg-rose-500/15 text-rose-700 dark:text-rose-300"
              }`}
            >
              {pctBadgeText}
            </span>
          </div>
        </div>

        {/* Broker / Partner View Intermediary Economics Drawer */}
        {viewMode === "broker" && (
          <div
            data-testid={`broker-metrics-${spec.id}`}
            className="grid gap-2.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 p-3.5 sm:grid-cols-3 dark:border-indigo-400/30 dark:bg-indigo-950/40"
          >
            <div>
              <div className="text-[11px] font-semibold text-indigo-800/80 dark:text-indigo-300">
                Distributor Rent
              </div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-slate-900 dark:text-white">
                €{baseRaaS.toLocaleString("en-US")}/mo
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-indigo-800/80 dark:text-indigo-300">
                15% Referral Fee (assumption: paid by distributor)
              </div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-emerald-700 dark:text-emerald-300">
                +€{monthlyComm.toLocaleString("en-US")}/mo
              </div>
            </div>
            <div>
              <div className="text-[11px] font-semibold text-indigo-800/80 dark:text-indigo-300">
                7% Sale Referral (assumption: paid by distributor)
              </div>
              <div className="mt-0.5 font-mono text-sm font-extrabold text-indigo-700 dark:text-indigo-200">
                +€{saleComm.toLocaleString("en-US")} one-time
              </div>
            </div>
          </div>
        )}

        {/* Why it fits & Physical / Economic Limitations */}
        <div className="grid gap-3 pt-0.5 sm:grid-cols-2">
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
              Physical / Economic Limitations
            </div>
            <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">
              {job.limits}
            </p>
          </div>
        </div>
      </div>

      {/* Metrics Footer: Monthly Savings, Purchase Price, Min Aisle / Specs */}
      <dl className="mt-5 grid grid-cols-3 gap-3 border-t border-slate-200/80 pt-4 text-center dark:border-slate-800/80">
        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Staff Time Freed / mo
          </dt>
          <dd
            className={`mt-0.5 font-mono text-base font-bold ${
              monthlySavings > 0
                ? "text-emerald-700 dark:text-emerald-400"
                : "text-rose-600 dark:text-rose-400"
            }`}
          >
            {monthlySavings > 0
              ? `+€${monthlySavings.toLocaleString("en-US")}/mo`
              : `${formatEur(monthlySavings)}/mo`}
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Purchase Price
          </dt>
          <dd className="mt-0.5 font-mono text-base font-bold text-slate-900 dark:text-slate-100">
            €{purchasePrice.toLocaleString("en-US")}
          </dd>
        </div>

        <div className="rounded-lg bg-slate-100/80 px-3 py-2 dark:bg-slate-950/60">
          <dt className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
            Min Aisle / Buy Payback
          </dt>
          <dd className="mt-0.5 font-mono text-sm font-bold text-slate-900 dark:text-slate-100">
            {spec.minAisleCm} cm ·{" "}
            {job.payback_months !== null ? `${job.payback_months} mo` : "no payback"}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function JobsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const snapshot = useSyncExternalStore(
    subscribeJobsStorage,
    getClientSnapshot,
    getServerSnapshot,
  );

  const [viewMode, setViewMode] = useState<ViewMode>("client");
  const [selectedCategory, setSelectedCategory] =
    useState<CategoryFilterId>("all");
  const shiftScopeKey = `${pathname}|${snapshot.businessType}|${snapshot.hoursPerWeek}|${snapshot.storedShiftsOverride ?? "auto"}`;
  const [localShiftState, setLocalShiftState] = useState<{
    scopeKey: string;
    shift: 1 | 2 | 3;
  } | null>(null);
  const [hiringJobId, setHiringJobId] = useState<string | null>(null);
  const isHiringRef = useRef(false);

  const localShiftOverride =
    localShiftState && localShiftState.scopeKey === shiftScopeKey
      ? localShiftState.shift
      : null;

  const autoShifts = shiftsFromHours(snapshot.hoursPerWeek);
  const activeShifts: 1 | 2 | 3 =
    localShiftOverride ?? snapshot.storedShiftsOverride ?? autoShifts;

  const effectiveHoursForEval = useMemo(() => {
    if (localShiftOverride === 1) return Math.min(snapshot.hoursPerWeek, 56);
    if (localShiftOverride === 2)
      return snapshot.hoursPerWeek >= 61 && snapshot.hoursPerWeek <= 119
        ? snapshot.hoursPerWeek
        : 96;
    if (localShiftOverride === 3) return Math.max(snapshot.hoursPerWeek, 168);
    return snapshot.hoursPerWeek;
  }, [localShiftOverride, snapshot.hoursPerWeek]);

  const evaluatedJobs = useMemo(
    () =>
      evaluateCatalogForSpace({
        scene: snapshot.scene,
        businessType: snapshot.businessType,
        hoursPerWeek: effectiveHoursForEval,
        hourlyCost: snapshot.hourlyCost,
        shiftsOverride: activeShifts,
        baselineHourlyCost: snapshot.baselineHourlyCost,
      }),
    [
      snapshot.scene,
      snapshot.businessType,
      effectiveHoursForEval,
      snapshot.hourlyCost,
      activeShifts,
      snapshot.baselineHourlyCost,
    ],
  );

  const computedPlan = useMemo(
    () =>
      buildPlan(evaluatedJobs, snapshot.hourlyCost, effectiveHoursForEval),
    [evaluatedJobs, snapshot.hourlyCost, effectiveHoursForEval],
  );

  // Keep sessionStorage robohire:jobs & robohire:plan synced with live shift toggles
  useEffect(() => {
    try {
      const jobsPayload: JobsResult = {
        business_type: snapshot.businessType,
        jobs: evaluatedJobs,
      };
      window.sessionStorage.setItem(
        JOBS_STORAGE_KEY,
        JSON.stringify(jobsPayload),
      );
      window.sessionStorage.setItem(
        PLAN_STORAGE_KEY,
        JSON.stringify(computedPlan),
      );
      if (snapshot.hasCustomUpload) {
        window.sessionStorage.removeItem(SAVED_CUSTOM_ANALYSIS_KEY);
      }
    } catch {
      // Ignore storage quota errors
    }
  }, [
    snapshot.businessType,
    snapshot.hasCustomUpload,
    evaluatedJobs,
    computedPlan,
  ]);

  const categoryCounts = useMemo(() => {
    const map: Record<CategoryFilterId, number> = {
      all: evaluatedJobs.length,
      "HoReCa Delivery": 0,
      "Greeting & Retail": 0,
      "Hotel & Office Delivery": 0,
      "Commercial Cleaning": 0,
      "Industrial Cleaning": 0,
      "Warehouse & Factory AMR": 0,
      "General Service & Reception": 0,
    };
    for (const j of evaluatedJobs) {
      const spec = getRobotSpec(inferRobotType(j));
      map[spec.category] += 1;
    }
    return map;
  }, [evaluatedJobs]);

  const filteredJobs = useMemo(() => {
    if (selectedCategory === "all") return evaluatedJobs;
    return evaluatedJobs.filter(
      (j) => getRobotSpec(inferRobotType(j)).category === selectedCategory,
    );
  }, [evaluatedJobs, selectedCategory]);

  const topRecommendedJob = useMemo(
    () =>
      evaluatedJobs.find((j) => j.fit !== "no" && j.savings_eur_month > 0) ??
      null,
    [evaluatedJobs],
  );

  const topSpec = topRecommendedJob
    ? getRobotSpec(inferRobotType(topRecommendedJob))
    : null;

  function handleSelectPreset(preset: BusinessPreset) {
    if (hiringJobId !== null) return;
    setSelectedCategory("all");
    setLocalShiftState(null);

    try {
      if (snapshot.hasCustomUpload) {
        const rawJobs = window.sessionStorage.getItem(JOBS_STORAGE_KEY);
        if (rawJobs) {
          const backup: SavedCustomAnalysis = {
            businessType: snapshot.businessType,
            rawAnalysis: window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY),
            rawJobs,
            rawPlan: window.sessionStorage.getItem(PLAN_STORAGE_KEY),
            rawScene: window.sessionStorage.getItem("robohire:scene"),
          };
          window.sessionStorage.setItem(
            SAVED_CUSTOM_ANALYSIS_KEY,
            JSON.stringify(backup),
          );
        }
      }

      clearHandoffStorage();
      const { tasks, ratings } = tasksFromZones(
        preset.demoScene,
        [],
        preset.defaultHoursPerWeek,
        preset.label,
        preset.family,
      );
      const nextJobs = evaluateCatalogForSpace({
        scene: preset.demoScene,
        businessType: preset.label,
        hoursPerWeek: preset.defaultHoursPerWeek,
        hourlyCost: preset.defaultHourlyCost,
        baselineHourlyCost: preset.defaultHourlyCost,
      });
      const jobsResult: JobsResult = {
        business_type: preset.label,
        jobs: nextJobs,
      };
      const nextPlan: RobotPlan = buildPlan(
        nextJobs,
        preset.defaultHourlyCost,
        preset.defaultHoursPerWeek,
      );
      const analysisPayload: StoredAnalysis = {
        scene: preset.demoScene,
        tasks,
        ratings,
        family: preset.family,
        businessType: preset.label,
        hoursPerWeek: preset.defaultHoursPerWeek,
        hourlyCost: preset.defaultHourlyCost,
        baselineHourlyCost: preset.defaultHourlyCost,
        shiftsOverride: null,
      };

      window.sessionStorage.setItem(
        ANALYSIS_STORAGE_KEY,
        JSON.stringify(analysisPayload),
      );
      window.sessionStorage.setItem(
        JOBS_STORAGE_KEY,
        JSON.stringify(jobsResult),
      );
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(nextPlan));
      const sceneJson = JSON.stringify(preset.demoScene);
      window.sessionStorage.setItem("robohire:scene", sceneJson);
      window.localStorage.setItem("robohire:scene", sceneJson);
      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage errors
    }
  }

  function handleRestoreCustomAnalysis() {
    if (hiringJobId !== null || !snapshot.savedCustomAnalysis) return;
    setLocalShiftState(null);
    try {
      const saved = snapshot.savedCustomAnalysis;
      clearHandoffStorage();
      window.sessionStorage.setItem(JOBS_STORAGE_KEY, saved.rawJobs);
      if (saved.rawPlan) {
        window.sessionStorage.setItem(PLAN_STORAGE_KEY, saved.rawPlan);
      }
      if (saved.rawAnalysis) {
        window.sessionStorage.setItem(ANALYSIS_STORAGE_KEY, saved.rawAnalysis);
      }
      if (saved.rawScene) {
        window.sessionStorage.setItem("robohire:scene", saved.rawScene);
        window.localStorage.setItem("robohire:scene", saved.rawScene);
      }
      window.sessionStorage.removeItem(SAVED_CUSTOM_ANALYSIS_KEY);
      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage errors
    }
  }

  function handleShiftChange(nextShift: 1 | 2 | 3) {
    setLocalShiftState({ scopeKey: shiftScopeKey, shift: nextShift });
    try {
      const raw = window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as StoredAnalysis;
        parsed.shiftsOverride = nextShift;
        window.sessionStorage.setItem(
          ANALYSIS_STORAGE_KEY,
          JSON.stringify(parsed),
        );
      }
    } catch {
      // Ignore storage errors
    }
  }

  function persistHandoff(
    targetScene: Scene,
    targetScenario: Scenario,
    targetJob: Job,
  ) {
    try {
      const jobsResult: JobsResult = {
        business_type: snapshot.businessType,
        jobs: evaluatedJobs,
      };
      const sceneJson = JSON.stringify(targetScene);
      const scenarioJson = JSON.stringify(targetScenario);
      const jobJson = JSON.stringify(targetJob);
      const planJson = JSON.stringify(computedPlan);
      const jobsJson = JSON.stringify(jobsResult);

      window.sessionStorage.setItem("robohire:scene", sceneJson);
      window.sessionStorage.setItem("robohire:scenario", scenarioJson);
      window.sessionStorage.setItem("robohire:job", jobJson);
      window.sessionStorage.setItem(PLAN_STORAGE_KEY, planJson);
      window.sessionStorage.setItem(JOBS_STORAGE_KEY, jobsJson);

      window.localStorage.setItem("robohire:scene", sceneJson);
      window.localStorage.setItem("robohire:scenario", scenarioJson);
      window.localStorage.setItem("robohire:job", jobJson);

      window.dispatchEvent(new Event("robohire:storage"));
    } catch {
      // Ignore storage errors
    }
  }

  async function handleHireJob(job: Job) {
    if (isHiringRef.current || hiringJobId !== null) return;
    isHiringRef.current = true;
    setHiringJobId(job.id);

    try {
      clearHandoffStorage();
      const robotType = inferRobotType(job);
      let scenario: Scenario | null = null;

      try {
        const { scenario: candidate } = await getOrCreateScenario(
          job,
          snapshot.scene,
          {
            businessType: snapshot.businessType,
            timeoutMs: SCENARIO_TIMEOUT_MS,
          },
        );
        const validSteps = filterValidSteps(
          candidate.steps,
          snapshot.scene.zones.map((z) => z.id),
        );
        if (validSteps.length > 0) {
          scenario = { job_id: candidate.job_id, steps: validSteps };
        }
      } catch {
        // Fallback to archetype scenario builder
      }

      if (!scenario) {
        scenario = buildRobotScenario(robotType, job, snapshot.scene);
      }

      persistHandoff(snapshot.scene, scenario, job);
      router.push("/robot");
    } finally {
      isHiringRef.current = false;
      setHiringJobId(null);
    }
  }

  const suitableCount = evaluatedJobs.filter((j) => j.fit === "good").length;
  const partialCount = evaluatedJobs.filter((j) => j.fit === "partial").length;
  const notSuitableCount = evaluatedJobs.filter((j) => j.fit === "no").length;

  return (
    <main className="flex-1 bg-slate-50 px-4 py-8 text-slate-900 transition-colors dark:bg-slate-950 dark:text-slate-100 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        {/* Page Header + Client View vs Broker / Partner View Toggle */}
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-5 dark:border-slate-800">
          <div className="max-w-2xl">
            <span className="inline-block rounded-full border border-sky-500/40 bg-sky-500/10 px-3 py-0.5 font-mono text-xs font-semibold text-sky-700 dark:text-sky-300">
              Step 2 of 3 • {snapshot.businessType}
            </span>
            <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
              15-Robot Commercial Catalog: Rent vs Buy
            </h1>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
              Each robot frees a few staff hours per day — not a whole shift.
              We value those hours at verified 2026 Latvia employer cost (gross
              wage + 23.59% VSAOI) and compare with distributor rent or purchase.
            </p>
          </div>

          {/* Client View vs Broker / Partner View Segmented Toggle */}
          <div className="flex flex-col items-end gap-2">
            <div
              role="group"
              aria-label="Pricing View Mode"
              className="inline-flex rounded-xl border border-slate-300 bg-slate-100 p-1 shadow-2xs dark:border-slate-700 dark:bg-slate-900"
            >
              <button
                type="button"
                data-testid="view-mode-client"
                onClick={() => setViewMode("client")}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  viewMode === "client"
                    ? "bg-sky-600 text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                Client View
              </button>
              <button
                type="button"
                data-testid="view-mode-broker"
                onClick={() => setViewMode("broker")}
                className={`cursor-pointer rounded-lg px-3.5 py-1.5 text-xs font-bold transition ${
                  viewMode === "broker"
                    ? "bg-indigo-600 text-white shadow-xs"
                    : "text-slate-700 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
                }`}
              >
                Broker / Partner View
              </button>
            </div>
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              {viewMode === "broker"
                ? "Showing referral fees (assumption: paid by distributor)"
                : "Showing client rent (no markup) & staff hours freed"}
            </span>
          </div>
        </div>

        {/* Broker / Partner View Summary Banner */}
        {viewMode === "broker" && (
          <section
            data-testid="broker-summary-banner"
            className="rounded-2xl border-2 border-indigo-500/50 bg-indigo-500/10 p-5 shadow-sm dark:border-indigo-400/40 dark:bg-indigo-950/35"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="inline-flex items-center gap-2 rounded-full border border-indigo-500/40 bg-indigo-500/15 px-3 py-0.5 text-xs font-bold text-indigo-800 dark:text-indigo-200">
                  RoboHire Partner Model — assumption: referral fee paid by distributor
                </div>
                <h2 className="text-lg font-extrabold text-slate-900 dark:text-white">
                  15% of Monthly Rent • 7% of Sale Price (referral)
                </h2>
                <p className="text-xs text-slate-700 dark:text-slate-300">
                  US list prices converted at <code>1 EUR = 1.096 USD</code>. The
                  client pays the distributor&apos;s rent with no markup; the
                  referral fee is an assumption, paid by the distributor.
                </p>
              </div>

              {topSpec && topRecommendedJob && (
                <div className="flex flex-wrap gap-3">
                  <div className="rounded-xl border border-indigo-500/30 bg-white/90 px-4 py-2.5 dark:bg-slate-900/90">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Top Deal ({topSpec.shortName}) Referral Fee
                    </div>
                    <div className="font-mono text-base font-extrabold text-emerald-700 dark:text-emerald-400">
                      +€{topSpec.monthlyCommissionEur}/mo recurring
                    </div>
                  </div>
                  <div className="rounded-xl border border-indigo-500/30 bg-white/90 px-4 py-2.5 dark:bg-slate-900/90">
                    <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                      Or 7% Direct Sale Fee
                    </div>
                    <div className="font-mono text-base font-extrabold text-indigo-700 dark:text-indigo-300">
                      +€{topSpec.saleCommissionEur.toLocaleString("en-US")} once
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>
        )}

        {/* Space / Business Preset Switcher + Operating Shifts Bar */}
        <section
          aria-label="Business Space Presets"
          data-testid="space-preset-tabs"
          className="space-y-3.5 rounded-2xl border border-slate-200 bg-white p-4 shadow-2xs transition-colors dark:border-slate-800 dark:bg-slate-900"
        >
          {snapshot.hasCustomUpload && (
            <div
              data-testid="custom-analysis-banner"
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3.5 py-2 text-xs font-semibold text-emerald-800 dark:text-emerald-200"
            >
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Showing your analyzed space:{" "}
                <strong className="font-bold">{snapshot.businessType}</strong>
              </span>
              <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-300">
                {snapshot.scene.room.width}m × {snapshot.scene.room.depth}m •{" "}
                {snapshot.scene.zones.length} zones
              </span>
            </div>
          )}

          {!snapshot.hasCustomUpload && snapshot.savedCustomAnalysis && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/40 bg-sky-500/10 px-3.5 py-2 text-xs text-sky-900 dark:text-sky-200">
              <span className="font-medium">
                Previewing preset benchmark. Your video analysis is saved.
              </span>
              <button
                type="button"
                data-testid="back-to-my-analysis-btn"
                disabled={hiringJobId !== null}
                onClick={handleRestoreCustomAnalysis}
                className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-sky-500/50 bg-sky-600 px-3 py-1 text-xs font-bold text-white shadow-2xs transition hover:bg-sky-500"
              >
                ← Back to my analysis (
                {snapshot.savedCustomAnalysis.businessType})
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 px-1">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                SMB, Mid-Market &amp; Enterprise Venue Presets
              </span>
              <span className="ml-2 font-mono text-xs text-slate-500 dark:text-slate-400">
                ({snapshot.scene.room.width}m × {snapshot.scene.room.depth}m •{" "}
                {snapshot.scene.zones.length} zones)
              </span>
            </div>

            {/* Live Multi-Shift Toggle (1, 2, or 3 Shifts) */}
            <div
              className="flex flex-wrap items-center gap-1.5"
              role="group"
              aria-label="Operating Shifts"
            >
              <span className="mr-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                Operating Shifts:
              </span>
              {([1, 2, 3] as const).map((sh) => {
                const active = activeShifts === sh;
                return (
                  <button
                    key={sh}
                    type="button"
                    data-testid={`jobs-shift-${sh}`}
                    onClick={() => handleShiftChange(sh)}
                    className={`cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
                      active
                        ? "border-sky-500 bg-sky-600 text-white shadow-2xs"
                        : "border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                  >
                    {sh === 3 ? "3 Shifts (24/7)" : `${sh} Shift${sh > 1 ? "s" : ""}`}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            role="tablist"
            className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5"
          >
            {BUSINESS_PRESETS.map((preset) => {
              const isSelected =
                !snapshot.hasCustomUpload &&
                snapshot.activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  data-testid={`space-preset-${preset.id}`}
                  disabled={hiringJobId !== null}
                  onClick={() => handleSelectPreset(preset)}
                  className={`flex cursor-pointer flex-col items-start rounded-xl border px-3 py-2 text-left transition active:scale-[0.98] disabled:cursor-wait ${
                    isSelected
                      ? "border-sky-500 bg-sky-500/10 text-sky-900 shadow-2xs ring-1 ring-sky-500/40 dark:border-sky-400 dark:bg-sky-500/15 dark:text-white"
                      : "border-slate-200 bg-slate-50/80 text-slate-700 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-950/60 dark:text-slate-300 dark:hover:border-slate-700 dark:hover:bg-slate-800/70"
                  }`}
                >
                  <span className="line-clamp-1 text-xs font-bold">
                    {preset.shortLabel}
                  </span>
                  <span className="mt-0.5 font-mono text-[10px] text-slate-500 dark:text-slate-400">
                    {preset.defaultShifts}sh · €
                    {preset.defaultHourlyCost.toFixed(2)}/h
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* Top Recommended Robot Summary Panel */}
        {topRecommendedJob && topSpec && (
          <section
            data-testid="robot-plan-panel"
            className="rounded-2xl border-2 border-sky-500/50 bg-white p-5 shadow-md transition-colors dark:border-sky-500/40 dark:bg-slate-900"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-sky-500/40 bg-sky-500/15 px-3 py-0.5 text-xs font-bold text-sky-700 dark:text-sky-300">
                    Best Match for {snapshot.businessType}
                  </span>
                  <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {suitableCount} Suitable · {partialCount} Partial ·{" "}
                    {notSuitableCount} Not Suitable
                  </span>
                </div>
                <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                  Recommended: {topSpec.name} — €{topSpec.rentEurMonth}/mo rent
                </h2>
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Frees{" "}
                  {topRecommendedJob.economics
                    ? `~${Math.round(topRecommendedJob.economics.hours_freed_per_day.expected * 10) / 10} h/day`
                    : "staff hours"}{" "}
                  (€{topRecommendedJob.savings_eur_month.toLocaleString("en-US")}
                  /mo of staff time) → rent net{" "}
                  <strong className="font-mono text-emerald-700 dark:text-emerald-400">
                    €
                    {Math.round(
                      topRecommendedJob.economics?.net_rent_eur_month.expected ??
                        topRecommendedJob.savings_eur_month -
                          topSpec.rentEurMonth,
                    ).toLocaleString("en-US")}
                    /mo
                  </strong>
                  {topRecommendedJob.payback_months !== null
                    ? `; buy payback ~${topRecommendedJob.payback_months} months`
                    : ""}{" "}
                  ({activeShifts} {activeShifts === 1 ? "shift" : "shifts"}).
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5">
                <Link
                  href="/report"
                  data-testid="download-report-btn"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-2xs transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
                >
                  Business report
                </Link>
                <button
                  type="button"
                  data-testid="hire-plan-btn"
                  disabled={hiringJobId !== null}
                  onClick={() => void handleHireJob(topRecommendedJob)}
                  className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-sky-400/60 bg-sky-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-sky-500 active:scale-95 disabled:cursor-wait disabled:opacity-60"
                >
                  {hiringJobId === topRecommendedJob.id && (
                    <span
                      aria-hidden="true"
                      className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"
                    />
                  )}
                  <span>
                    {hiringJobId === topRecommendedJob.id
                      ? "Hiring…"
                      : `Hire ${topSpec.shortName} in 3D →`}
                  </span>
                </button>
              </div>
            </div>
          </section>
        )}

        {/* Robot Category Filter Pills */}
        <nav
          aria-label="Robot Category Filters"
          data-testid="robot-category-filters"
          className="flex flex-wrap gap-2"
        >
          {ROBOT_CATEGORY_FILTERS.map((f) => {
            const active = selectedCategory === f.id;
            const count = categoryCounts[f.id];
            const pillLabel =
              f.id === "all" ? `All (${count})` : `${f.label} (${count})`;
            return (
              <button
                key={f.id}
                type="button"
                data-testid={`category-filter-${f.id.toLowerCase().replace(/[^a-z0-9]+/g, "_")}`}
                onClick={() => setSelectedCategory(f.id)}
                className={`cursor-pointer rounded-full border px-3.5 py-1.5 text-xs font-bold transition ${
                  active
                    ? "border-sky-500 bg-sky-600 text-white shadow-xs"
                    : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                }`}
              >
                {pillLabel}
              </button>
            );
          })}
        </nav>

        {/* Ranked Robot Cards List */}
        <section aria-label="Evaluated Commercial Robots" className="space-y-4">
          {filteredJobs.map((job, idx) => (
            <JobCard
              key={job.id}
              job={job}
              rank={idx + 1}
              viewMode={viewMode}
              isTopRecommended={topRecommendedJob?.id === job.id}
              isHiring={hiringJobId === job.id}
              isAnyHiring={hiringJobId !== null}
              onHire={(j) => void handleHireJob(j)}
            />
          ))}
        </section>
      </div>
    </main>
  );
}
