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
  type Scene,
} from "@/types/contracts";
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
    : mockJobs;

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
    currentJobsResult.jobs.find((j) => j.id === plan.job_ids[0]) ??
    currentJobsResult.jobs.find((j) => j.fit !== "no") ??
    currentJobsResult.jobs[0] ??
    mockJobs.jobs[0];

  const robotType: RobotType = inferRobotType(job);

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
  } else if (hasCustomScene || validStoredJob) {
    scenario = buildRobotScenario(robotType, job, scene);
    hasCustomScenario = true;
  } else {
    scenario = mockScenario;
  }

  const zoneIds = scene.zones.map((z) => z.id);
  let steps = filterValidSteps(scenario.steps, zoneIds);
  if (steps.length === 0) {
    if (hasCustomScene && scene.zones.length > 0) {
      scenario = buildRobotScenario(robotType, job, scene);
      steps = scenario.steps;
    } else {
      const mockZoneIds = mockScene.zones.map((z) => z.id);
      scenario = mockScenario;
      steps = finalizeSteps(
        filterValidSteps(mockScenario.steps, mockZoneIds),
        shortLabel(job.title),
      );
      hasCustomScenario = false;
    }
  } else {
    const needsLabels = steps.some((s) => !s.label || !s.label.trim());
    if (needsLabels) {
      steps = finalizeSteps(steps, shortLabel(job.title));
    }
  }

  const sanitizedScenario: Scenario = { ...scenario, steps };
  const finalRobotType: RobotType = inferRobotType(job);

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
    robotType: finalRobotType,
    plan,
    steps,
    source,
  };
}

export function loadDefaultMockSimulationData(): LoadedSimulationData {
  const zoneIds = mockScene.zones.map((z) => z.id);
  const job =
    mockJobs.jobs.find((j) => j.id === mockScenario.job_id) ?? mockJobs.jobs[0];
  const steps = finalizeSteps(
    filterValidSteps(mockScenario.steps, zoneIds),
    shortLabel(job.title),
  );
  return {
    scene: mockScene,
    scenario: { ...mockScenario, steps },
    businessType: mockJobs.business_type,
    job,
    robotType: inferRobotType(job),
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
