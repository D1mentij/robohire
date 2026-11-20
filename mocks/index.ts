import type { JobsResult, Scenario, Scene } from "../types/contracts";
import sceneJson from "./scene.json";
import jobsJson from "./jobs.json";
import scenarioJson from "./scenario.json";

export const mockScene: Scene = sceneJson as Scene;
export const mockJobs: JobsResult = jobsJson as JobsResult;
export const mockScenario: Scenario = scenarioJson as Scenario;
