import { mockJobs, mockScene } from "@/mocks";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, type StoredAnalysis } from "./types";
import { buildPlan } from "@/lib/roi/roi";
import { demoMeta, demoTasks } from "./demoData";

/**
 * Writes the demo data into sessionStorage exactly like the real upload flow.
 * Client-side only. The caller navigates afterwards, e.g. router.push("/jobs").
 */
export function startDemo(): void {
  const analysis: StoredAnalysis = { scene: mockScene, tasks: demoTasks, ...demoMeta };
  sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(mockJobs));
  sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(buildPlan(mockJobs.jobs, demoMeta.hourlyCost)));
}
