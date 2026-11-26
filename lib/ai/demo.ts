import { mockJobs, mockScene } from "@/mocks";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
  clearRunStorage,
  type StoredAnalysis,
} from "./types";
import { buildPlan } from "@/lib/roi/roi";
import { demoMeta, demoTasks } from "./demoData";
import { BUSINESS_PRESETS, findPreset, isAutoDetect } from "./businessPresets";
import { detectBusiness, type BusinessKind } from "./businessTemplates";
import { fixLayout } from "./layout";
import { tasksFromZones } from "./zoneTasks";
import { buildJobs } from "./jobs";
import type { JobsResult, RobotPlan, Scene } from "@/types/contracts";

export type DemoOptions = {
  businessType?: string;
  hoursPerWeek?: number;
  hourlyCost?: number;
  baselineHourlyCost?: number;
  shiftsOverride?: 1 | 2 | 3 | null;
};

const AUTO_DETECT_DEMO_SCENE: Scene = {
  room: { width: 12, depth: 9 },
  zones: [
    { id: "entrance", label: "Main Entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.2 },
    { id: "counter", label: "Service & Reception Counter", x: 5.8, z: 1.6, w: 3.0, d: 1.5 },
    { id: "display", label: "Promo & Wayfinding Screen", x: 9.8, z: 1.6, w: 2.2, d: 1.2 },
    { id: "seating", label: "Guest Seating Area", x: 5.6, z: 6.2, w: 4.0, d: 2.4 },
    { id: "corridor", label: "Main Walkway & Elevator Hall", x: 10.4, z: 5.6, w: 1.8, d: 3.0 },
  ],
};

function buildCustomDemoScene(businessType: string): Scene {
  const kind = detectBusiness(businessType);
  const seed: Scene = {
    room: { width: 12, depth: 9 },
    zones: [
      { id: "entrance", label: "Entrance", x: 1.4, z: 4.5, w: 1.6, d: 2.2 },
    ],
  };
  return fixLayout(seed, kind, 5);
}

/**
 * Builds industry-tailored demo data (scene, tasks, 15-robot commercial evaluation, plan)
 * for any SMB, Mid-Market, or Enterprise preset.
 */
export function buildDemoData(options?: DemoOptions): {
  analysis: StoredAnalysis;
  jobs: JobsResult;
  plan: RobotPlan;
} {
  const rawType = options?.businessType?.trim();
  const hasCustomOptions =
    Boolean(rawType) ||
    options?.hoursPerWeek !== undefined ||
    options?.hourlyCost !== undefined ||
    options?.shiftsOverride !== undefined;

  if (!hasCustomOptions) {
    const defaultPreset = BUSINESS_PRESETS[0]; // Tight Café / Bistro (~55 cm Aisles)
    const builtDefault = buildJobs({
      tasks: demoTasks,
      scene: mockScene,
      businessType: defaultPreset.label,
      hoursPerWeek: defaultPreset.defaultHoursPerWeek,
      hourlyCost: defaultPreset.defaultHourlyCost,
      baselineHourlyCost: defaultPreset.defaultHourlyCost,
    });
    const jobsOut = builtDefault.ok ? builtDefault.jobs : mockJobs;
    const planOut = builtDefault.ok
      ? builtDefault.plan
      : buildPlan(mockJobs.jobs, demoMeta.hourlyCost, demoMeta.hoursPerWeek);
    const analysis: StoredAnalysis = {
      scene: mockScene,
      tasks: demoTasks,
      family: "cafe",
      businessType: jobsOut.business_type,
      hoursPerWeek: defaultPreset.defaultHoursPerWeek,
      hourlyCost: defaultPreset.defaultHourlyCost,
      baselineHourlyCost: defaultPreset.defaultHourlyCost,
    };
    return { analysis, jobs: jobsOut, plan: planOut };
  }

  const preset = findPreset(rawType);
  const auto = isAutoDetect(rawType);
  const hoursPerWeek =
    options?.hoursPerWeek &&
    options.hoursPerWeek > 0 &&
    options.hoursPerWeek <= 168
      ? options.hoursPerWeek
      : (preset?.defaultHoursPerWeek ?? demoMeta.hoursPerWeek);
  const hourlyCost =
    options?.hourlyCost && options.hourlyCost > 0
      ? options.hourlyCost
      : (preset?.defaultHourlyCost ?? demoMeta.hourlyCost);
  const baselineHourlyCost =
    options?.baselineHourlyCost ?? preset?.defaultHourlyCost ?? hourlyCost;

  const label = auto
    ? "Auto-detected venue (Commercial Lobby)"
    : (preset?.label ?? rawType ?? demoMeta.businessType);

  const scene: Scene = auto
    ? AUTO_DETECT_DEMO_SCENE
    : preset
      ? preset.demoScene
      : buildCustomDemoScene(label);

  const family: BusinessKind =
    preset?.family ?? (auto ? "generic" : detectBusiness(label));
  const { tasks, ratings } = tasksFromZones(
    scene,
    [],
    hoursPerWeek,
    auto ? "" : label,
    family,
  );
  const built = buildJobs({
    tasks,
    scene,
    businessType: label,
    hoursPerWeek,
    hourlyCost,
    baselineHourlyCost,
    shiftsOverride: options?.shiftsOverride ?? null,
    ratings,
  });

  if (!built.ok) {
    const analysis: StoredAnalysis = {
      scene: mockScene,
      tasks: demoTasks,
      businessType: label,
      hoursPerWeek,
      hourlyCost,
      baselineHourlyCost,
      shiftsOverride: options?.shiftsOverride ?? null,
    };
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
    baselineHourlyCost,
    shiftsOverride: options?.shiftsOverride ?? null,
  };
  return { analysis, jobs: built.jobs, plan: built.plan };
}

export function startDemo(options?: DemoOptions): void {
  clearRunStorage({ keepUpload: true });
  const { analysis, jobs, plan } = buildDemoData(options);
  sessionStorage.setItem(ANALYSIS_STORAGE_KEY, JSON.stringify(analysis));
  sessionStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  sessionStorage.setItem(PLAN_STORAGE_KEY, JSON.stringify(plan));
}
