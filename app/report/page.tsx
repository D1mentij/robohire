"use client";

import Link from "next/link";
import { useMemo, useSyncExternalStore } from "react";
import { buildDemoData } from "@/lib/ai/demo";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, type StoredAnalysis } from "@/lib/ai/types";
import { buildPlan } from "@/lib/roi/roi";
import { K1Export } from "./K1Export";
import { isJobsResult, isRobotPlan, isScene, type JobsResult, type RobotPlan, type Scene } from "@/types/contracts";

type ReportData = { businessType: string; hourlyCost: number; hoursPerWeek: number | null; scene: Scene; jobs: JobsResult; plan: RobotPlan; demo: boolean };

const noopSubscribe = () => () => {};
const readRaw = (): string | null => {
  try {
    return JSON.stringify([ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY].map((k) => sessionStorage.getItem(k)));
  } catch {
    return JSON.stringify([null, null, null]);
  }
};

function parse(raw: string): ReportData {
  const demo = (): ReportData => {
    const d = buildDemoData();
    return { businessType: d.analysis.businessType, hourlyCost: d.analysis.hourlyCost, hoursPerWeek: d.analysis.hoursPerWeek, scene: d.analysis.scene, jobs: d.jobs, plan: d.plan, demo: true };
  };
  try {
    const [a, j, p] = (JSON.parse(raw) as (string | null)[]).map((v) => (v ? JSON.parse(v) : null));
    const analysis = a as Partial<StoredAnalysis> | null;
    if (!analysis || !isScene(analysis.scene) || !isJobsResult(j) || j.jobs.length === 0) return demo();
    const hourlyCost = typeof analysis.hourlyCost === "number" && analysis.hourlyCost > 0 ? analysis.hourlyCost : 8.5;
    const hoursPerWeek = typeof analysis.hoursPerWeek === "number" && analysis.hoursPerWeek > 0 ? analysis.hoursPerWeek : null;
    return {
      businessType: j.business_type || analysis.businessType || "Business",
      hourlyCost,
      hoursPerWeek,
      scene: analysis.scene,
      jobs: j,
      plan: isRobotPlan(p) ? p : buildPlan(j.jobs, hourlyCost, hoursPerWeek ?? undefined),
      demo: false,
    };
  } catch {
    return demo();
  }
}

const eur = (n: number) => `€${Math.round(n).toLocaleString("en-GB")}`;
const FIT_LABEL = { good: "Good", partial: "Partial", no: "No" } as const;

function FloorPlan({ scene }: { scene: Scene }) {
  const { width, depth } = scene.room;
  const fs = Math.max(width, depth) / 38;
  const fit = (label: string, w: number) => {
    const max = Math.max(3, Math.floor(w / (fs * 0.6)));
    return label.length > max ? `${label.slice(0, max - 1)}…` : label;
  };
  return (
    <svg viewBox={`-0.3 -0.3 ${width + 0.6} ${depth + 0.6}`} role="img" aria-label="Floor plan, top-down" className="h-auto w-full max-w-xl border border-slate-300 bg-white">
      <rect x={0} y={0} width={width} height={depth} fill="#f8fafc" stroke="#475569" strokeWidth={fs / 5} />
      {scene.zones.map((z) => (
        <g key={z.id}>
          <rect x={z.x - z.w / 2} y={z.z - z.d / 2} width={z.w} height={z.d} fill="#bae6fd" fillOpacity={0.6} stroke="#0369a1" strokeWidth={fs / 8} />
          <text x={z.x} y={z.z} fontSize={fs} textAnchor="middle" dominantBaseline="middle" fill="#0f172a">
            {fit(z.label, z.w)}
          </text>
        </g>
      ))}
      <text x={width} y={depth + 0.25} fontSize={fs * 0.8} textAnchor="end" fill="#475569">
        {width} × {depth} m
      </text>
    </svg>
  );
}

export default function ReportPage() {
  const raw = useSyncExternalStore(noopSubscribe, readRaw, () => null);
  const data = useMemo(() => (raw ? parse(raw) : null), [raw]);

  if (!data) return <main className="flex-1 p-8 text-sm text-slate-600 dark:text-slate-400">Loading report…</main>;
  const { jobs, plan, scene } = data;
  const inPlan = new Set(plan.job_ids);
  const planJobs = jobs.jobs.filter((j) => inPlan.has(j.id));
  const date = new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
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
        <Link href="/upload" className="text-sm font-semibold text-sky-800 underline">← Back to RoboHire</Link>
        <button type="button" onClick={() => window.print()} className="cursor-pointer rounded-xl bg-sky-600 px-5 py-2 text-sm font-bold text-white shadow-sm hover:bg-sky-500">
          Print / Save as PDF
        </button>
      </div>

      <article className="report-sheet mx-auto max-w-[210mm] space-y-6 bg-white p-8 text-sm leading-relaxed text-slate-900 shadow-lg">
        <header className="border-b-2 border-slate-900 pb-3">
          <h1 className="text-2xl font-extrabold">Robot staffing report — {data.businessType}</h1>
          <p className="text-slate-600">
            {date} · Prepared by RoboHire for Booster K1
            {data.demo && <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">demo data</span>}
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-bold">Recommended plan: 1 Booster K1</h2>
          {planJobs.length === 0 ? (
            <p>None of the {jobs.jobs.length} tasks found is worth a robot at current assumptions.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Net savings", `${eur(plan.net_savings_eur_month)}/month`],
                  ["Payback", plan.payback_months !== null ? `${plan.payback_months} months` : "no payback"],
                  ["Robot hours", `${plan.hours_per_week} of ${plan.capacity_hours_per_week} h/week`],
                  ["Robot price", eur(plan.robot_price_eur)],
                ].map(([k, v]) => (
                  <div key={k} className="rounded border border-slate-300 p-2">
                    <div className="text-xs text-slate-600">{k}</div>
                    <div className="font-bold">{v}</div>
                  </div>
                ))}
              </div>
              <p className="mt-2">
                Included jobs: <b>{planJobs.map((j) => j.title).join(", ")}</b>. Gross {eur(plan.gross_savings_eur_month)}/month minus{" "}
                {eur(plan.running_cost_eur_month)}/month running cost.
              </p>
            </>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">All jobs evaluated</h2>
          <table className="w-full border-collapse text-xs">
            <thead>
              <tr>
                <th className={th}>Job</th><th className={th}>Fit</th><th className={th}>Score</th>
                <th className={th}>Why</th><th className={th}>Limits</th><th className={`${th} text-right`}>Gross €/month</th>
              </tr>
            </thead>
            <tbody>
              {jobs.jobs.map((j) => (
                <tr key={j.id}>
                  <td className={`${td} font-semibold`}>{j.title}{inPlan.has(j.id) && <span className="ml-1 text-emerald-700">✓ in plan</span>}</td>
                  <td className={td}>{FIT_LABEL[j.fit]}</td>
                  <td className={td}>{j.score}</td>
                  <td className={td}>{j.why}</td>
                  <td className={td}>{j.limits}</td>
                  <td className={`${td} text-right tabular-nums`}>{eur(j.savings_eur_month)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Floor plan</h2>
          {scene.zones.length === 0 ? <p>No zones recorded.</p> : <FloorPlan scene={scene} />}
          <p className="mt-1 text-xs text-slate-600">Top-down view, zones drawn to scale (meters).</p>
        </section>

        <section>
          <h2 className="mb-2 text-lg font-bold">Assumptions</h2>
          <ul className="list-disc space-y-0.5 pl-5">
            {plan.assumptions.map((a) => <li key={a}>{a}</li>)}
            {data.hoursPerWeek && <li>Business open {data.hoursPerWeek} h/week; task hours and robot capacity are capped at that.</li>}
            <li>Task frequencies and durations are AI estimates from the video, not measurements.</li>
          </ul>
        </section>

        <K1Export scene={scene} jobs={jobs} plan={plan} businessType={data.businessType} />

        <footer className="border-t border-slate-300 pt-2 text-xs text-slate-600">
          Estimates, not financial advice. Fit ratings and task data were generated by AI; all money figures are computed from the assumptions above.
        </footer>
      </article>
    </main>
  );
}
