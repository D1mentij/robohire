import type { Scene } from "@/types/contracts";

export type UploadData = {
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
  shiftsOverride?: 1 | 2 | 3 | null;
  /** JPEG data URLs */
  frames: string[];
};

export const UPLOAD_STORAGE_KEY = "robohire:upload";

export type Task = {
  id: string;
  title: string;
  zone_id: string;
  description: string;
  frequency_per_day: number;
  minutes_each: number;
};

/** Fit rating for one task from Vision AI or rule-based spatial heuristics. */
export type Rating = {
  id: string;
  fit: "good" | "partial" | "no";
  score: number;
  why: string;
  limits: string;
};

export type AnalysisResult = {
  scene: Scene;
  tasks: Task[];
  ratings?: Rating[];
  family?: string;
  familyDetected?: boolean;
};

export type AnalyzeResponse =
  | { ok: true; result: AnalysisResult }
  | { ok: false; error: string };

/** Saved by /upload after analysis or preset selection. */
export type StoredAnalysis = AnalysisResult & {
  businessType: string;
  hoursPerWeek: number;
  hourlyCost: number;
  baselineHourlyCost?: number;
  shiftsOverride?: 1 | 2 | 3 | null;
};

export const ANALYSIS_STORAGE_KEY = "robohire:analysis";
export const JOBS_STORAGE_KEY = "robohire:jobs";
export const PLAN_STORAGE_KEY = "robohire:plan";

/** Handoff keys written by /jobs -> /robot; cleared on a new run. */
export const HANDOFF_STORAGE_KEYS = [
  "robohire:scene",
  "robohire:scenario",
  "robohire:job",
] as const;

export function clearRunStorage(opts: { keepUpload?: boolean } = {}): void {
  const keys = [
    ANALYSIS_STORAGE_KEY,
    JOBS_STORAGE_KEY,
    PLAN_STORAGE_KEY,
    ...HANDOFF_STORAGE_KEYS,
  ];
  for (const k of keys) {
    try {
      sessionStorage.removeItem(k);
    } catch {
      /* ignore */
    }
  }
  if (!opts.keepUpload) {
    try {
      sessionStorage.removeItem(UPLOAD_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }
}
