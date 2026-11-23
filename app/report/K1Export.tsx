"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buildShiftFallback } from "@/lib/ai/shiftFallback";
import { scriptFileName, toBoosterScript } from "@/lib/k1export/toBoosterScript";
import { filterValidSteps, isScenario, isScene, type JobsResult, type RobotPlan, type Scenario, type Scene } from "@/types/contracts";

const noopSubscribe = () => () => {};
const readHandoff = (): string => {
  try {
    return JSON.stringify([sessionStorage.getItem("robohire:scenario"), sessionStorage.getItem("robohire:scene")]);
  } catch {
    return "[null,null]";
  }
};

/** Last hired scenario (+ its scene) from the /jobs → /robot handoff, else the whole plan as a code-built shift. */
function pickScenario(raw: string | null, scene: Scene, jobs: JobsResult, plan: RobotPlan, businessType: string): { scenario: Scenario; scene: Scene; source: string } {
  try {
    const [sc, sn] = (JSON.parse(raw ?? "[null,null]") as (string | null)[]).map((v) => (v ? JSON.parse(v) : null));
    const s: Scene = isScene(sn) && sn.zones.length > 0 ? sn : scene;
    if (isScenario(sc)) {
      const steps = filterValidSteps(sc.steps, s.zones.map((z) => z.id));
      if (steps.length > 0) return { scenario: { ...sc, steps }, scene: s, source: sc.job_id === "shift" ? "your hired shift" : `your hired job "${sc.job_id}"` };
    }
  } catch {
    /* fall through */
  }
  return { scenario: buildShiftFallback(plan, jobs.jobs, scene, businessType), scene, source: "the recommended plan (built-in shift routine)" };
}

export function K1Export({ scene, jobs, plan, businessType }: { scene: Scene; jobs: JobsResult; plan: RobotPlan; businessType: string }) {
  const raw = useSyncExternalStore(noopSubscribe, readHandoff, () => null);
  const { script, fileName, source, steps } = useMemo(() => {
    const picked = pickScenario(raw, scene, jobs, plan, businessType);
    const titles = plan.job_ids.map((id) => jobs.jobs.find((j) => j.id === id)?.title).filter(Boolean);
    const what = picked.scenario.job_id === "shift" ? `whole shift: ${titles.join(", ") || "no plan jobs"}` : undefined;
    return {
      script: toBoosterScript(picked.scenario, picked.scene, { businessType, what }),
      fileName: scriptFileName(picked.scenario),
      source: picked.source,
      steps: picked.scenario.steps.length,
    };
  }, [raw, scene, jobs, plan, businessType]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([script], { type: "text/x-python;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (scene.zones.length === 0) return null;
  return (
    <section data-testid="k1-export">
      <h2 className="mb-2 text-lg font-bold">Run on a real Booster K1</h2>
      <p>
        The same {steps}-step scenario, exported from {source} as a Python script for the official Booster Robotics SDK
        (<code>booster_robotics_sdk_python</code>). Walking is open-loop (0.5 m/s, stops 0.5 m before each zone). Calls we could not verify
        in Booster&apos;s sources (speech, pointing) are <code>UNVERIFIED_*</code> functions that only print.
      </p>
      <p className="mt-1 font-semibold text-amber-800">Review before running. Keep a safety operator present and the emergency stop ready.</p>
      <div className="no-print mt-2 flex items-center gap-3">
        <button type="button" data-testid="k1-download-py" onClick={download} className="cursor-pointer rounded-lg bg-slate-900 px-4 py-1.5 text-xs font-bold text-white hover:bg-slate-700">
          Download .py
        </button>
        <span className="font-mono text-xs text-slate-600">{fileName}</span>
      </div>
      <pre className="no-print mt-2 max-h-80 overflow-auto rounded border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-snug text-slate-800">{script}</pre>
    </section>
  );
}
