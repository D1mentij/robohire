import { mockJobs, mockScene } from "@/mocks";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, clearRunStorage, type StoredAnalysis } from "./types";
import { buildPlan } from "@/lib/roi/roi";
import { demoMeta, demoTasks } from "./demoData";

/**
 * Writes the demo data into sessionStorage exactly like the real upload flow.
 * Client-side only. The caller navigates afterwards, e.g. router.push("/jobs").
 */
export function startDemo(): void {
  clearRunStorage({ keepUpload: true });
  const analysis: StoredAnalysis = { scene: mockScene, tasks: demoTasks, ...demoMeta };
  sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(mockJobs));
  sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek)));
}

/** The demo data as plain objects, without touching storage or navigating (used by /report). */
export function buildDemoData() {
  const analysis: StoredAnalysis = { scene: mockScene, tasks: demoTasks, ...demoMeta };
  return { analysis, jobs: mockJobs, plan: buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek) };
}
