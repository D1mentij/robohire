import type { Job, Scenario, ScenarioStep, Scene, Zone } from "@/types/contracts";

export interface Vec2XZ {
  x: number;
  z: number;
}

export type RobotAnimationName = "Idle" | "Walking" | "Wave";

export type ExecutorStatus = "idle" | "running" | "completed";

export type StepPhase =
  | "idle"
  | "rotating"
  | "walking"
  | "waving"
  | "pointing"
  | "speaking"
  | "waiting";

export interface RobotPose {
  x: number;
  z: number;
  rotationY: number;
  animation: RobotAnimationName;
  isPointing: boolean;
  pointTarget: Vec2XZ | null;
}

export interface LoadedSimulationData {
  scene: Scene;
  scenario: Scenario;
  /** Matched job metadata (title, monthly savings in €, etc.) */
  job: Job;
  /** Sanitized steps for the full scenario via filterValidSteps */
  steps: ScenarioStep[];
  source: "custom" | "mock";
}

export interface WalkTargetInfo {
  zone: Zone;
  stopPoint: Vec2XZ;
  lookAtAngle: number;
}
