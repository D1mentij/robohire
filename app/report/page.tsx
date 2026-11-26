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
import { getRobotSpec, inferRobotType } from "@/lib/robots/catalog";
import {
  isJobsResult,
  isRobotPlan,
  isScene,
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
  const { jobs, plan, scene } = data;
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
            Commercial RaaS Feasibility Report — {data.businessType}
          </h1>
          <p className="text-slate-600">
            {date} · RoboHire 15-Model Commercial Catalog vs Latvia 2026 VSAOI
            Labor
            {data.demo && (
              <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-800">
                preset benchmark
              </span>
            )}
          </p>
        </header>

        <section>
          <h2 className="mb-2 text-lg font-bold">
            Top Recommended Deployment
            {topSpec ? `: ${topSpec.name}` : ""}
          </h2>
          {!topJob ? (
            <p>
              None of the 15 commercial models yields positive monthly savings at
              the current shift configuration.
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                ["Monthly Savings", `${eur(topJob.savings_eur_month)}/mo`],
                [
                  "Client RaaS",
                  `${eur(topJob.client_raas_eur ?? topSpec?.clientRaaSEur ?? 0)}/mo`,
                ],
                [
                  "Latvia Staff Cost",
                  `${eur(topJob.human_monthly_cost_eur ?? 0)}/mo`,
                ],
                [
                  "Purchase Price",
                  eur(topJob.purchase_price_eur ?? topSpec?.purchasePriceEur ?? 0),
                ],
              ].map(([k, v]) => (
                <div key={k} className="rounded border border-slate-300 p-2">
                  <div className="text-xs text-slate-600">{k}</div>
                  <div className="font-bold">{v}</div>
                </div>
              ))}
            </div>
          )}
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
                <th className={th}>RaaS / mo</th>
                <th className={th}>LV Staff / mo</th>
                <th className={`${th} text-right`}>Savings / mo</th>
              </tr>
            </thead>
            <tbody>
              {jobs.jobs.map((j) => {
                const sp = getRobotSpec(inferRobotType(j));
                return (
                  <tr key={j.id}>
                    <td className={`${td} font-semibold`}>{sp.name}</td>
                    <td className={td}>{sp.category}</td>
                    <td className={td}>
                      {FIT_LABEL[j.fit]} ({j.score})
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {eur(j.client_raas_eur ?? sp.clientRaaSEur)}
                    </td>
                    <td className={`${td} tabular-nums`}>
                      {eur(j.human_monthly_cost_eur ?? 0)}
                    </td>
                    <td className={`${td} text-right tabular-nums font-semibold`}>
                      {eur(j.savings_eur_month)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

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
            Economic &amp; Brokerage Methodology
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
        </footer>
      </article>
    </main>
  );
}
