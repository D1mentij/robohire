"use client";

import { useSyncExternalStore } from "react";
import { mockScenario, mockScene } from "@/mocks";
import {
  filterValidSteps,
  isScenario,
  isScene,
  type Scenario,
  type Scene,
} from "@/types/contracts";
import type { LoadedSimulationData } from "./types";

export const SCENE_STORAGE_KEYS = ["robohire:scene", "scene"] as const;
export const SCENARIO_STORAGE_KEYS = ["robohire:scenario", "scenario"] as const;

function tryParseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function readFromStorage(keys: readonly string[]): unknown {
  if (typeof window === "undefined") return null;
  for (const key of keys) {
    try {
      const fromLocal = tryParseJson(window.localStorage.getItem(key));
      if (fromLocal !== null) return fromLocal;
      const fromSession = tryParseJson(window.sessionStorage.getItem(key));
      if (fromSession !== null) return fromSession;
    } catch {
      // Ignore storage access errors
    }
  }
  return null;
}

/**
 * Loads `scene` and `scenario` from URL query params (`?scene=...&scenario=...`)
 * or browser storage (`localStorage` / `sessionStorage` keys `robohire:scene`,
 * `robohire:scenario`, `scene`, `scenario`), falling back cleanly to `mockScene`
 * and `mockScenario`. Always sanitizes steps with `filterValidSteps()`.
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

  if (!isScene(candidateScene)) {
    candidateScene = readFromStorage(SCENE_STORAGE_KEYS);
  }
  if (!isScenario(candidateScenario)) {
    candidateScenario = readFromStorage(SCENARIO_STORAGE_KEYS);
  }

  const hasCustomScene = isScene(candidateScene);
  const hasCustomScenario = isScenario(candidateScenario);

  const scene: Scene = isScene(candidateScene) ? candidateScene : mockScene;
  const scenario: Scenario = isScenario(candidateScenario)
    ? candidateScenario
    : mockScenario;
  const source: "custom" | "mock" =
    hasCustomScene || hasCustomScenario ? "custom" : "mock";

  const zoneIds = scene.zones.map((z) => z.id);
  const steps = filterValidSteps(scenario.steps, zoneIds);

  return {
    scene,
    scenario,
    steps,
    source,
  };
}

const SERVER_SNAPSHOT: LoadedSimulationData = loadSimulationData(null);
let cachedClientKey = "";
let cachedClientSnapshot: LoadedSimulationData = SERVER_SNAPSHOT;

function getClientSnapshot(): LoadedSimulationData {
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  let key = window.location.search;
  try {
    for (const k of [...SCENE_STORAGE_KEYS, ...SCENARIO_STORAGE_KEYS]) {
      key += `|${window.localStorage.getItem(k) ?? ""}|${window.sessionStorage.getItem(k) ?? ""}`;
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
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener("popstate", callback);
  };
}

export function useSimulationData(): LoadedSimulationData {
  return useSyncExternalStore(
    subscribeToStorage,
    getClientSnapshot,
    getServerSnapshot,
  );
}
