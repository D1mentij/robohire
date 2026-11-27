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
  type RobotType,
  type Scenario,
  type ScenarioStep,
  type Scene,
} from "@/types/contracts";
import { K1_ID, K1_JOB_ID } from "@/src/data/k1";
import { buildK1Job } from "@/lib/roi/k1";
import { buildPlan } from "@/lib/roi/roi";
import { finalizeSteps, shortLabel } from "@/lib/ai/labels";
import { buildRobotScenario, inferRobotType } from "@/lib/robots/catalog";
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

const DEFAULT_HOURLY_COST = 9.24;

/**
 * Detects Booster K1 EDU strictly by `job.id === K1_JOB_ID` (or `robot_id` / future `robot_type`),
 * never passing K1 through `inferRobotType`.
 */
export function isK1Job(
  job: Pick<Job, "id" | "robot_type"> | null | undefined,
): boolean {
  if (!job) return false;
  if (job.id === K1_JOB_ID) return true;
  const extraId = (job as { robot_id?: unknown }).robot_id;
  if (extraId === K1_ID) return true;
  if ((job.robot_type as string | undefined) === K1_ID) return true;
  return false;
}

/**
 * Builds an authentic Booster K1 EDU humanoid scenario (greeter & guide — walks,
 * waves, points at info, guides visitors; no hands, no chest screen).
 */
export function buildK1Scenario(job: Job, scene: Scene): Scenario {
  const zones = scene.zones;
  const zoneIds = zones.map((z) => z.id);
  const fallbackLabel = "Greet visitors";

  if (zones.length === 0) {
    return {
      job_id: job.id,
      steps: finalizeSteps([{ action: "wait", seconds: 2 }], fallbackLabel),
    };
  }

  const pickZone = (re: RegExp, fallbackIdx = 0) =>
    zones.find((z) => re.test(`${z.id} ${z.label}`)) ??
    zones[fallbackIdx % zones.length];

  const entry = pickZone(/entrance|door|foyer|lobby/i, 0);
  const info = pickZone(/display|menu|board|promo|desk|counter|reception/i, 1);
  const dest = pickZone(/seat|table|lounge|waiting|corridor|shelves/i, 2);

  const rawSteps: ScenarioStep[] = [
    { action: "walk_to", target: entry.id, label: "Greet at entrance" },
    { action: "wave", label: "Greet at entrance" },
    {
      action: "say",
      text: "Welcome! I can guide you inside.",
      label: "Greet at entrance",
    },
    { action: "walk_to", target: info.id, label: "Point to info" },
    { action: "point_to", target: info.id, label: "Point to info" },
    {
      action: "say",
      text: "Key venue details are right here.",
      label: "Point to info",
    },
    { action: "walk_to", target: dest.id, label: "Guide visitors" },
    { action: "point_to", target: dest.id, label: "Guide visitors" },
    {
      action: "say",
      text: "Right this way. Enjoy your visit!",
      label: "Guide visitors",
    },
  ];

  return {
    job_id: job.id,
    steps: finalizeSteps(filterValidSteps(rawSteps, zoneIds), fallbackLabel),
  };
}

function tryParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Reads handoff keys from `sessionStorage` only. localStorage is NOT read:
 * it kept robohire:scene|scenario from a previous run (stale data).
 */
function readStorageKey(keys: readonly string[]): unknown {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    try {
      const fromSession = tryParseJson(window.sessionStorage.getItem(key));
      if (fromSession !== null) return fromSession;
    } catch {
      // Ignore storage access errors
    }
  }
  return null;
}

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

export function loadSimulationData(
  searchParams?: URLSearchParams | null,
): LoadedSimulationData {
  let candidateScene: unknown = null;
  let candidateScenario: unknown = null;

  if (searchParams) {
    candidateScene = tryParseJson(searchParams.get("scene"));
    candidateScenario = tryParseJson(searchParams.get("scenario"));
  }

  const storedJobsRaw = readStorageKey(JOBS_LIST_STORAGE_KEYS);
  const currentJobsResult: JobsResult = isJobsResult(storedJobsRaw)
    ? storedJobsRaw
    : {
        business_type: mockJobs.business_type,
        jobs: [buildK1Job(mockScene), ...mockJobs.jobs],
      };

  const storedPlanRaw = readStorageKey(PLAN_STORAGE_KEYS);
  const plan: RobotPlan = isRobotPlan(storedPlanRaw)
    ? storedPlanRaw
    : buildPlan(currentJobsResult.jobs, DEFAULT_HOURLY_COST);

  const storedAnalysisRaw = readStorageKey([ANALYSIS_STORAGE_KEY]);
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
    candidateScene = readStorageKey(SCENE_STORAGE_KEYS) ?? analysisScene;
  }
  if (!isScenario(candidateScenario)) {
    candidateScenario = readStorageKey(SCENARIO_STORAGE_KEYS);
  }

  const storedJobRaw = readStorageKey(JOB_STORAGE_KEYS);
  const validStoredJob = isJob(storedJobRaw) ? storedJobRaw : null;

  const validCustomScene: Scene | null =
    isScene(candidateScene) &&
    candidateScene.room.width > 0 &&
    candidateScene.room.depth > 0 &&
    candidateScene.zones.length > 0
      ? candidateScene
      : null;
  const hasCustomScene = validCustomScene !== null;
  const scene: Scene = validCustomScene ?? mockScene;

  let job: Job =
    validStoredJob ??
    currentJobsResult.jobs.find((j) => isK1Job(j)) ??
    currentJobsResult.jobs.find((j) => j.id === plan.job_ids[0]) ??
    currentJobsResult.jobs.find((j) => j.fit !== "no") ??
    currentJobsResult.jobs[0] ??
    buildK1Job(scene);

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
    } else if (
      scenario.job_id === K1_JOB_ID ||
      scenario.job_id === "shift"
    ) {
      job = currentJobsResult.jobs.find((j) => isK1Job(j)) ?? buildK1Job(scene);
    }
  } else if (isK1Job(job)) {
    scenario = buildK1Scenario(job, scene);
    hasCustomScenario = hasCustomScene || validStoredJob !== null;
  } else if (hasCustomScene || validStoredJob) {
    scenario = buildRobotScenario(inferRobotType(job), job, scene);
    hasCustomScenario = true;
  } else {
    scenario = mockScenario;
  }

  const activeIsK1 =
    isK1Job(job) ||
    scenario.job_id === K1_JOB_ID ||
    scenario.job_id === "shift";
  const fallbackRobotType: RobotType = activeIsK1
    ? "temi"
    : inferRobotType(job);

  const zoneIds = scene.zones.map((z) => z.id);
  let steps = filterValidSteps(scenario.steps, zoneIds);
  if (steps.length === 0) {
    if (scene.zones.length > 0) {
      scenario = activeIsK1
        ? buildK1Scenario(job, scene)
        : buildRobotScenario(fallbackRobotType, job, scene);
      steps = scenario.steps;
    } else {
      scenario = buildK1Scenario(buildK1Job(mockScene), mockScene);
      steps = scenario.steps;
      hasCustomScenario = false;
    }
  } else {
    const needsLabels = steps.some((s) => !s.label || !s.label.trim());
    if (needsLabels) {
      steps = finalizeSteps(steps, shortLabel(job.title));
    }
  }

  const sanitizedScenario: Scenario = { ...scenario, steps };

  const source: "custom" | "mock" =
    hasCustomScene || hasCustomScenario || isJobsResult(storedJobsRaw)
      ? "custom"
      : "mock";

  return {
    scene:
      steps.length > 0 && scenario === mockScenario && !hasCustomScene
        ? mockScene
        : scene,
    scenario: sanitizedScenario,
    businessType,
    job,
    isK1: activeIsK1,
    robotType: fallbackRobotType,
    plan,
    steps,
    source,
  };
}

export function loadDefaultMockSimulationData(): LoadedSimulationData {
  const k1Job = buildK1Job(mockScene);
  const scenario = buildK1Scenario(k1Job, mockScene);
  const plan = buildPlan([k1Job, ...mockJobs.jobs], DEFAULT_HOURLY_COST);
  return {
    scene: mockScene,
    scenario,
    businessType: mockJobs.business_type,
    job: k1Job,
    isK1: true,
    robotType: "temi",
    plan,
    steps: scenario.steps,
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
