"use client";

import { useMemo, useSyncExternalStore } from "react";
import { buildK1Scenario } from "@/lib/executor/loadScenarioData";
import { SafetyCheckPanel } from "@/components/SafetyCheckPanel";
import { scriptFileName, toBoosterScript } from "@/lib/k1export/toBoosterScript";
import { filterValidSteps, isScenario, isScene, type Job, type Scenario, type Scene } from "@/types/contracts";

const noopSubscribe = () => () => {};
const readHandoff = (): string => {
  try {
    return JSON.stringify([sessionStorage.getItem("robohire:scenario"), sessionStorage.getItem("robohire:scene")]);
  } catch {
    return "[null,null]";
  }
};

/** The hired K1 scenario (+ its scene) from the /jobs → /robot handoff, else the code-built K1 greeter routine. */
function pickScenario(raw: string | null, scene: Scene, k1: Job): { scenario: Scenario; scene: Scene; source: string } {
  try {
    const [sc, sn] = (JSON.parse(raw ?? "[null,null]") as (string | null)[]).map((v) => (v ? JSON.parse(v) : null));
    const s: Scene = isScene(sn) && sn.zones.length > 0 ? sn : scene;
    if (isScenario(sc) && sc.job_id === k1.id) {
      const steps = filterValidSteps(sc.steps, s.zones.map((z) => z.id));
      if (steps.length > 0) return { scenario: { ...sc, steps }, scene: s, source: "your hired K1 job" };
    }
  } catch {
    /* fall through */
  }
  return { scenario: buildK1Scenario(k1, scene), scene, source: "the K1 greeter & guide job (same routine as the 3D simulation)" };
}

export function K1Export({ scene, k1, businessType }: { scene: Scene; k1: Job; businessType: string }) {
  const raw = useSyncExternalStore(noopSubscribe, readHandoff, () => null);
  const { script, fileName, source, steps, scenario, scn } = useMemo(() => {
    const picked = pickScenario(raw, scene, k1);
    return {
      script: toBoosterScript(picked.scenario, picked.scene, { businessType, what: k1.title }),
      fileName: scriptFileName(picked.scenario),
      source: picked.source,
      steps: picked.scenario.steps.length,
      scenario: picked.scenario,
      scn: picked.scene,
    };
  }, [raw, scene, k1, businessType]);

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
    <>
    <SafetyCheckPanel scenario={scenario} scene={scn} />
    <section data-testid="k1-export">
      <h2 className="mb-2 text-lg font-bold">Export for real K1</h2>
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
      <p data-testid="k1-not-run-note" className="mt-1 text-xs text-slate-600">Not yet run on a physical K1 — next step at RTU AI Studio.</p>
      <pre className="no-print mt-2 max-h-80 overflow-auto rounded border border-slate-300 bg-slate-50 p-3 font-mono text-[11px] leading-snug text-slate-800">{script}</pre>
    </section>
    </>
  );
}
