"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { buildDemoData } from "@/lib/ai/demo";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
  type StoredAnalysis,
} from "@/lib/ai/types";
import { buildPlan } from "@/lib/roi/roi";
import { buildK1Job } from "@/lib/roi/k1";
import { K1_JOB_ID, K1_SPEC, LATVIAN_SELLERS } from "@/src/data/k1";
import { K1Export } from "./K1Export";
import { getRobotSpec, inferRobotType } from "@/lib/robots/catalog";
import { computeRobotEconomics, HOW_WE_CALCULATE } from "@/lib/roi/economics";
import {
  isJobsResult,
  isRobotPlan,
  isScene,
  type Job,
  type JobEconomics,
  type JobsResult,
  type RobotPlan,
  type Scene,
} from "@/types/contracts";

type ReportData = {
  businessType: string;
  hourlyCost: number;
  hoursPerWeek: number | null;
  scene: Scene;
  jobs: JobsResult;
  plan: RobotPlan;
  demo: boolean;
};

const noopSubscribe = () => () => {};
const readRaw = (): string | null => {
  try {
    return JSON.stringify(
      [ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY].map((k) =>
        sessionStorage.getItem(k),
      ),
    );
  } catch {
    return JSON.stringify([null, null, null]);
  }
};

function parse(raw: string): ReportData {
  const demo = (): ReportData => {
    const d = buildDemoData();
    return {
      businessType: d.analysis.businessType,
      hourlyCost: d.analysis.hourlyCost,
      hoursPerWeek: d.analysis.hoursPerWeek,
      scene: d.analysis.scene,
      jobs: d.jobs,
      plan: d.plan,
      demo: true,
    };
  };
  try {
    const [a, j, p] = (JSON.parse(raw) as (string | null)[]).map((v) =>
      v ? JSON.parse(v) : null,
    );
    const analysis = a as Partial<StoredAnalysis> | null;
    if (
      !analysis ||
      !isScene(analysis.scene) ||
      !isJobsResult(j) ||
      j.jobs.length === 0
    )
      return demo();
    const hourlyCost =
      typeof analysis.hourlyCost === "number" && analysis.hourlyCost > 0
        ? analysis.hourlyCost
        : 9.24;
    const hoursPerWeek =
      typeof analysis.hoursPerWeek === "number" && analysis.hoursPerWeek > 0
        ? analysis.hoursPerWeek
        : null;
    return {
      businessType: j.business_type || analysis.businessType || "Facility",
      hourlyCost,
      hoursPerWeek,
      scene: analysis.scene,
      jobs: j,
      plan: isRobotPlan(p)
        ? p
        : buildPlan(j.jobs, hourlyCost, hoursPerWeek ?? undefined),
      demo: false,
    };
  } catch {
    return demo();
  }
}

const eur = (n: number) => {
  const abs = Math.abs(Math.round(n)).toLocaleString("en-US");
  return n < 0 ? `-€${abs}` : `€${abs}`;
};
const h1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);
const months = (n: number | null) => (n === null ? "never" : h1(n));
const verifiedDate = (iso: string) => {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
};
/** Economics from the job, or recomputed for data stored before 2026-11-27. */
function econOf(j: Job, scene: Scene): JobEconomics {
  return j.economics ?? computeRobotEconomics(getRobotSpec(inferRobotType(j)), scene);
}
function paybackRange(e: JobEconomics): string {
  const { low, high } = e.payback_months;
  if (high === null) return "no payback";
  if (low === null) return `from ${h1(high)} months (may never pay back)`;
  return `${h1(high)}–${h1(low)} months`;
}

function RobotMoney({ j, scene }: { j: Job; scene: Scene }) {
  const sp = getRobotSpec(inferRobotType(j));
  const e = econOf(j, scene);
  const hf = e.hours_freed_per_day;
  return (
    <div className="rounded border border-slate-300 p-3" data-testid={`report-robot-${sp.id}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="font-bold">
          {sp.name}{" "}
          <span className="font-normal text-slate-600">
            · {FIT_LABEL[j.fit]} ({j.score})
          </span>
        </div>
        <div className="text-xs text-slate-600">
          Hours freed: {h1(hf.low)}–{h1(hf.high)} h/day (expected {h1(hf.expected)}) ≈{" "}
          {eur(e.savings_eur_month.low)}–{eur(e.savings_eur_month.high)}/mo of staff time
        </div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="rounded bg-slate-50 p-2">
          <span className="font-semibold">Rent:</span> {eur(e.rent_eur_month)}/mo → net{" "}
          <b>{eur(e.net_rent_eur_month.expected)}/mo</b>{" "}
          <span className="text-xs text-slate-600">
            ({eur(e.net_rent_eur_month.low)} to {eur(e.net_rent_eur_month.high)})
          </span>
        </div>
        <div className="rounded bg-slate-50 p-2">
          <span className="font-semibold">Buy:</span> {eur(e.purchase_price_eur)} ex VAT →
          payback <b>{paybackRange(e)}</b>
          <span className="text-xs text-slate-600">
            {" "}
            (expected {months(e.payback_months.expected)}; 3-yr ROI{" "}
            {Math.round(e.roi_3y.expected * 100)}%)
          </span>
        </div>
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        Price: {e.price_source}. Rent: {e.rent_source === "quote" ? "distributor quote" : "estimate (2.8% of price / month)"}.
        Verified {verifiedDate(e.verified_on)}, reference data, not a quote.
      </p>
    </div>
  );
}

const FIT_LABEL = {
  good: "Suitable",
  partial: "Partial",
  no: "Not Suitable",
} as const;

function FloorPlan({ scene }: { scene: Scene }) {
  const { width, depth } = scene.room;
  const fs = Math.max(width, depth) / 38;
  const fit = (label: string, w: number) => {
    const max = Math.max(3, Math.floor(w / (fs * 0.6)));
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  };
  return (
    <svg
      viewBox={`-0.3 -0.3 ${width + 0.6} ${depth + 0.6}`}
      role="img"
      aria-label="Floor plan, top-down"
      className="h-auto w-full max-w-xl border border-slate-300 bg-white"
    >
      <rect
        x={0}
        y={0}
        width={width}
        height={depth}
        fill="#f8fafc"
        stroke="#475569"
        strokeWidth={fs / 5}
      />
      {scene.zones.map((z) => (
        <g key={z.id}>
          <rect
            x={z.x - z.w / 2}
            y={z.z - z.d / 2}
            width={z.w}
            height={z.d}
            fill="#bae6fd"
            fillOpacity={0.6}
            stroke="#0369a1"
            strokeWidth={fs / 8}
          />
          <text
            x={z.x}
            y={z.z}
            fontSize={fs}
            textAnchor="middle"
            dominantBaseline="middle"
            fill="#0f172a"
          >
            {fit(z.label, z.w)}
          </text>
        </g>
      ))}
      <text
        x={width}
        y={depth + 0.25}
        fontSize={fs * 0.8}
        textAnchor="end"
        fill="#475569"
      >
        {width} × {depth} m
      </text>
    </svg>
  );
}

export default function ReportPage() {
  const raw = useSyncExternalStore(noopSubscribe, readRaw, () => null);
  const data = useMemo(() => (raw ? parse(raw) : null), [raw]);

  if (!data)
    return (
      <main className="flex-1 p-8 text-sm text-slate-600 dark:text-slate-400">
        Loading report…
      </main>
    );
  const { plan, scene } = data;
  // Booster K1 EDU = primary robot; the 15 catalog robots are specialised alternatives.
  const k1 = data.jobs.jobs.find((j) => j.id === K1_JOB_ID) ?? buildK1Job(scene);
  const k1e = k1.economics;
  const jobs: JobsResult = { ...data.jobs, jobs: data.jobs.jobs.filter((j) => j.id !== K1_JOB_ID) };
  const topJob = jobs.jobs.find((j) => j.fit !== "no" && j.savings_eur_month > 0);
  const topSpec = topJob ? getRobotSpec(inferRobotType(topJob)) : null;
  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const th = "border-b border-slate-300 px-2 py-1.5 text-left font-semibold";
  const td = "border-b border-slate-200 px-2 py-1.5 align-top";

  return (
    <main className="report flex-1 bg-slate-200 px-4 py-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm; }
          header, .no-print { display: none !important; }
          html, body { background: #fff !important; color: #0f172a !important; }
          .report-sheet { box-shadow: none !important; margin: 0 !important; max-width: none !important; padding: 0 !important; }
          .report-sheet section, .report-sheet tr { break-inside: avoid; }
        }
      `}</style>
      <div className="no-print mx-auto mb-4 flex max-w-[210mm] flex-wrap items-center justify-between gap-3">
        <Link
          href="/jobs"
          className="text-sm font-semibold text-sky-800 underline"
        >
          ← Back to 15-Robot Comparison
        </Link>
        <button
          type="button"
          onClick={() => window.print()}
          className="cursor-pointer rounded-xl bg-sky-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-500"
        >
          Print / Save as PDF
        </button>
      </div>

      <article className="report-sheet mx-auto max-w-[210mm] space-y-6 bg-white p-8 text-sm leading-relaxed text-slate-900 shadow-lg">
        <header className="border-b-2 border-slate-900 pb-3">
          <h1 className="text-2xl font-extrabold">
            Robot Rent vs Buy Feasibility Report — {data.businessType}
          </h1>
          <p className="text-slate-600">
            {date} · RoboHire 15-model catalog · staff hours freed valued at
            Latvia 2026 employer cost
            {data.demo && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                preset benchmark
              </span>
            )}
          </p>
        </header>

        <section data-testid="k1-best-match" className="rounded border-2 border-slate-900 p-3">
          <h2 className="mb-1 text-lg font-bold">Best match: {K1_SPEC.name} as your next employee</h2>
          <p>{k1.why}</p>
          {k1e && (
            <p className="mt-1 tabular-nums">
              Frees <b>{h1(k1e.hours_freed_per_day.low)}–{h1(k1e.hours_freed_per_day.high)} h/day</b> ·
              worth {eur(k1e.savings_eur_month.low)}–{eur(k1e.savings_eur_month.high)}/mo ·
              RENT: no offer · BUY: {eur(K1_SPEC.purchasePriceInclVatEur)} incl. VAT ({eur(k1e.purchase_price_eur)} ex VAT)
              + {eur(k1e.upkeep_eur_month)}/mo upkeep → payback{" "}
              {months(k1e.payback_months.high)}–{months(k1e.payback_months.low)} mo
            </p>
          )}
          <p className="mt-1 text-xs text-amber-800">Limits: {k1.limits}</p>
          <p className="mt-1 text-xs text-slate-600">
            Price: {K1_SPEC.priceSource}, verified 26.11.2026 — reference data, not a quote. Latvian sellers:{" "}
            {LATVIAN_SELLERS.join(", ")}.
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">
            Specialised alternative — honest comparison
            {topSpec ? `: ${topSpec.name}` : ""}
          </h2>
          {!topJob ? (
            <p>
              None of the 15 commercial models pays off (rent or buy) at the
              current shift configuration.
            </p>
          ) : (
            <div className="space-y-2">
              <RobotMoney j={topJob} scene={scene} />
              {plan.net_savings_eur_month !== undefined && (
                <p className="text-xs text-slate-600">
                  Plan total: rent {eur(plan.running_cost_eur_month)}/mo → net{" "}
                  {eur(plan.net_savings_eur_month)}/mo · or buy{" "}
                  {eur(plan.robot_price_eur)} ex VAT → payback{" "}
                  {plan.payback_months === null ? "never" : `${plan.payback_months} months`}{" "}
                  (expected).
                </p>
              )}
            </div>
          )}
        </section>

        {jobs.jobs.filter((j) => j.fit !== "no" && j !== topJob).length > 0 && (
          <section>
            <h2 className="mb-2 text-lg font-bold">Other Suitable Robots: Rent vs Buy</h2>
            <div className="space-y-2">
              {jobs.jobs
                .filter((j) => j.fit !== "no" && j !== topJob)
                .map((j) => (
                  <RobotMoney key={j.id} j={j} scene={scene} />
                ))}
            </div>
          </section>
        )}

        <section
          data-testid="how-we-calculate"
          className="rounded border border-sky-300 bg-sky-50 p-3"
        >
          <h2 className="mb-1 text-base font-bold">How we calculate</h2>
          <ul className="list-disc space-y-0.5 pl-5 text-xs">
            {HOW_WE_CALCULATE.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">
            All 15 Commercial Models Evaluated
          </h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={th}>Robot</th>
                <th className={th}>Category</th>
                <th className={th}>Fit</th>
                <th className={th}>Hours freed / day</th>
                <th className={th}>Rent → net / mo</th>
                <th className={`${th} text-right`}>Buy → payback</th>
              </tr>
            </thead>
            <tbody>
              {jobs.jobs.map((j) => {
                const sp = getRobotSpec(inferRobotType(j));
                const e = econOf(j, scene);
                return (
                  <tr key={j.id}>
                    <td className={`${td} font-semibold`}>{sp.name}</td>
                    <td className={td}>{sp.category}</td>
                    <td className={td}>
                      {FIT_LABEL[j.fit]} ({j.score})
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {h1(e.hours_freed_per_day.low)}–{h1(e.hours_freed_per_day.high)}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {eur(e.rent_eur_month)} → {eur(e.net_rent_eur_month.expected)}
                    </td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>
                      {eur(e.purchase_price_eur)} → {months(e.payback_months.expected)}
                      {e.payback_months.expected !== null ? " mo" : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <K1Export scene={scene} jobs={jobs} plan={plan} businessType={data.businessType} />

        <section>
          <h2 className="mb-2 text-lg font-bold">Floor Plan</h2>
          {scene.zones.length === 0 ? (
            <p>No zones recorded.</p>
          ) : (
            <FloorPlan scene={scene} />
          )}
          <p className="mt-1 text-xs text-slate-600">
            Top-down view, zones drawn to scale (meters).
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">
            Assumptions
          </h2>
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.assumptions.map((a) => (
              <li key={a}>{a}</li>
            ))}
            {data.hoursPerWeek && (
              <li>Facility operating schedule: {data.hoursPerWeek} h/week.</li>
            )}
          </ul>
        </section>

        <footer className="border-t border-slate-300 pt-2 text-xs text-slate-600">
          Verified Latvia 2026 wage benchmarks sourced from CSB Latvia Q2 2026,
          CV.lv, Algas.lv, and VisiDarbi.lv (gross wage + 23.59% employer VSAOI).
          Robot prices and rents verified 26.11.2026 — reference data, not a quote.
        </footer>
      </article>
    </main>
  );
}
