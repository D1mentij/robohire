import { isJobsResult, isRobotPlan, isScene, type JobsResult, type RobotPlan } from "@/types/contracts";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, clearRunStorage, type StoredAnalysis } from "./types";

/**
 * Showcase = one saved REAL analysis (scene + tasks + ratings + jobs + plan) that can be loaded with no AI at all.
 * Files live in lib/ai/showcase/*.json (read server-side by GET /api/showcase, see showcaseDisk.ts).
 * Create one: run a real analysis, open /upload?dev=1 (dev server only), click "Save as showcase", move the file there.
 */
export type Showcase = { name: string; analysis: StoredAnalysis; jobs: JobsResult; plan: RobotPlan };

export function parseShowcase(raw: unknown): Showcase | null {
  if (typeof raw !== "object" || raw === null) return null;
  const o = raw as Record<string, unknown>;
  const a = o.analysis as Partial<StoredAnalysis> | undefined;
  if (typeof o.name !== "string" || !o.name.trim()) return null;
  if (!a || !isScene(a.scene) || !Array.isArray(a.tasks) || typeof a.businessType !== "string") return null;
  if (!isJobsResult(o.jobs) || o.jobs.jobs.length === 0 || !isRobotPlan(o.plan)) return null;
  return {
    name: o.name.trim().slice(0, 60),
    analysis: { ...(a as StoredAnalysis), hoursPerWeek: Number(a.hoursPerWeek) || 0, hourlyCost: Number(a.hourlyCost) || 0 },
    jobs: o.jobs,
    plan: o.plan,
  };
}

/** Writes the showcase into sessionStorage exactly like a real run (client-side only), then the caller navigates to /jobs. */
export function applyShowcase(s: Showcase): void {
  clearRunStorage({ keepUpload: true });
  sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(s.analysis));
  sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(s.jobs));
  sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(s.plan));
}

export async function fetchShowcases(): Promise<Showcase[]> {
  try {
    const res = await fetch("/api/showcase", { signal: AbortSignal.timeout(5000) });
    const json = (await res.json()) as { showcases?: unknown[] };
    return (json.showcases ?? []).map(parseShowcase).filter((s): s is Showcase => s !== null);
  } catch {
    return [];
  }
}

/** Dev helper: downloads the current run (from sessionStorage) as a showcase JSON file. Returns false if there is no run. */
export function downloadCurrentAsShowcase(name: string): boolean {
  try {
    const s = parseShowcase({
      name,
      analysis: JSON.parse(sessionStorage.getItem(ANALYSIS_STORAGE_KEY) ?? "null"),
      jobs: JSON.parse(sessionStorage.getItem(JOBS_STORAGE_KEY) ?? "null"),
      plan: JSON.parse(sessionStorage.getItem(PLAN_STORAGE_KEY) ?? "null"),
    });
    if (!s) return false;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "showcase";
    const url = URL.createObjectURL(new Blob([JSON.stringify(s, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}
