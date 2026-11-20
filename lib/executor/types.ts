import type { Scenario, ScenarioStep, Scene, Zone } from "@/types/contracts";

export interface Vec2XZ {
  x: number;
  z: number;
}

export type RobotAnimationName = "Idle" | "Walking" | "Wave";

export type ExecutorStatus = "idle" | "running" | "completed";

export type StepPhase = "idle" | "rotating" | "walking" | "settling";

export interface RobotPose {
  x: number;
  z: number;
  rotationY: number;
  animation: RobotAnimationName;
}

export interface LoadedSimulationData {
  scene: Scene;
  scenario: Scenario;
  /** Sanitized steps for the full scenario via filterValidSteps */
  validScenarioSteps: ScenarioStep[];
  /** Stage 1 executable walk_to sequence (start -> entrance -> counter by default) */
  walkSteps: ScenarioStep[];
  source: "custom" | "mock";
}

export interface WalkTargetInfo {
  zone: Zone;
  stopPoint: Vec2XZ;
  lookAtAngle: number;
}
