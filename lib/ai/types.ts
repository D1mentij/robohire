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

export type AnalysisResult = { scene: Scene; tasks: Task[] };

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
