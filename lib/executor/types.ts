import type {
  Job,
  RobotPlan,
  Scenario,
  ScenarioStep,
  Scene,
  Zone,
} from "@/types/contracts";

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
  /** Business type label (used for floor material and UI badge) */
  businessType: string;
  /** Matched job metadata (title, gross savings in €, etc.) */
  job: Job;
  /** Full robot shift plan (net savings in €, payback months, included job_ids) */
  plan: RobotPlan;
  /** Sanitized steps for the full scenario via filterValidSteps */
  steps: ScenarioStep[];
  source: "custom" | "mock";
}

export interface WalkTargetInfo {
  zone: Zone;
  stopPoint: Vec2XZ;
  /** Waypoints to reach stopPoint (1 point if direct, 2 points if bypassing obstacle furniture) */
  waypoints: Vec2XZ[];
  lookAtAngle: number;
}
