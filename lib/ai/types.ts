export type UploadData = {
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
  /** JPEG data URLs */
  frames: string[];
};

export const UPLOAD_STORAGE_KEY = "robohire:upload";

import type { Scene } from "@/types/contracts";

export type Task = {
  id: string;
  title: string;
  zone_id: string;
  description: string;
  frequency_per_day: number;
  minutes_each: number;
};

/** How well K1 fits one task. Comes from the AI (same call as the analysis) or from lib/ai/ratings.ts heuristics. */
export type Rating = { id: string; fit: "good" | "partial" | "no"; score: number; why: string; limits: string };

/** `ratings` is optional on the wire: if absent or incomplete, /api/jobs fills the gaps with code heuristics. */
/**
 * `family` = business template family used for labels/tasks (lib/ai/businessTemplates.ts BusinessKind); `familyDetected` = it came from
 * Auto-detect (model guess), so /upload shows "Detected: …" with a dropdown to correct it. Both optional (older stored analyses lack them).
 */
export type AnalysisResult = { scene: Scene; tasks: Task[]; ratings?: Rating[]; family?: string; familyDetected?: boolean };

export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: string };

/** Saved by /upload after a successful analysis. */
export type StoredAnalysis = AnalysisResult & {
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
};

export const ANALYSIS_STORAGE_KEY = "robohire:analysis";

export const JOBS_STORAGE_KEY = "robohire:jobs";

export const PLAN_STORAGE_KEY = "robohire:plan";

/** Handoff keys written by /jobs (Person 2); /upload and the demo must clear them on a new run. */
export const HANDOFF_STORAGE_KEYS = ["robohire:scene", "robohire:scenario", "robohire:job"] as const;

/** Removes results of a previous run so /jobs, /robot and /report never show stale data. */
export function clearRunStorage(opts: { keepUpload?: boolean } = {}): void {
  const keys = [ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, ...HANDOFF_STORAGE_KEYS];
  for (const k of keys) sessionStorage.removeItem(k);
  if (!opts.keepUpload) sessionStorage.removeItem(UPLOAD_STORAGE_KEY);
}
