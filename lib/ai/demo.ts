import { mockJobs, mockScene } from "@/mocks";
import { ANALYSIS_STORAGE_KEY, JOBS_STORAGE_KEY, PLAN_STORAGE_KEY, clearRunStorage, type StoredAnalysis } from "./types";
import { buildPlan } from "@/lib/roi/roi";
import { demoMeta, demoTasks } from "./demoData";
import { findPreset, isAutoDetect } from "./businessPresets";
import { detectBusiness, type BusinessKind } from "./businessTemplates";
import { fixLayout } from "./layout";
import { tasksFromZones } from "./zoneTasks";
import { buildJobs } from "./jobs";
import type { JobsResult, RobotPlan, Scene } from "@/types/contracts";

export type DemoOptions = {
  businessType?: string;
  hoursPerWeek?: number;
  hourlyCost?: number;
};

const AUTO_DETECT_DEMO_SCENE: Scene = {
  room: { width: 10, depth: 8 },
  zones: [
    { id: "entrance", label: "Main entrance", x: 1.3, z: 4.0, w: 1.6, d: 2.2 },
    { id: "desk", label: "Front info desk", x: 5.0, z: 1.5, w: 2.6, d: 1.4 },
    { id: "display", label: "Info & offers board", x: 8.6, z: 1.5, w: 2.0, d: 1.2 },
    { id: "seating", label: "Visitor lounge", x: 5.0, z: 6.0, w: 3.6, d: 2.2 },
    { id: "corridor", label: "Main walkway", x: 8.8, z: 5.0, w: 1.8, d: 2.8 },
  ],
};

function buildCustomDemoScene(businessType: string): Scene {
  const kind = detectBusiness(businessType);
  const seed: Scene = {
    room: { width: 10, depth: 8 },
    zones: [{ id: "entrance", label: "Entrance", x: 1.4, z: 4.0, w: 1.6, d: 2.2 }],
  };
  return fixLayout(seed, kind, 5);
}

/**
 * Builds industry-appropriate demo data (scene, tasks, jobs, plan) for any business type,
 * using the user's opening hours and staff hourly cost for transparent ROI calculations.
 * When called with no arguments, returns the classic Riga café mock dataset.
 */
export function buildDemoData(options?: DemoOptions): {
  analysis: StoredAnalysis;
  jobs: JobsResult;
  plan: RobotPlan;
} {
  const rawType = options?.businessType?.trim();
  const hasCustomOptions =
    Boolean(rawType) ||
    (options?.hoursPerWeek !== undefined && options.hoursPerWeek !== demoMeta.hoursPerWeek) ||
    (options?.hourlyCost !== undefined && options.hourlyCost !== demoMeta.hourlyCost);

  if (!hasCustomOptions) {
    const analysis: StoredAnalysis = { scene: mockScene, tasks: demoTasks, ...demoMeta };
    return {
      analysis,
      jobs: mockJobs,
      plan: buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek),
    };
  }

  const preset = findPreset(rawType);
  const auto = isAutoDetect(rawType);
  const hoursPerWeek =
    options?.hoursPerWeek && options.hoursPerWeek > 0 && options.hoursPerWeek <= 168
      ? options.hoursPerWeek
      : (preset?.defaultHoursPerWeek ?? demoMeta.hoursPerWeek);
  const hourlyCost =
    options?.hourlyCost && options.hourlyCost > 0
      ? options.hourlyCost
      : (preset?.defaultHourlyCost ?? demoMeta.hourlyCost);

  const label = auto
    ? "Auto-detected space (Commercial Lobby)"
    : (preset?.label ?? rawType ?? demoMeta.businessType);

  const scene: Scene = auto
    ? AUTO_DETECT_DEMO_SCENE
    : preset
      ? preset.demoScene
      : buildCustomDemoScene(label);

  // the selected family's templates (preset → its family, custom text → keyword detection EN/LV/RU, auto → generic), not always café
  const family: BusinessKind = preset?.family ?? (auto ? "generic" : detectBusiness(label));
  const { tasks, ratings } = tasksFromZones(scene, [], hoursPerWeek, auto ? "" : label, family);
  const built = buildJobs({
    tasks,
    scene,
    businessType: label,
    hoursPerWeek,
    hourlyCost,
    ratings,
  });

  if (!built.ok) {
    const analysis: StoredAnalysis = { scene: mockScene, tasks: demoTasks, businessType: label, hoursPerWeek, hourlyCost };
    return {
      analysis,
      jobs: { ...mockJobs, business_type: label },
      plan: buildPlan(mockJobs.jobs, hourlyCost, hoursPerWeek),
    };
  }

  const analysis: StoredAnalysis = {
    scene,
    tasks,
    ratings,
    family,
    businessType: label,
    hoursPerWeek,
    hourlyCost,
  };
  return { analysis, jobs: built.jobs, plan: built.plan };
}

/**
 * Writes the demo data into sessionStorage exactly like the real upload flow.
 * Client-side only. The caller navigates afterwards, e.g. router.push("/jobs").
 */
export function startDemo(options?: DemoOptions): void {
  clearRunStorage({ keepUpload: true });
  const { analysis, jobs, plan } = buildDemoData(options);
  sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
}
