import type {
  Job,
  RobotPlan,
  RobotType,
  Scenario,
  ScenarioStep,
  Scene,
  Zone,
} from "@/types/contracts";

export interface Vec2XZ {
  x: number;
  z: number;
}

export type RobotAnimationName = "Idle" | "Walking" | "Wave" | "Yes";

export type ExecutorStatus = "idle" | "running" | "completed";

export type StepPhase =
  | "idle"
  | "rotating"
  | "walking"
  | "waving"
  | "pointing"
  | "caption"
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
  /** Hired commercial robot job metadata (RaaS, Latvia staff cost, savings) */
  job: Job;
  /** Active commercial robot ID from the 15-robot catalog */
  robotType: RobotType;
  /** Deployment plan summary */
  plan: RobotPlan;
  /** Sanitized steps via filterValidSteps */
  steps: ScenarioStep[];
  source: "custom" | "mock";
}

export interface WalkTargetInfo {
  zone: Zone;
  stopPoint: Vec2XZ;
  waypoints: Vec2XZ[];
  lookAtAngle: number;
}
