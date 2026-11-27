"use client";

import { useMemo } from "react";
import type { Scenario, Scene } from "@/types/contracts";
import { checkK1Route, type CheckStatus } from "@/lib/k1export/safety";
import { K1_SPEC } from "@/src/data/k1";

const BADGE: Record<CheckStatus, string> = {
  ok: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-200",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-200",
  fail: "bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-200",
};

/** "Safety & navigation check" for the K1 route — shown on /robot and in /report. */
export function SafetyCheckPanel({ scenario, scene, compact = false }: { scenario: Scenario; scene: Scene; compact?: boolean }) {
  const c = useMemo(() => checkK1Route(scenario, scene), [scenario, scene]);
  if (scene.zones.length === 0) return null;
  const n = c.aisle.narrowest;
  const aisleText =
    c.aisle.status === "ok"
      ? `OK — narrowest passage ${n!.widthCm} cm (${n!.between}) ≥ K1 minimum ${c.minAisleCm} cm`
      : c.aisle.status === "fail"
        ? `Too narrow — ${n!.widthCm} cm (${n!.between}) < K1 minimum ${c.minAisleCm} cm`
        : `No passage found in the plan — measure aisles on site (K1 minimum ${c.minAisleCm} cm)`;
  const row = "flex items-start gap-2";
  const pill = (s: CheckStatus, t: string) => (
    <span className={`shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-bold ${BADGE[s]}`}>{t}</span>
  );

  return (
    <section data-testid="safety-check" className={compact ? "text-xs" : "text-sm"}>
      <h2 className={`${compact ? "mb-1.5 text-sm" : "mb-2 text-lg"} font-bold`}>Safety &amp; navigation check</h2>
      <ul className="space-y-1.5">
        <li className={row} data-testid="safety-aisle" data-status={c.aisle.status}>
          {pill(c.aisle.status, c.aisle.status === "ok" ? "OK" : c.aisle.status === "fail" ? "TOO NARROW" : "CHECK")}
          <span>Aisle width: {aisleText}.</span>
        </li>
        <li className={row}>
          {pill(c.routeCrossings.length ? "warn" : "ok", c.routeCrossings.length ? "CHECK" : "OK")}
          <span>
            Route ({c.walkMeters} m):{" "}
            {c.routeCrossings.length ? `straight line passes ${c.routeCrossings.join(", ")} — clear a path or add a waypoint.` : "no zone in the straight walking line."}
          </span>
        </li>
        <li className={row} data-testid="safety-levels">
          {pill(c.levelChanges.length ? "warn" : "ok", c.levelChanges.length ? "FLAG" : "OK")}
          <span>
            Steps, thresholds, elevators:{" "}
            {c.levelChanges.length ? c.levelChanges.map((l) => `${l.zone} — ${l.note}`).join(" ") : "none seen in the plan; confirm the route is step-free on site."}
          </span>
        </li>
        <li className={row} data-testid="safety-crowded">
          {pill(c.crowded.length ? "warn" : "ok", "SLOW")}
          <span>
            Crowded zones (slow / pause zone): {c.crowded.length ? c.crowded.map((z) => z.label).join(", ") : "none in the plan"}.
          </span>
        </li>
      </ul>
      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">
        Checked on the 3D plan estimated from your video, not a measured map. K1 minimum: {K1_SPEC.minAisleSource}.{" "}
        {K1_SPEC.safetyDocSummary}{" "}
        <a href={K1_SPEC.safetyDocUrl} target="_blank" rel="noreferrer" className="underline">
          Source
        </a>
        . Keep an operator next to the real K1.
      </p>
    </section>
  );
}
