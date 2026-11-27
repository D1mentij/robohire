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
  /** True when the active simulation is the primary Booster K1 EDU humanoid */
  isK1: boolean;
  /** Active commercial robot ID when `isK1` is false */
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
