"use client";

import { useSyncExternalStore } from "react";
import { mockJobs, mockScenario, mockScene } from "@/mocks";
import {
  filterValidSteps,
  isJob,
  isJobsResult,
  isRobotPlan,
  isScenario,
  isScene,
  type Job,
  type JobsResult,
  type RobotPlan,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { buildPlan } from "@/lib/roi/roi";
import {
  ANALYSIS_STORAGE_KEY,
  JOBS_STORAGE_KEY,
  PLAN_STORAGE_KEY,
} from "@/lib/ai/types";
import type { LoadedSimulationData } from "./types";

export const SCENE_STORAGE_KEYS = ["robohire:scene", "scene"] as const;
export const SCENARIO_STORAGE_KEYS = ["robohire:scenario", "scenario"] as const;
export const JOB_STORAGE_KEYS = ["robohire:job", "job"] as const;
export const JOBS_LIST_STORAGE_KEYS = [JOBS_STORAGE_KEY, "jobs"] as const;
export const PLAN_STORAGE_KEYS = [PLAN_STORAGE_KEY, "plan"] as const;

const DEFAULT_HOURLY_COST = 8.5;
const DEFAULT_MOCK_PLAN: RobotPlan = buildPlan(
  mockJobs.jobs,
  DEFAULT_HOURLY_COST,
);

function tryParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reads handoff data from `sessionStorage` first, falling back to `localStorage`
 * only when no newer run exists in `sessionStorage`.
 */
function readFromSessionStorage(keys: readonly string[]): unknown {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    try {
      const fromSession = tryParseJson(window.sessionStorage.getItem(key));
      if (fromSession !== null) return fromSession;
    } catch {
      // Ignore storage access errors
    }
  }
  const hasSessionRun =
    window.sessionStorage.getItem(ANALYSIS_STORAGE_KEY) !== null ||
    window.sessionStorage.getItem(JOBS_STORAGE_KEY) !== null;
  if (!hasSessionRun) {
    for (const key of keys) {
      try {
        const fromLocal = tryParseJson(window.localStorage.getItem(key));
        if (fromLocal !== null) return fromLocal;
      } catch {
        // Ignore storage access errors
      }
    }
  }
  return null;
}

/** Clears stale simulation handoff keys from both sessionStorage and legacy localStorage. */
export function clearHandoffStorage(): void {
  if (typeof window === "undefined") return;
  for (const key of [
    ...SCENE_STORAGE_KEYS,
    ...SCENARIO_STORAGE_KEYS,
    ...JOB_STORAGE_KEYS,
  ]) {
    try {
      window.sessionStorage.removeItem(key);
      window.localStorage.removeItem(key);
    } catch {
      // Ignore storage errors
    }
  }
}

function buildGenericScenarioForJob(job: Job, scene: Scene): Scenario {
  const zoneIds = scene.zones.map((z) => z.id);
  const firstZone = scene.zones[0]?.id;
  const secondZone = scene.zones[1]?.id ?? firstZone;
  const steps: ScenarioStep[] = firstZone
    ? [
        { action: "walk_to", target: firstZone },
        { action: "wave" },
        {
          action: "say",
          text: `Hello! I am performing the ${job.title} role.`,
        },
        ...(secondZone
          ? ([
              { action: "turn_to", target: secondZone },
              { action: "point_to", target: secondZone },
            ] as ScenarioStep[])
          : []),
        { action: "wait", seconds: 2 },
        {
          action: "say",
          text: "Please let our team know if you need further assistance.",
        },
      ]
    : [{ action: "wave" }];
  return {
    job_id: job.id,
    steps: filterValidSteps(steps, zoneIds),
  };
}

/**
 * Loads `scene`, `scenario`, `job`, and `plan` from URL query params or
 * `sessionStorage`, falling back cleanly to `mockScene`, `mockScenario`,
 * `mockJobs`, and `DEFAULT_MOCK_PLAN`. Always sanitizes steps with `filterValidSteps()`.
 */
export function loadSimulationData(
  searchParams?: URLSearchParams | null,
): LoadedSimulationData {
  let candidateScene: unknown = null;
  let candidateScenario: unknown = null;

  if (searchParams) {
    candidateScene = tryParseJson(searchParams.get("scene"));
    candidateScenario = tryParseJson(searchParams.get("scenario"));
  }

  const storedJobsRaw = readFromSessionStorage(JOBS_LIST_STORAGE_KEYS);
  const currentJobsResult: JobsResult = isJobsResult(storedJobsRaw)
    ? storedJobsRaw
    : mockJobs;
  const currentJobIds = new Set(currentJobsResult.jobs.map((j) => j.id));

  const storedPlanRaw = readFromSessionStorage(PLAN_STORAGE_KEYS);
  const plan: RobotPlan = isRobotPlan(storedPlanRaw)
    ? storedPlanRaw
    : buildPlan(currentJobsResult.jobs, DEFAULT_HOURLY_COST);

  const storedAnalysisRaw = readFromSessionStorage([ANALYSIS_STORAGE_KEY]);
  const analysisScene =
    typeof storedAnalysisRaw === "object" &&
    storedAnalysisRaw !== null &&
    "scene" in storedAnalysisRaw &&
    isScene((storedAnalysisRaw as { scene?: unknown }).scene)
      ? (storedAnalysisRaw as { scene: Scene }).scene
      : null;
  const analysisBusinessType =
    typeof storedAnalysisRaw === "object" &&
    storedAnalysisRaw !== null &&
    "businessType" in storedAnalysisRaw &&
    typeof (storedAnalysisRaw as { businessType?: unknown }).businessType ===
      "string"
      ? (storedAnalysisRaw as { businessType: string }).businessType
      : null;

  const businessType =
    (isJobsResult(storedJobsRaw) ? storedJobsRaw.business_type : null) ??
    analysisBusinessType ??
    mockJobs.business_type;

  if (!isScene(candidateScene)) {
    candidateScene = readFromSessionStorage(SCENE_STORAGE_KEYS) ?? analysisScene;
  }
  if (!isScenario(candidateScenario)) {
    candidateScenario = readFromSessionStorage(SCENARIO_STORAGE_KEYS);
  }

  // Guard against stale scenario whose job_id is not in the current robohire:jobs list (allow whole-plan "shift")
  if (
    isScenario(candidateScenario) &&
    isJobsResult(storedJobsRaw) &&
    candidateScenario.job_id !== "shift" &&
    !currentJobIds.has(candidateScenario.job_id)
  ) {
    candidateScenario = null;
  }

  const hasCustomScene = isScene(candidateScene);
  const scene: Scene = isScene(candidateScene) ? candidateScene : mockScene;

  const storedJobRaw = readFromSessionStorage(JOB_STORAGE_KEYS);
  const validStoredJob =
    isJob(storedJobRaw) && currentJobIds.has(storedJobRaw.id)
      ? storedJobRaw
      : null;

  let job: Job =
    validStoredJob ??
    currentJobsResult.jobs.find((j) => j.id === plan.job_ids[0]) ??
    currentJobsResult.jobs.find((j) => j.fit !== "no") ??
    currentJobsResult.jobs[0] ??
    mockJobs.jobs[0];

  let scenario: Scenario;
  let hasCustomScenario = false;
  if (isScenario(candidateScenario)) {
    scenario = candidateScenario;
    hasCustomScenario = true;
    const matchedJob = currentJobsResult.jobs.find(
      (j) => j.id === scenario.job_id,
    );
    if (matchedJob) {
      job = matchedJob;
    }
  } else if (
    currentJobsResult !== mockJobs &&
    !mockJobs.jobs.some((mj) => mj.id === job.id)
  ) {
    scenario = buildGenericScenarioForJob(job, scene);
    hasCustomScenario = true;
  } else {
    scenario = mockScenario;
  }

  const zoneIds = scene.zones.map((z) => z.id);
  let steps = filterValidSteps(scenario.steps, zoneIds);
  if (steps.length === 0 && scene.zones.length > 0) {
    scenario = buildGenericScenarioForJob(job, scene);
    steps = scenario.steps;
  }

  const source: "custom" | "mock" =
    hasCustomScene || hasCustomScenario || isJobsResult(storedJobsRaw)
      ? "custom"
      : "mock";

  return {
    scene,
    scenario,
    businessType,
    job,
    plan,
    steps,
    source,
  };
}

export function loadDefaultMockSimulationData(): LoadedSimulationData {
  const zoneIds = mockScene.zones.map((z) => z.id);
  const steps = filterValidSteps(mockScenario.steps, zoneIds);
  const job =
    mockJobs.jobs.find((j) => j.id === mockScenario.job_id) ?? mockJobs.jobs[0];
  return {
    scene: mockScene,
    scenario: mockScenario,
    businessType: mockJobs.business_type,
    job,
    plan: DEFAULT_MOCK_PLAN,
    steps,
    source: "mock",
  };
}

const SERVER_SNAPSHOT: LoadedSimulationData = loadDefaultMockSimulationData();
let cachedClientKey = "";
let cachedClientSnapshot: LoadedSimulationData = SERVER_SNAPSHOT;

function getClientSnapshot(): LoadedSimulationData {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  let key = window.location.search;
  try {
    for (const k of [
      ...SCENE_STORAGE_KEYS,
      ...SCENARIO_STORAGE_KEYS,
      ...JOB_STORAGE_KEYS,
      ...JOBS_LIST_STORAGE_KEYS,
      ...PLAN_STORAGE_KEYS,
      ANALYSIS_STORAGE_KEY,
    ]) {
      key += `|${window.sessionStorage.getItem(k) ?? ""}`;
    }
  } catch {
    // Ignore storage access errors
  }
  if (key !== cachedClientKey) {
    cachedClientKey = key;
    cachedClientSnapshot = loadSimulationData(
      new URLSearchParams(window.location.search),
    );
  }
  return cachedClientSnapshot;
}

function getServerSnapshot(): LoadedSimulationData {
  return SERVER_SNAPSHOT;
}

function subscribeToStorage(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener("popstate", callback);
  window.addEventListener("robohire:storage", callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
    window.removeEventListener("robohire:storage", callback);
  };
}

export function useSimulationData(): LoadedSimulationData {
  return useSyncExternalStore(
    subscribeToStorage,
    getClientSnapshot,
    getServerSnapshot,
  );
}
